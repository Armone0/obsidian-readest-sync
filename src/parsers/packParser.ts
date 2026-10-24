import { unzipSync } from 'fflate';
import { NormalizedBook, NormalizedNote, ReadestBook, ReadestBookConfig, ReadestBookNote, ReadestPackManifest } from '../types/readest';
import { getHighlightColorInfo } from '../utils/colorUtils';
import { isNodeAvailable } from '../utils/pathUtils';

export class PackParser {
  /**
   * Parse a .readestpack, .rbooks, or Readest .zip backup from a binary Uint8Array or ArrayBuffer.
   */
  public static async parseBuffer(buffer: ArrayBuffer | Uint8Array, fileName?: string): Promise<NormalizedBook[]> {
    const uint8 = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    let unzipped: Record<string, Uint8Array>;

    try {
      unzipped = unzipSync(uint8);
    } catch (e) {
      throw new Error(`Failed to decompress Readest pack archive: ${(e as Error).message}`);
    }

    return PackParser.processUnzippedFiles(unzipped, fileName);
  }

  /**
   * Parse a .readestpack file from disk (desktop only).
   */
  public static async parseFilePath(filePath: string): Promise<NormalizedBook[]> {
    if (!isNodeAvailable()) {
      throw new Error('Reading pack file from disk path is only supported on desktop.');
    }

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs = require('fs');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const path = require('path');

    if (!fs.existsSync(filePath)) {
      throw new Error(`Pack file not found: ${filePath}`);
    }

    const buffer = fs.readFileSync(filePath);
    return PackParser.parseBuffer(new Uint8Array(buffer), path.basename(filePath));
  }

  private static processUnzippedFiles(
    files: Record<string, Uint8Array>,
    sourceName?: string
  ): NormalizedBook[] {
    const textDecoder = new TextDecoder('utf-8');

    // Look for manifest.json / readest-manifest.json or library.json
    let libraryBooks: ReadestBook[] = [];
    let packManifest: ReadestPackManifest | null = null;

    // Normalize file keys with forward slashes and strip leading slashes
    const normalizedFiles: Record<string, Uint8Array> = {};
    for (const [key, val] of Object.entries(files)) {
      const normalizedKey = key.replace(/\\/g, '/').replace(/^\/+/, '');
      normalizedFiles[normalizedKey] = val;
    }

    // Check for readest-manifest.json or manifest.json
    for (const manifestName of ['readest-manifest.json', 'manifest.json']) {
      if (normalizedFiles[manifestName]) {
        try {
          packManifest = JSON.parse(textDecoder.decode(normalizedFiles[manifestName]));
        } catch {
          // Ignored
        }
      }
    }

    // Check for library.json or Books/library.json
    for (const libName of ['library.json', 'Books/library.json']) {
      if (normalizedFiles[libName]) {
        try {
          const parsed = JSON.parse(textDecoder.decode(normalizedFiles[libName]));
          if (Array.isArray(parsed)) {
            libraryBooks = parsed;
          } else if (parsed && Array.isArray(parsed.books)) {
            libraryBooks = parsed.books;
          }
        } catch {
          // Ignored
        }
      }
    }

    // If no library.json found, but we have a manifest with books
    if (libraryBooks.length === 0 && packManifest?.books && Array.isArray(packManifest.books)) {
      for (const mBook of packManifest.books) {
        // Derive a hash or filename key
        const bookHash = mBook.filename.replace(/\.[^/.]+$/, '');
        libraryBooks.push({
          hash: bookHash,
          title: mBook.title,
          author: mBook.author || 'Unknown Author',
          format: mBook.format || 'EPUB',
          tags: mBook.tags,
          groupName: mBook.groupName || packManifest.collection?.name,
        });
      }
    }

    // If still no books found, scan directories for config.json files!
    if (libraryBooks.length === 0) {
      const discoveredHashes = new Set<string>();
      for (const fileKey of Object.keys(normalizedFiles)) {
        if (fileKey.endsWith('/config.json') || fileKey.endsWith('config.json')) {
          const parts = fileKey.split('/');
          const hash = parts.length > 1 ? parts[parts.length - 2] : 'book';
          discoveredHashes.add(hash);
        }
      }

      for (const hash of discoveredHashes) {
        libraryBooks.push({
          hash,
          title: `Book ${hash.substring(0, 8)}`,
          author: 'Unknown Author',
          format: 'EPUB',
        });
      }
    }

    const resultBooks: NormalizedBook[] = [];

    for (const book of libraryBooks) {
      if (book.deletedAt) continue;

      const hash = book.hash;
      let config: ReadestBookConfig | null = null;
      let coverBuffer: Uint8Array | undefined = undefined;
      let coverExt = 'png';
      const chapterMap = new Map<string, string>();

      // Look for config.json under <hash>/config.json or Books/<hash>/config.json
      const configCandidates = [
        `${hash}/config.json`,
        `Books/${hash}/config.json`,
        `books/${hash}/config.json`,
      ];
      for (const cPath of configCandidates) {
        if (normalizedFiles[cPath]) {
          try {
            config = JSON.parse(textDecoder.decode(normalizedFiles[cPath]));
            break;
          } catch {
            // Ignored
          }
        }
      }

      // Look for cover.png / cover.jpg
      const coverCandidates = [
        { path: `${hash}/cover.png`, ext: 'png' },
        { path: `Books/${hash}/cover.png`, ext: 'png' },
        { path: `${hash}/cover.jpg`, ext: 'jpg' },
        { path: `Books/${hash}/cover.jpg`, ext: 'jpg' },
      ];
      for (const c of coverCandidates) {
        if (normalizedFiles[c.path]) {
          coverBuffer = normalizedFiles[c.path];
          coverExt = c.ext;
          break;
        }
      }

      // Look for nav.json
      const navCandidates = [`${hash}/nav.json`, `Books/${hash}/nav.json`];
      for (const nPath of navCandidates) {
        if (normalizedFiles[nPath]) {
          try {
            const nav = JSON.parse(textDecoder.decode(normalizedFiles[nPath]));
            PackParser.extractNavChapters(nav, chapterMap);
            break;
          } catch {
            // Ignored
          }
        }
      }

      // Build notes
      const rawNotes: ReadestBookNote[] = config?.booknotes ?? [];
      const notes: NormalizedNote[] = [];

      for (const note of rawNotes) {
        if (note.deletedAt) continue;

        const colorInfo = getHighlightColorInfo(note.color);
        let chapterTitle: string | undefined = undefined;
        if (note.cfi && chapterMap.size > 0) {
          for (const [href, label] of chapterMap.entries()) {
            const cleanHref = href.split('#')[0].replace(/\.[^/.]+$/, '');
            if (note.cfi.includes(cleanHref)) {
              chapterTitle = label;
              break;
            }
          }
        }

        notes.push({
          id: note.id,
          type: note.type || 'annotation',
          text: (note.text || '').trim(),
          note: (note.note || '').trim(),
          color: colorInfo.name,
          colorHex: colorInfo.hex,
          style: note.style || 'highlight',
          chapterTitle,
          cfi: note.cfi,
          page: note.page,
          timestamp: note.updatedAt || note.createdAt || 0,
          url: note.cfi ? `readest://book/${hash}/cfi/${encodeURIComponent(note.cfi)}` : undefined,
        });
      }

      // Progress calculation
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

      let status: 'unread' | 'reading' | 'finished' | 'abandoned' = 'unread';
      if (book.readingStatus) {
        const s = book.readingStatus.toLowerCase();
        if (s === 'reading' || s === 'finished' || s === 'abandoned' || s === 'unread') {
          status = s;
        }
      } else if (progressPercent !== undefined) {
        if (progressPercent >= 99) status = 'finished';
        else if (progressPercent > 0) status = 'reading';
      }

      resultBooks.push({
        hash,
        title: book.title || 'Untitled Book',
        author: book.author || 'Unknown Author',
        format: book.format || 'EPUB',
        readingStatus: status,
        progressCurrent: currentProgress,
        progressTotal: totalProgress,
        progressPercent,
        tags: Array.isArray(book.tags) ? book.tags.filter(Boolean) : [],
        groupName: book.groupName || undefined,
        coverBuffer,
        coverExt,
        notes,
        createdAt: book.createdAt,
        updatedAt: book.updatedAt,
        sourceFile: sourceName,
      });
    }

    return resultBooks;
  }

  private static extractNavChapters(nav: unknown, chapterMap: Map<string, string>): void {
    if (!nav) return;
    if (Array.isArray(nav)) {
      for (const item of nav) {
        PackParser.extractNavChapters(item, chapterMap);
      }
    } else if (typeof nav === 'object') {
      const item = nav as { href?: string; label?: string; subitems?: unknown[] };
      if (item.href && item.label) {
        chapterMap.set(item.href, item.label.trim());
      }
      if (item.subitems && Array.isArray(item.subitems)) {
        for (const sub of item.subitems) {
          PackParser.extractNavChapters(sub, chapterMap);
        }
      }
    }
  }
}
