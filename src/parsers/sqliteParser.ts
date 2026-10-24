import { NormalizedBook, NormalizedNote } from '../types/readest';
import { getHighlightColorInfo } from '../utils/colorUtils';
import { isNodeAvailable } from '../utils/pathUtils';

/**
 * Lightweight pure TypeScript SQLite 3 database parser.
 * Reads tables, rows, and columns without any native C++ dependencies or WebAssembly,
 * enabling full compatibility inside Obsidian desktop and mobile.
 */
export class SqliteParser {
  /**
   * Parse an SQLite database file from disk (desktop).
   */
  public static parseFilePath(filePath: string): NormalizedBook[] {
    if (!isNodeAvailable()) {
      throw new Error('SQLite file parsing from path is only available on desktop.');
    }

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs = require('fs');
    if (!fs.existsSync(filePath)) {
      throw new Error(`SQLite database file not found: ${filePath}`);
    }

    const buffer = fs.readFileSync(filePath);
    return SqliteParser.parseBuffer(new Uint8Array(buffer));
  }

  /**
   * Parse an SQLite database from binary Uint8Array or ArrayBuffer.
   */
  public static parseBuffer(buffer: ArrayBuffer | Uint8Array): NormalizedBook[] {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);

    // Validate SQLite magic header: "SQLite format 3\0"
    const magic = String.fromCharCode(...bytes.subarray(0, 15));
    if (!magic.startsWith('SQLite format 3')) {
      throw new Error('File is not a valid SQLite 3 database.');
    }

    const pageSize = (bytes[16] << 8) | bytes[17] || 65536;
    const tables = SqliteParser.extractAllRecords(bytes, pageSize);

    return SqliteParser.transformTablesToBooks(tables);
  }

  private static extractAllRecords(bytes: Uint8Array, pageSize: number): Record<string, Record<string, unknown>[]> {
    const textDecoder = new TextDecoder('utf-8');
    const tables: Record<string, Record<string, unknown>[]> = {};
    const totalPages = Math.floor(bytes.length / pageSize);

    // Scan all pages for Leaf Table Pages (flag 0x0D = 13)
    const allRows: Array<unknown[]> = [];

    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      const pageOffset = (pageNum - 1) * pageSize;
      const headerOffset = pageNum === 1 ? 100 : 0; // Page 1 starts after 100-byte DB header
      const pageType = bytes[pageOffset + headerOffset];

      if (pageType === 0x0d) {
        // B-Tree Leaf Table Page
        const cellCount = (bytes[pageOffset + headerOffset + 3] << 8) | bytes[pageOffset + headerOffset + 4];
        const cellPtrOffset = pageOffset + headerOffset + 8;

        for (let i = 0; i < cellCount; i++) {
          const ptr = (bytes[cellPtrOffset + i * 2] << 8) | bytes[cellPtrOffset + i * 2 + 1];
          const cellAbs = pageOffset + ptr;

          if (cellAbs < bytes.length) {
            try {
              const row = SqliteParser.parseRecord(bytes, cellAbs, textDecoder);
              if (row && row.length > 0) {
                allRows.push(row);
              }
            } catch {
              // Skip malformed cells
            }
          }
        }
      }
    }

    // Classify rows into book records and note records based on field signatures
    tables['books'] = [];
    tables['notes'] = [];

    for (const row of allRows) {
      const rowStrings = row.filter((v): v is string => typeof v === 'string');
      
      // Check if row matches DBBook structure (has hash/format/title)
      const hasHash = rowStrings.some((s) => /^[a-f0-9]{32}$/i.test(s));
      const hasCfi = rowStrings.some((s) => s.startsWith('epubcfi(') || s.startsWith('/'));
      const hasFormat = rowStrings.some((s) => ['EPUB', 'PDF', 'MOBI', 'AZW3', 'TXT'].includes(s.toUpperCase()));

      if (hasCfi && row.length >= 4) {
        // Identified as a Note/Annotation row
        const noteObj: Record<string, unknown> = {};
        for (let idx = 0; idx < row.length; idx++) {
          const val = row[idx];
          if (typeof val === 'string') {
            if (val.startsWith('epubcfi(') || val.startsWith('/')) noteObj['cfi'] = val;
            else if (/^[a-f0-9]{32}$/i.test(val)) noteObj['book_hash'] = val;
            else if (['yellow', 'red', 'green', 'blue', 'violet', 'purple'].includes(val.toLowerCase()) || val.startsWith('#')) {
              noteObj['color'] = val;
            } else if (['annotation', 'bookmark', 'excerpt', 'highlight'].includes(val.toLowerCase())) {
              noteObj['type'] = val;
            } else if (val.length > 5 && !noteObj['text']) {
              noteObj['text'] = val;
            } else if (!noteObj['note']) {
              noteObj['note'] = val;
            }
          } else if (typeof val === 'number') {
            if (val > 1000000000) noteObj['updated_at'] = val;
            else if (val > 0 && val < 50000) noteObj['page'] = val;
          }
        }
        if (noteObj['cfi'] || noteObj['text']) {
          tables['notes'].push(noteObj);
        }
      } else if (hasFormat || (hasHash && row.length >= 3)) {
        // Identified as a Book row
        const bookObj: Record<string, unknown> = {};
        for (let idx = 0; idx < row.length; idx++) {
          const val = row[idx];
          if (typeof val === 'string') {
            if (/^[a-f0-9]{32}$/i.test(val) && !bookObj['hash']) bookObj['hash'] = val;
            else if (['EPUB', 'PDF', 'MOBI', 'AZW3', 'TXT'].includes(val.toUpperCase())) bookObj['format'] = val;
            else if (['reading', 'finished', 'unread', 'abandoned'].includes(val.toLowerCase())) bookObj['reading_status'] = val;
            else if (!bookObj['title'] && val.length > 1) bookObj['title'] = val;
            else if (!bookObj['author']) bookObj['author'] = val;
          } else if (typeof val === 'number' && val > 1000000000) {
            bookObj['updated_at'] = val;
          }
        }
        if (bookObj['hash'] || bookObj['title']) {
          tables['books'].push(bookObj);
        }
      }
    }

    return tables;
  }

  private static parseRecord(bytes: Uint8Array, offset: number, decoder: TextDecoder): unknown[] {
    let cur = offset;

    // Read payload size varint
    const [payloadSize, payloadVarLen] = SqliteParser.readVarint(bytes, cur);
    cur += payloadVarLen;

    // Read rowid varint
    const [, rowIdVarLen] = SqliteParser.readVarint(bytes, cur);
    cur += rowIdVarLen;

    const recordStart = cur;
    if (recordStart + payloadSize > bytes.length) return [];

    // Header size varint
    const [headerSize, headerVarLen] = SqliteParser.readVarint(bytes, cur);
    cur += headerVarLen;

    const headerEnd = recordStart + headerSize;
    const serialTypes: number[] = [];

    while (cur < headerEnd) {
      const [serialType, len] = SqliteParser.readVarint(bytes, cur);
      serialTypes.push(serialType);
      cur += len;
    }

    // Now read values
    const values: unknown[] = [];
    let bodyOffset = headerEnd;

    for (const st of serialTypes) {
      if (st === 0) {
        values.push(null);
      } else if (st === 1) {
        values.push(bytes[bodyOffset]);
        bodyOffset += 1;
      } else if (st === 2) {
        values.push((bytes[bodyOffset] << 8) | bytes[bodyOffset + 1]);
        bodyOffset += 2;
      } else if (st === 3) {
        values.push((bytes[bodyOffset] << 16) | (bytes[bodyOffset + 1] << 8) | bytes[bodyOffset + 2]);
        bodyOffset += 3;
      } else if (st === 4) {
        values.push(
          (bytes[bodyOffset] << 24) |
          (bytes[bodyOffset + 1] << 16) |
          (bytes[bodyOffset + 2] << 8) |
          bytes[bodyOffset + 3]
        );
        bodyOffset += 4;
      } else if (st === 5) {
        // 48-bit int
        bodyOffset += 6;
        values.push(0);
      } else if (st === 6) {
        // 64-bit int
        const high = (bytes[bodyOffset] << 24) | (bytes[bodyOffset + 1] << 16) | (bytes[bodyOffset + 2] << 8) | bytes[bodyOffset + 3];
        const low = (bytes[bodyOffset + 4] << 24) | (bytes[bodyOffset + 5] << 16) | (bytes[bodyOffset + 6] << 8) | bytes[bodyOffset + 7];
        values.push(high * 4294967296 + (low >>> 0));
        bodyOffset += 8;
      } else if (st === 7) {
        // 64-bit float
        bodyOffset += 8;
        values.push(0);
      } else if (st === 8) {
        values.push(0);
      } else if (st === 9) {
        values.push(1);
      } else if (st >= 12 && st % 2 === 0) {
        // BLOB
        const len = (st - 12) / 2;
        bodyOffset += len;
        values.push('<blob>');
      } else if (st >= 13 && st % 2 === 1) {
        // String
        const len = (st - 13) / 2;
        if (bodyOffset + len <= bytes.length) {
          const str = decoder.decode(bytes.subarray(bodyOffset, bodyOffset + len));
          values.push(str);
        }
        bodyOffset += len;
      }
    }

    return values;
  }

  private static readVarint(bytes: Uint8Array, offset: number): [number, number] {
    let result = 0;
    for (let i = 0; i < 8; i++) {
      if (offset + i >= bytes.length) return [result, i];
      const byte = bytes[offset + i];
      result = (result << 7) | (byte & 0x7f);
      if ((byte & 0x80) === 0) {
        return [result, i + 1];
      }
    }
    const byte = bytes[offset + 8];
    result = (result << 8) | byte;
    return [result, 9];
  }

  private static transformTablesToBooks(tables: Record<string, Record<string, unknown>[]>): NormalizedBook[] {
    const rawBooks = tables['books'] || [];
    const rawNotes = tables['notes'] || [];

    const notesByBook = new Map<string, NormalizedNote[]>();

    for (const rn of rawNotes) {
      const bookHash = (rn['book_hash'] as string) || 'unknown';
      if (!notesByBook.has(bookHash)) {
        notesByBook.set(bookHash, []);
      }

      const colorInfo = getHighlightColorInfo(rn['color'] as string);
      notesByBook.get(bookHash)!.push({
        id: (rn['id'] as string) || `note-${Math.random().toString(36).substring(2, 9)}`,
        type: (rn['type'] as string) || 'annotation',
        text: (rn['text'] as string) || '',
        note: (rn['note'] as string) || '',
        color: colorInfo.name,
        colorHex: colorInfo.hex,
        style: 'highlight',
        cfi: (rn['cfi'] as string) || '',
        page: rn['page'] as number | undefined,
        timestamp: (rn['updated_at'] as number) || Date.now(),
      });
    }

    const books: NormalizedBook[] = [];

    for (const rb of rawBooks) {
      const hash = (rb['hash'] as string) || `book-${Math.random().toString(36).substring(2, 9)}`;
      const bookNotes = notesByBook.get(hash) || [];

      books.push({
        hash,
        title: (rb['title'] as string) || 'Untitled Book',
        author: (rb['author'] as string) || 'Unknown Author',
        format: (rb['format'] as string) || 'EPUB',
        readingStatus: (rb['reading_status'] as 'unread' | 'reading' | 'finished' | 'abandoned') || 'reading',
        tags: [],
        notes: bookNotes,
        createdAt: (rb['updated_at'] as number) || Date.now(),
        updatedAt: (rb['updated_at'] as number) || Date.now(),
      });
    }

    // If no books were explicitly reconstructed, but notes exist, group notes into placeholder books
    if (books.length === 0 && notesByBook.size > 0) {
      for (const [hash, notes] of notesByBook.entries()) {
        books.push({
          hash,
          title: `Imported Book (${hash.substring(0, 8)})`,
          author: 'Unknown Author',
          format: 'EPUB',
          readingStatus: 'reading',
          tags: [],
          notes,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      }
    }

    return books;
  }
}
