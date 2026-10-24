export interface ReadestBook {
  hash: string;
  metaHash?: string;
  format: string;
  title: string;
  sourceTitle?: string;
  author: string;
  groupId?: string;
  groupName?: string | null;
  groupUpdatedAt?: number | null;
  tags?: string[] | null;
  progress?: [number, number] | null;
  readingStatus?: 'unread' | 'reading' | 'finished' | 'abandoned' | string | null;
  readingStatusUpdatedAt?: number | null;
  coverHash?: string | null;
  coverImageUrl?: string | null;
  coverUpdatedAt?: number | null;
  createdAt?: number;
  updatedAt?: number;
  deletedAt?: number | null;
  primaryLanguage?: string;
  pageCount?: number;
  filePath?: string;
  metadata?: {
    title?: string;
    author?: string;
    description?: string;
    publisher?: string;
    published?: string;
    language?: string;
    [key: string]: unknown;
  };
}

export interface ReadestBookNote {
  id: string;
  bookHash?: string;
  metaHash?: string;
  type: 'annotation' | 'bookmark' | 'excerpt' | 'notebook' | 'ink' | string;
  cfi: string;
  xpointer0?: string;
  xpointer1?: string;
  page?: number;
  text?: string;
  style?: 'highlight' | 'underline' | 'squiggly' | string;
  color?: 'red' | 'yellow' | 'green' | 'blue' | 'violet' | string;
  note?: string;
  global?: boolean;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number | null;
}

export interface ReadestBookConfig {
  schemaVersion?: number;
  booknotes?: ReadestBookNote[];
  progress?: [number, number] | string;
  location?: string;
  xpointer?: string;
  updatedAt?: number;
  viewSettings?: {
    noteExportConfig?: Record<string, unknown>;
    ttsHighlightOptions?: Record<string, unknown>;
    [key: string]: unknown;
  };
  searchConfig?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ReadestNavChapter {
  id?: string | number;
  href: string;
  label: string;
  subitems?: ReadestNavChapter[];
}

export interface ReadestAnnotationExport {
  $format?: string;
  version?: number;
  exportedAt?: number;
  book: {
    title: string;
    author?: string;
    hash?: string;
    metaHash?: string;
    format?: string;
  };
  progress?: [number, number];
  location?: string;
  annotations: Array<{
    id: string;
    type?: string;
    cfi?: string;
    text?: string;
    note?: string;
    color?: string;
    style?: string;
    page?: number;
    createdAt?: number;
    updatedAt?: number;
  }>;
}

export interface ReadestPackManifest {
  format?: 'rbooks' | string;
  version?: number;
  createdAt?: number;
  collection?: {
    name: string;
    count: number;
  };
  books?: Array<{
    filename: string;
    title: string;
    author?: string;
    format: string;
    tags?: string[];
    groupName?: string;
    fileSize?: number;
  }>;
}

/**
 * Unified normalized representation of a book with its highlights,
 * irrespective of whether it came from local filesystem, a pack archive, or a JSON export.
 */
export interface NormalizedNote {
  id: string;
  type: string;
  text: string;
  note: string;
  color: string;
  colorHex: string;
  style: string;
  chapterTitle?: string;
  cfi: string;
  page?: number;
  timestamp: number;
  url?: string;
}

export interface NormalizedBook {
  hash: string;
  title: string;
  author: string;
  format: string;
  readingStatus: 'unread' | 'reading' | 'finished' | 'abandoned';
  progressCurrent?: number;
  progressTotal?: number;
  progressPercent?: number;
  tags: string[];
  groupName?: string;
  description?: string;
  coverBuffer?: Uint8Array;
  coverExt?: string;
  chapters?: Array<{ title: string; href: string }>;
  notes: NormalizedNote[];
  createdAt?: number;
  updatedAt?: number;
  sourceFile?: string;
}
