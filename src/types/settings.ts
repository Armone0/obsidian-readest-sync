export interface ReadestSyncSettings {
  booksFolder: string;
  readestDataPath: string;
  syncFrequency: 'manual' | 'startup' | '15m' | '30m' | '60m';
  highlightStyle: 'callout' | 'blockquote' | 'bullet';
  calloutType: string;
  colorCallouts: boolean;
  groupHighlightsBy: 'chapter' | 'date' | 'none';
  colorTags: boolean;
  includeCoverImage: boolean;
  coversFolder: string;
  fileNaming: 'title' | 'title-author' | 'author-title';
  dateFormat: string;
  syncOnlyWithNotes: boolean;
  preserveUserNotes: boolean;
  openNoteAfterImport: boolean;
  statusTagMapping: {
    unread: string;
    reading: string;
    finished: string;
    abandoned: string;
  };
  useCustomTemplate: boolean;
  customFrontmatterTemplate: string;
  customHighlightTemplate: string;
  lastSyncTime: number;
  lastSyncStats: {
    totalBooks: number;
    syncedBooks: number;
    totalHighlights: number;
  };
}

export const DEFAULT_SETTINGS: ReadestSyncSettings = {
  booksFolder: 'Readest',
  readestDataPath: '',
  syncFrequency: 'manual',
  highlightStyle: 'callout',
  calloutType: 'quote',
  colorCallouts: true,
  groupHighlightsBy: 'chapter',
  colorTags: true,
  includeCoverImage: true,
  coversFolder: 'Readest/Covers',
  fileNaming: 'title',
  dateFormat: 'YYYY-MM-DD HH:mm',
  syncOnlyWithNotes: false,
  preserveUserNotes: true,
  openNoteAfterImport: false,
  statusTagMapping: {
    unread: 'reading/unread',
    reading: 'reading/currently-reading',
    finished: 'reading/finished',
    abandoned: 'reading/abandoned',
  },
  useCustomTemplate: false,
  customFrontmatterTemplate: `---
title: "{{title}}"
author: "{{author}}"
format: "{{format}}"
readingStatus: "{{reading_status}}"
progress: "{{progress_percent}}%"
totalHighlights: {{highlights_count}}
lastSynced: "{{sync_date}}"
bookHash: "{{book_hash}}"
tags:
  - readest
  - {{status_tag}}
---`,
  customHighlightTemplate: `> [!{{callout_type}}]{{callout_color}}
> {{text}}
> 
> **Note**: {{note}}
> *Location: {{location}} | {{date}}*`,
  lastSyncTime: 0,
  lastSyncStats: {
    totalBooks: 0,
    syncedBooks: 0,
    totalHighlights: 0,
  },
};

export interface SyncResult {
  success: boolean;
  booksProcessed: number;
  booksCreated: number;
  booksUpdated: number;
  highlightsSynced: number;
  errors: string[];
  durationMs: number;
}
