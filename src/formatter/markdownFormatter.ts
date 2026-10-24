import { NormalizedBook, NormalizedNote } from '../types/readest';
import { ReadestSyncSettings } from '../types/settings';
import { generateProgressBar, formatTimestamp, formatQuoteText } from '../utils/fileUtils';

export class MarkdownFormatter {
  public static readonly HIGHLIGHTS_START_COMMENT = '<!-- readest-sync-highlights-start -->';
  public static readonly HIGHLIGHTS_END_COMMENT = '<!-- readest-sync-highlights-end -->';

  /**
   * Generates a complete Markdown note for a book.
   * If existingContent is provided and preserveUserNotes is true, it performs a safe merge.
   */
  public static format(
    book: NormalizedBook,
    settings: ReadestSyncSettings,
    coverRelativePath?: string,
    existingContent?: string
  ): string {
    const frontmatter = this.generateFrontmatter(book, settings, existingContent);
    const highlightsBody = this.generateHighlightsSection(book, settings);

    if (existingContent && settings.preserveUserNotes) {
      return this.mergeWithExistingContent(frontmatter, highlightsBody, existingContent, book, settings, coverRelativePath);
    }

    // Fresh note generation
    const overviewSection = this.generateOverviewSection(book, coverRelativePath);
    const personalNotesSection = this.generatePersonalNotesSection();

    return [
      frontmatter,
      '',
      overviewSection,
      '',
      personalNotesSection,
      '',
      this.HIGHLIGHTS_START_COMMENT,
      highlightsBody,
      this.HIGHLIGHTS_END_COMMENT,
      '',
    ].join('\n');
  }

  /**
   * Generates YAML frontmatter, preserving any custom user fields from existingContent.
   */
  private static generateFrontmatter(
    book: NormalizedBook,
    settings: ReadestSyncSettings,
    existingContent?: string
  ): string {
    const syncDate = formatTimestamp(Date.now(), 'YYYY-MM-DD HH:mm:ss');
    const statusTag = settings.statusTagMapping[book.readingStatus] || `reading/${book.readingStatus}`;

    // Extract custom frontmatter fields from existing note if present
    const customFields: Record<string, string> = {};
    if (existingContent && existingContent.startsWith('---')) {
      const secondDash = existingContent.indexOf('\n---', 3);
      if (secondDash !== -1) {
        const rawFm = existingContent.substring(3, secondDash).split('\n');
        for (const line of rawFm) {
          const colonIdx = line.indexOf(':');
          if (colonIdx > 0 && !line.trim().startsWith('-')) {
            const key = line.substring(0, colonIdx).trim();
            const val = line.substring(colonIdx + 1).trim();
            // Don't overwrite managed keys
            const managed = ['title', 'author', 'format', 'readingStatus', 'progress', 'totalHighlights', 'lastSynced', 'bookHash'];
            if (!managed.includes(key)) {
              customFields[key] = val;
            }
          }
        }
      }
    }

    const lines: string[] = ['---'];
    lines.push(`title: "${this.escapeYaml(book.title)}"`);
    lines.push(`author: "${this.escapeYaml(book.author)}"`);
    lines.push(`format: ${book.format.toUpperCase()}`);
    lines.push(`readingStatus: ${book.readingStatus}`);

    if (book.progressPercent !== undefined) {
      lines.push(`progress: "${book.progressPercent}%"`);
    }

    lines.push(`totalHighlights: ${book.notes.length}`);
    lines.push(`lastSynced: "${syncDate}"`);
    lines.push(`bookHash: "${book.hash}"`);

    // Tags list
    const tagsSet = new Set<string>();
    tagsSet.add('readest');
    tagsSet.add(statusTag);
    for (const t of book.tags) {
      if (t) {
        const sanitizedTag = t.trim().replace(/\s+/g, '-').replace(/[^\p{L}\p{N}_\-/]/gu, '');
        if (sanitizedTag) tagsSet.add(sanitizedTag);
      }
    }

    lines.push('tags:');
    for (const t of tagsSet) {
      lines.push(`  - ${t}`);
    }

    // Re-insert custom user frontmatter fields
    for (const [k, v] of Object.entries(customFields)) {
      lines.push(`${k}: ${v}`);
    }

    lines.push('---');
    return lines.join('\n');
  }

  /**
   * Generates the Book Overview section with cover, progress bar, and metadata.
   */
  private static generateOverviewSection(book: NormalizedBook, coverPath?: string): string {
    const lines: string[] = [];
    const cleanTitle = (book.title || 'Untitled Book').replace(/\r?\n/g, ' ');
    const cleanAuthor = (book.author || 'Unknown Author').replace(/\r?\n/g, ' ');
    lines.push(`# ${cleanTitle}`);
    lines.push(`**Author**: [[${cleanAuthor}]]`);

    if (coverPath) {
      lines.push('');
      lines.push(`![Book Cover|180](${coverPath})`);
    }

    lines.push('');
    lines.push('> [!info]+ Book Details');
    lines.push(`> - **Format**: ${book.format.toUpperCase()}`);
    lines.push(`> - **Status**: \`${book.readingStatus.toUpperCase()}\``);

    if (book.progressCurrent !== undefined && book.progressTotal !== undefined) {
      const { bar, percent } = generateProgressBar(book.progressCurrent, book.progressTotal);
      lines.push(`> - **Progress**: ${percent}% \`${bar}\` *(Page ${book.progressCurrent} of ${book.progressTotal})*`);
    }

    if (book.groupName) {
      lines.push(`> - **Collection / Shelf**: ${book.groupName}`);
    }

    lines.push(`> - **Highlights & Notes**: ${book.notes.length}`);

    if (book.description) {
      lines.push('>');
      lines.push(`> **Description**: ${book.description.replace(/\n+/g, ' ')}`);
    }

    return lines.join('\n');
  }

  /**
   * Generates the placeholder section for personal notes, preserved across syncs.
   */
  private static generatePersonalNotesSection(): string {
    return [
      '## 📝 My Personal Notes & Reflections',
      '',
      '> [!tip] User Note Area',
      '> Feel free to write your personal summary, takeaways, or review below.',
      '> *Readest Sync will never overwrite or erase your notes written in this section!*',
      '',
      '*Your thoughts here...*',
      '',
      '---',
    ].join('\n');
  }

  /**
   * Generates the Highlights & Annotations section.
   */
  private static generateHighlightsSection(book: NormalizedBook, settings: ReadestSyncSettings): string {
    const lines: string[] = [];
    lines.push('## 📚 Highlights & Annotations');
    lines.push('');

    if (book.notes.length === 0) {
      lines.push('*No highlights or annotations recorded in Readest yet.*');
      return lines.join('\n');
    }

    if (settings.groupHighlightsBy === 'chapter') {
      const grouped = new Map<string, NormalizedNote[]>();
      for (const note of book.notes) {
        const chapter = note.chapterTitle || 'General / Uncategorized';
        if (!grouped.has(chapter)) grouped.set(chapter, []);
        grouped.get(chapter)!.push(note);
      }

      for (const [chapter, notes] of grouped.entries()) {
        lines.push(`### 📖 ${chapter}`);
        lines.push('');
        for (const note of notes) {
          lines.push(this.formatSingleNote(note, settings));
          lines.push('');
        }
      }
    } else if (settings.groupHighlightsBy === 'date') {
      const grouped = new Map<string, NormalizedNote[]>();
      for (const note of book.notes) {
        const dateKey = formatTimestamp(note.timestamp, 'YYYY-MM-DD') || 'Undated';
        if (!grouped.has(dateKey)) grouped.set(dateKey, []);
        grouped.get(dateKey)!.push(note);
      }

      for (const [date, notes] of grouped.entries()) {
        lines.push(`### 📅 ${date}`);
        lines.push('');
        for (const note of notes) {
          lines.push(this.formatSingleNote(note, settings));
          lines.push('');
        }
      }
    } else {
      // Linear / None
      for (const note of book.notes) {
        lines.push(this.formatSingleNote(note, settings));
        lines.push('');
      }
    }

    return lines.join('\n');
  }

  /**
   * Formats a single highlight according to user preferences (callout, blockquote, bullet).
   */
  private static formatSingleNote(note: NormalizedNote, settings: ReadestSyncSettings): string {
    const colorTag = settings.colorTags ? `#highlight/${note.color.toLowerCase()}` : '';
    const dateStr = formatTimestamp(note.timestamp, settings.dateFormat);
    const locationStr = note.page ? `Page ${note.page}` : note.cfi ? 'CFI Anchor' : '';

    const metaParts: string[] = [];
    if (locationStr) {
      if (note.url) {
        metaParts.push(`[${locationStr}](${note.url})`);
      } else {
        metaParts.push(locationStr);
      }
    }
    if (dateStr) metaParts.push(dateStr);
    if (colorTag) metaParts.push(colorTag);

    const metaLine = metaParts.length > 0 ? `*${metaParts.join(' • ')}*` : '';

    if (settings.highlightStyle === 'callout') {
      const calloutColorSuffix = settings.colorCallouts && note.color ? `|${note.color.toLowerCase()}` : '';
      const headerTitle = note.chapterTitle ? ` ${note.chapterTitle}` : '';
      const lines: string[] = [
        `> [!${settings.calloutType || 'quote'}${calloutColorSuffix}]${headerTitle}`,
      ];

      if (note.text) {
        const formattedQuote = formatQuoteText(note.text);
        for (const ql of formattedQuote.split('\n')) {
          lines.push(`> ${ql}`);
        }
      }

      if (note.note) {
        lines.push('>');
        lines.push(`> 💬 **Note**: ${note.note}`);
      }

      if (metaLine) {
        lines.push('>');
        lines.push(`> ${metaLine}`);
      }

      return lines.join('\n');
    }

    if (settings.highlightStyle === 'blockquote') {
      const lines: string[] = [];
      if (note.text) {
        const formattedQuote = formatQuoteText(note.text);
        for (const ql of formattedQuote.split('\n')) {
          lines.push(`> ${ql}`);
        }
      }

      if (note.note) {
        lines.push('');
        lines.push(`💬 **Note**: ${note.note}`);
      }

      if (metaLine) {
        lines.push('');
        lines.push(metaLine);
      }

      return lines.join('\n');
    }

    // Bullet style
    const lines: string[] = [];
    lines.push(`- **Highlight**: "${note.text.replace(/"/g, '\\"')}"`);
    if (note.note) {
      lines.push(`  - 💬 **Note**: ${note.note}`);
    }
    if (metaLine) {
      lines.push(`  - ${metaLine}`);
    }
    return lines.join('\n');
  }

  /**
   * Intelligently merges new frontmatter and highlights into an existing user note,
   * preserving any text or user annotations placed outside the highlights boundaries.
   */
  private static mergeWithExistingContent(
    newFrontmatter: string,
    newHighlightsBody: string,
    existingContent: string,
    book: NormalizedBook,
    settings: ReadestSyncSettings,
    coverPath?: string
  ): string {
    // 1. Separate existing content from frontmatter
    let existingBody = existingContent;
    if (existingContent.startsWith('---')) {
      const secondDash = existingContent.indexOf('\n---', 3);
      if (secondDash !== -1) {
        existingBody = existingContent.substring(secondDash + 4).trimStart();
      }
    }

    const startIdx = existingBody.indexOf(this.HIGHLIGHTS_START_COMMENT);
    const endIdx = existingBody.indexOf(this.HIGHLIGHTS_END_COMMENT);

    if (startIdx !== -1 && endIdx !== -1 && endIdx >= startIdx) {
      // Content before highlights section (contains Overview + Personal Notes)
      const beforeHighlights = existingBody.substring(0, startIdx);
      // Content after highlights section (any user footer)
      const afterHighlights = existingBody.substring(endIdx + this.HIGHLIGHTS_END_COMMENT.length);

      return [
        newFrontmatter,
        '',
        beforeHighlights.trim(),
        '',
        this.HIGHLIGHTS_START_COMMENT,
        newHighlightsBody,
        this.HIGHLIGHTS_END_COMMENT,
        afterHighlights.trim() ? '\n' + afterHighlights.trim() : '',
      ].join('\n');
    }

    // If marker comments were not found in the existing file (e.g. manually imported before),
    // append highlights section safely at the bottom while preserving existing body!
    return [
      newFrontmatter,
      '',
      existingBody.trim(),
      '',
      '---',
      '',
      this.HIGHLIGHTS_START_COMMENT,
      newHighlightsBody,
      this.HIGHLIGHTS_END_COMMENT,
      '',
    ].join('\n');
  }

  private static escapeYaml(str: string): string {
    if (!str) return '';
    return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, ' ');
  }
}
