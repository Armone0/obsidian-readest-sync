import { NormalizedBook, NormalizedNote, ReadestAnnotationExport } from '../types/readest';
import { getHighlightColorInfo } from '../utils/colorUtils';

export class JsonExportParser {
  /**
   * Parse a JSON export string or object into NormalizedBook[].
   */
  public static parse(jsonContent: string | Record<string, unknown> | Array<unknown>): NormalizedBook[] {
    let data: unknown;
    if (typeof jsonContent === 'string') {
      try {
        data = JSON.parse(jsonContent);
      } catch (e) {
        throw new Error(`Invalid JSON content: ${(e as Error).message}`);
      }
    } else {
      data = jsonContent;
    }

    if (!data || typeof data !== 'object') {
      throw new Error('Parsed JSON is not an object or array.');
    }

    // Case 1: Standard Readest Annotation Export format ($format === 'readest-annotations')
    if (this.isReadestAnnotationExport(data)) {
      return [this.normalizeAnnotationExport(data as ReadestAnnotationExport)];
    }

    // Case 2: Array of items
    if (Array.isArray(data)) {
      // Check if it's an array of ReadestAnnotationExport
      if (data.length > 0 && this.isReadestAnnotationExport(data[0])) {
        return (data as ReadestAnnotationExport[]).map((exp) => this.normalizeAnnotationExport(exp));
      }

      // Check if it's an array of books (like library.json)
      if (data.length > 0 && typeof data[0] === 'object' && ('hash' in data[0] || 'title' in data[0])) {
        return this.normalizeBookArray(data as Record<string, unknown>[]);
      }

      // Check if it's an array of raw annotations
      if (data.length > 0 && typeof data[0] === 'object' && ('text' in data[0] || 'cfi' in data[0] || 'note' in data[0])) {
        return [this.normalizeRawAnnotations(data as Record<string, unknown>[])];
      }
    }

    // Case 3: Object with a "books" array or "annotations" array
    if (typeof data === 'object') {
      const obj = data as Record<string, unknown>;
      if (Array.isArray(obj.books)) {
        return this.normalizeBookArray(obj.books as Record<string, unknown>[]);
      }
      if (Array.isArray(obj.annotations)) {
        return [this.normalizeRawAnnotations(obj.annotations as Record<string, unknown>[], obj.book as Record<string, unknown>)];
      }
    }

    throw new Error('Unsupported JSON structure. Expected a Readest annotation export or library backup.');
  }

  private static isReadestAnnotationExport(obj: unknown): boolean {
    if (!obj || typeof obj !== 'object') return false;
    const r = obj as Record<string, unknown>;
    return r.$format === 'readest-annotations' || (Boolean(r.book) && Array.isArray(r.annotations));
  }

  private static normalizeAnnotationExport(exportData: ReadestAnnotationExport): NormalizedBook {
    const bookMeta = exportData.book || { title: 'Imported Book', author: 'Unknown Author' };
    const bookHash = bookMeta.hash || `import-${Date.now()}`;

    const notes: NormalizedNote[] = [];
    const annotations = exportData.annotations || [];

    for (const ann of annotations) {
      const colorInfo = getHighlightColorInfo(ann.color);
      notes.push({
        id: ann.id || `note-${Math.random().toString(36).substring(2, 9)}`,
        type: ann.type || 'annotation',
        text: (ann.text || '').trim(),
        note: (ann.note || '').trim(),
        color: colorInfo.name,
        colorHex: colorInfo.hex,
        style: ann.style || 'highlight',
        cfi: ann.cfi || '',
        page: ann.page,
        timestamp: ann.updatedAt || ann.createdAt || exportData.exportedAt || Date.now(),
        url: ann.cfi && bookMeta.hash ? `readest://book/${bookMeta.hash}/cfi/${encodeURIComponent(ann.cfi)}` : undefined,
      });
    }

    let currentProgress: number | undefined;
    let totalProgress: number | undefined;
    let progressPercent: number | undefined;
    if (Array.isArray(exportData.progress) && exportData.progress.length >= 2) {
      currentProgress = exportData.progress[0];
      totalProgress = exportData.progress[1];
      if (totalProgress > 0) {
        progressPercent = Math.min(100, Math.round((currentProgress / totalProgress) * 100));
      }
    }

    let status: 'unread' | 'reading' | 'finished' | 'abandoned' = 'unread';
    if (progressPercent !== undefined) {
      if (progressPercent >= 99) status = 'finished';
      else if (progressPercent > 0) status = 'reading';
    }

    return {
      hash: bookHash,
      title: bookMeta.title || 'Untitled Book',
      author: bookMeta.author || 'Unknown Author',
      format: (bookMeta.format as string) || 'EPUB',
      readingStatus: status,
      progressCurrent: currentProgress,
      progressTotal: totalProgress,
      progressPercent,
      tags: [],
      notes,
      createdAt: exportData.exportedAt || Date.now(),
      updatedAt: exportData.exportedAt || Date.now(),
    };
  }

  private static normalizeBookArray(books: Record<string, unknown>[]): NormalizedBook[] {
    const result: NormalizedBook[] = [];
    for (const b of books) {
      const hash = (b.hash as string) || `book-${Math.random().toString(36).substring(2, 9)}`;
      const title = (b.title as string) || (b.sourceTitle as string) || 'Untitled Book';
      const author = (b.author as string) || 'Unknown Author';
      const format = (b.format as string) || 'EPUB';

      const progressArr = b.progress as [number, number] | undefined;
      let progressPercent: number | undefined;
      if (Array.isArray(progressArr) && progressArr.length >= 2 && progressArr[1] > 0) {
        progressPercent = Math.min(100, Math.round((progressArr[0] / progressArr[1]) * 100));
      }

      result.push({
        hash,
        title,
        author,
        format,
        readingStatus: (b.readingStatus as 'unread' | 'reading' | 'finished' | 'abandoned') || 'unread',
        progressCurrent: progressArr ? progressArr[0] : undefined,
        progressTotal: progressArr ? progressArr[1] : undefined,
        progressPercent,
        tags: Array.isArray(b.tags) ? (b.tags as string[]) : [],
        groupName: (b.groupName as string) || undefined,
        notes: [],
        createdAt: (b.createdAt as number) || Date.now(),
        updatedAt: (b.updatedAt as number) || Date.now(),
      });
    }
    return result;
  }

  private static normalizeRawAnnotations(
    annotations: Record<string, unknown>[],
    bookMeta?: Record<string, unknown>
  ): NormalizedBook {
    const title = (bookMeta?.title as string) || 'Imported Highlights';
    const author = (bookMeta?.author as string) || 'Unknown Author';
    const bookHash = (bookMeta?.hash as string) || `import-${Date.now()}`;

    const notes: NormalizedNote[] = [];
    for (const ann of annotations) {
      const colorInfo = getHighlightColorInfo(ann.color as string);
      notes.push({
        id: (ann.id as string) || `note-${Math.random().toString(36).substring(2, 9)}`,
        type: (ann.type as string) || 'annotation',
        text: ((ann.text as string) || '').trim(),
        note: ((ann.note as string) || '').trim(),
        color: colorInfo.name,
        colorHex: colorInfo.hex,
        style: (ann.style as string) || 'highlight',
        cfi: (ann.cfi as string) || '',
        page: ann.page as number | undefined,
        timestamp: (ann.updatedAt as number) || (ann.createdAt as number) || Date.now(),
      });
    }

    return {
      hash: bookHash,
      title,
      author,
      format: (bookMeta?.format as string) || 'EPUB',
      readingStatus: 'reading',
      tags: [],
      notes,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }
}
