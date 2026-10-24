import { NormalizedBook, NormalizedNote, ReadestBook, ReadestBookConfig, ReadestBookNote, ReadestNavChapter } from '../types/readest';
import { getHighlightColorInfo } from '../utils/colorUtils';
import { isNodeAvailable, checkReadestPath } from '../utils/pathUtils';

export class LocalFolderParser {
  private dataPath: string;

  constructor(dataPath: string) {
    this.dataPath = dataPath;
  }

  public async parse(): Promise<NormalizedBook[]> {
    if (!isNodeAvailable()) {
      throw new Error('Local folder scanning is only available on desktop platforms.');
    }

    const pathInfo = checkReadestPath(this.dataPath);
    if (!pathInfo.isValid) {
      throw new Error(`Invalid Readest data path: "${this.dataPath}". Could not find library.json.`);
    }

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs = require('fs');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const path = require('path');

    let booksData: ReadestBook[] = [];
    try {
      const raw = fs.readFileSync(pathInfo.libraryJsonPath, 'utf8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        booksData = parsed;
      } else if (parsed && Array.isArray(parsed.books)) {
        booksData = parsed.books;
      }
    } catch (e) {
      throw new Error(`Failed to read or parse library.json: ${(e as Error).message}`);
    }

    const normalizedBooks: NormalizedBook[] = [];

    for (const book of booksData) {
      // Skip deleted books
      if (book.deletedAt) {
        continue;
      }

      const bookHash = book.hash;
      const bookDir = path.join(pathInfo.booksPath, bookHash);

      let config: ReadestBookConfig | null = null;
      let coverBuffer: Uint8Array | undefined = undefined;
      let coverExt = 'png';
      const chapterMap = new Map<string, string>();

      if (fs.existsSync(bookDir)) {
        // 1. Read config.json
        const configPath = path.join(bookDir, 'config.json');
        if (fs.existsSync(configPath)) {
          try {
            const rawConfig = fs.readFileSync(configPath, 'utf8');
            config = JSON.parse(rawConfig);
          } catch (err) {
            console.warn(`[ReadestSync] Failed to parse config.json for ${book.title}:`, err);
          }
        }

        // 2. Read nav.json for chapter titles
        const navPath = path.join(bookDir, 'nav.json');
        if (fs.existsSync(navPath)) {
          try {
            const rawNav = fs.readFileSync(navPath, 'utf8');
            const nav = JSON.parse(rawNav);
            this.extractNavChapters(nav, chapterMap);
          } catch (err) {
            console.warn(`[ReadestSync] Failed to parse nav.json for ${book.title}:`, err);
          }
        }

        // 3. Read cover.png or cover.jpg
        const coverPng = path.join(bookDir, 'cover.png');
        const coverJpg = path.join(bookDir, 'cover.jpg');
        if (fs.existsSync(coverPng)) {
          try {
            coverBuffer = new Uint8Array(fs.readFileSync(coverPng));
            coverExt = 'png';
          } catch {
            // Ignored
          }
        } else if (fs.existsSync(coverJpg)) {
          try {
            coverBuffer = new Uint8Array(fs.readFileSync(coverJpg));
            coverExt = 'jpg';
          } catch {
            // Ignored
          }
        }
      }

      // Collect notes from config
      const rawNotes: ReadestBookNote[] = config?.booknotes ?? [];
      const notes: NormalizedNote[] = [];

      for (const note of rawNotes) {
        if (note.deletedAt) continue;

        const colorInfo = getHighlightColorInfo(note.color);
        const resolvedChapter = this.resolveChapter(note.cfi, chapterMap);

        notes.push({
          id: note.id,
          type: note.type || 'annotation',
          text: (note.text || '').trim(),
          note: (note.note || '').trim(),
          color: colorInfo.name,
          colorHex: colorInfo.hex,
          style: note.style || 'highlight',
          chapterTitle: resolvedChapter,
          cfi: note.cfi,
          page: note.page,
          timestamp: note.updatedAt || note.createdAt || 0,
          url: note.cfi ? `readest://book/${bookHash}/cfi/${encodeURIComponent(note.cfi)}` : undefined,
        });
      }

      // Sort notes by timestamp or page/CFI
      notes.sort((a, b) => {
        if (a.page !== undefined && b.page !== undefined && a.page !== b.page) {
          return a.page - b.page;
        }
        return a.timestamp - b.timestamp;
      });

      // Reading progress calculation
      let currentProgress: number | undefined;
      let totalProgress: number | undefined;
      let progressPercent: number | undefined;

      const progressArr = book.progress || (Array.isArray(config?.progress) ? config?.progress : null);
      if (Array.isArray(progressArr) && progressArr.length >= 2) {
        currentProgress = progressArr[0];
        totalProgress = progressArr[1];
        if (totalProgress > 0) {
          progressPercent = Math.min(100, Math.round((currentProgress / totalProgress) * 100));
        }
      }

      // Determine reading status
      let status: 'unread' | 'reading' | 'finished' | 'abandoned' = 'unread';
      if (book.readingStatus) {
        const s = book.readingStatus.toLowerCase();
        if (s === 'reading' || s === 'finished' || s === 'abandoned' || s === 'unread') {
          status = s;
        }
      } else if (progressPercent !== undefined) {
        if (progressPercent >= 99) {
          status = 'finished';
        } else if (progressPercent > 0) {
          status = 'reading';
        }
      }

      const chaptersList: Array<{ title: string; href: string }> = [];
      chapterMap.forEach((title, href) => chaptersList.push({ title, href }));

      normalizedBooks.push({
        hash: bookHash,
        title: book.title || book.sourceTitle || 'Untitled Book',
        author: book.author || 'Unknown Author',
        format: book.format || 'EPUB',
        readingStatus: status,
        progressCurrent: currentProgress,
        progressTotal: totalProgress,
        progressPercent,
        tags: Array.isArray(book.tags) ? book.tags.filter(Boolean) : [],
        groupName: book.groupName || undefined,
        description: book.metadata?.description,
        coverBuffer,
        coverExt,
        chapters: chaptersList,
        notes,
        createdAt: book.createdAt,
        updatedAt: book.updatedAt,
      });
    }

    return normalizedBooks;
  }

  private extractNavChapters(nav: unknown, chapterMap: Map<string, string>): void {
    if (!nav) return;
    if (Array.isArray(nav)) {
      for (const item of nav) {
        this.extractNavChapters(item, chapterMap);
      }
    } else if (typeof nav === 'object') {
      const item = nav as ReadestNavChapter;
      if (item.href && item.label) {
        chapterMap.set(item.href, item.label.trim());
      }
      if (item.subitems && Array.isArray(item.subitems)) {
        for (const sub of item.subitems) {
          this.extractNavChapters(sub, chapterMap);
        }
      }
    }
  }

  private resolveChapter(cfi: string | undefined, chapterMap: Map<string, string>): string | undefined {
    if (!cfi || chapterMap.size === 0) return undefined;

    // Check if CFI contains a reference to an href in chapterMap
    for (const [href, label] of chapterMap.entries()) {
      // In EPUB CFI, section href or index often aligns with CFI segment
      const cleanHref = href.split('#')[0].replace(/\.[^/.]+$/, '');
      if (cfi.includes(cleanHref)) {
        return label;
      }
    }

    return undefined;
  }
}
