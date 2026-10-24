import { App, Notice, TFile, TFolder, normalizePath } from 'obsidian';
import { NormalizedBook } from '../types/readest';
import { ReadestSyncSettings, SyncResult } from '../types/settings';
import { LocalFolderParser } from '../parsers/localFolderParser';
import { PackParser } from '../parsers/packParser';
import { JsonExportParser } from '../parsers/jsonExportParser';
import { SqliteParser } from '../parsers/sqliteParser';
import { MarkdownFormatter } from '../formatter/markdownFormatter';
import { sanitizeFilename } from '../utils/fileUtils';

export class SyncEngine {
  private app: App;
  private settings: ReadestSyncSettings;

  constructor(app: App, settings: ReadestSyncSettings) {
    this.app = app;
    this.settings = settings;
  }

  /**
   * Sync from the configured local Readest directory.
   */
  public async syncFromLocalFolder(): Promise<SyncResult> {
    const startTime = Date.now();
    if (!this.settings.readestDataPath || this.settings.readestDataPath.trim() === '') {
      throw new Error('Readest data path is not configured. Please set or auto-detect it in settings.');
    }

    const parser = new LocalFolderParser(this.settings.readestDataPath);
    const books = await parser.parse();
    return this.processBooks(books, startTime);
  }

  /**
   * Import books and highlights from a .readestpack, .rbooks, or .zip buffer.
   */
  public async syncFromPackBuffer(buffer: ArrayBuffer | Uint8Array, filename?: string): Promise<SyncResult> {
    const startTime = Date.now();
    const books = await PackParser.parseBuffer(buffer, filename);
    return this.processBooks(books, startTime);
  }

  /**
   * Import from an SQLite database buffer.
   */
  public async syncFromSqliteBuffer(buffer: ArrayBuffer | Uint8Array): Promise<SyncResult> {
    const startTime = Date.now();
    const books = SqliteParser.parseBuffer(buffer);
    return this.processBooks(books, startTime);
  }

  /**
   * Import from a Readest JSON export string.
   */
  public async syncFromJsonString(jsonString: string): Promise<SyncResult> {
    const startTime = Date.now();
    const books = JsonExportParser.parse(jsonString);
    return this.processBooks(books, startTime);
  }

  /**
   * Core orchestrator: writes books and covers into the Obsidian Vault.
   */
  public async processBooks(books: NormalizedBook[], startTime: number): Promise<SyncResult> {
    const result: SyncResult = {
      success: true,
      booksProcessed: 0,
      booksCreated: 0,
      booksUpdated: 0,
      highlightsSynced: 0,
      errors: [],
      durationMs: 0,
    };

    if (!books || books.length === 0) {
      new Notice('Readest Sync: No books found to sync.');
      result.durationMs = Date.now() - startTime;
      return result;
    }

    // 1. Ensure target vault folders exist
    await this.ensureFolder(this.settings.booksFolder);
    if (this.settings.includeCoverImage) {
      await this.ensureFolder(this.settings.coversFolder);
    }

    for (const book of books) {
      // Check filter: if syncOnlyWithNotes is enabled, skip books with no notes & no progress
      if (this.settings.syncOnlyWithNotes && book.notes.length === 0 && (!book.progressPercent || book.progressPercent === 0)) {
        continue;
      }

      result.booksProcessed++;

      try {
        // Handle cover image
        let coverRelativePath: string | undefined = undefined;
        if (this.settings.includeCoverImage) {
          coverRelativePath = await this.saveBookCover(book);
        }

        // Generate filename
        const baseFilename = this.buildFilename(book);
        const filePath = normalizePath(`${this.settings.booksFolder}/${baseFilename}.md`);

        // Check if file already exists in vault
        const existingFile = this.app.vault.getAbstractFileByPath(filePath);

        if (existingFile instanceof TFile) {
          // File exists: perform safe non-destructive update
          const existingContent = await this.app.vault.read(existingFile);
          const newContent = MarkdownFormatter.format(book, this.settings, coverRelativePath, existingContent);

          if (existingContent.trim() !== newContent.trim()) {
            await this.app.vault.modify(existingFile, newContent);
            result.booksUpdated++;
          }
        } else {
          // Create new note
          const content = MarkdownFormatter.format(book, this.settings, coverRelativePath);
          await this.app.vault.create(filePath, content);
          result.booksCreated++;
        }

        result.highlightsSynced += book.notes.length;
      } catch (err) {
        const errorMsg = `Error syncing "${book.title}": ${(err as Error).message}`;
        console.error('[ReadestSync]', errorMsg, err);
        result.errors.push(errorMsg);
      }
    }

    result.durationMs = Date.now() - startTime;
    return result;
  }

  /**
   * Generates a sanitized note filename based on settings.
   */
  private buildFilename(book: NormalizedBook): string {
    let rawName: string;
    if (this.settings.fileNaming === 'title-author' && book.author) {
      rawName = `${book.title} - ${book.author}`;
    } else if (this.settings.fileNaming === 'author-title' && book.author) {
      rawName = `${book.author} - ${book.title}`;
    } else {
      rawName = book.title;
    }

    return sanitizeFilename(rawName);
  }

  /**
   * Saves book cover image into the configured covers folder.
   */
  private async saveBookCover(book: NormalizedBook): Promise<string | undefined> {
    const ext = book.coverExt || 'png';
    const coverFilename = `${sanitizeFilename(book.title)}_${book.hash.substring(0, 8)}.${ext}`;
    const coverPath = normalizePath(`${this.settings.coversFolder}/${coverFilename}`);

    if (!book.coverBuffer || book.coverBuffer.length === 0) {
      // Check if cover file already exists in vault
      const existing = this.app.vault.getAbstractFileByPath(coverPath);
      if (existing instanceof TFile) {
        return coverPath;
      }
      return undefined;
    }

    try {
      const existing = this.app.vault.getAbstractFileByPath(coverPath);
      const rawBuffer = book.coverBuffer.buffer.slice(
        book.coverBuffer.byteOffset,
        book.coverBuffer.byteOffset + book.coverBuffer.byteLength
      );
      const buffer = rawBuffer as ArrayBuffer;

      if (existing instanceof TFile) {
        await this.app.vault.modifyBinary(existing, buffer);
      } else {
        await this.app.vault.createBinary(coverPath, buffer);
      }

      return coverPath;
    } catch (e) {
      console.warn(`[ReadestSync] Failed to save cover for ${book.title}:`, e);
      return undefined;
    }
  }

  /**
   * Ensures a folder exists inside the vault.
   */
  private async ensureFolder(folderPath: string): Promise<void> {
    const normalized = normalizePath(folderPath.trim());
    if (!normalized || normalized === '/' || normalized === '.') return;

    const parts = normalized.split('/');
    let current = '';

    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      const folder = this.app.vault.getAbstractFileByPath(current);
      if (!folder) {
        try {
          await this.app.vault.createFolder(current);
        } catch (e) {
          // Check if folder already exists from race condition
          if (!(this.app.vault.getAbstractFileByPath(current) instanceof TFolder)) {
            throw e;
          }
        }
      }
    }
  }
}
