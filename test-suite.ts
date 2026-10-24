import { zipSync, strToU8 } from 'fflate';
import { PackParser } from './src/parsers/packParser';
import { JsonExportParser } from './src/parsers/jsonExportParser';
import { MarkdownFormatter } from './src/formatter/markdownFormatter';
import { generateProgressBar, sanitizeFilename, formatTimestamp } from './src/utils/fileUtils';
import { DEFAULT_SETTINGS } from './src/types/settings';
import { NormalizedBook } from './src/types/readest';

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`FAIL: ${msg}`);
    failed++;
  } else {
    console.log(`PASS: ${msg}`);
    passed++;
  }
}

async function runTests() {
  console.log('=== Running Obsidian Readest Sync Comprehensive Tests ===\n');

  // 1. Test .rbooks Collection Bundle Parsing
  console.log('--- Test 1: .rbooks Collection Bundle ---');
  const manifestData = {
    format: 'rbooks',
    version: 1,
    createdAt: Date.now(),
    collection: {
      name: 'Classics Collection',
      count: 2,
    },
    books: [
      {
        filename: 'books/Crime and Punishment.epub',
        title: 'Crime and Punishment',
        author: 'Fyodor Dostoevsky',
        format: 'EPUB',
        tags: ['Classic', 'Philosophy'],
        groupName: 'Classics',
      },
      {
        filename: 'books/The Metamorphosis.epub',
        title: 'The Metamorphosis',
        author: 'Franz Kafka',
        format: 'EPUB',
        tags: ['Fiction'],
      },
    ],
  };

  const rbooksZip = zipSync({
    'readest-manifest.json': strToU8(JSON.stringify(manifestData)),
    'books/Crime and Punishment.epub': strToU8('mock epub content 1'),
    'books/The Metamorphosis.epub': strToU8('mock epub content 2'),
  });

  const parsedRbooks = await PackParser.parseBuffer(rbooksZip, 'test.rbooks');
  assert(parsedRbooks.length === 2, `Expected 2 books in .rbooks, got ${parsedRbooks.length}`);
  assert(parsedRbooks[0].title === 'Crime and Punishment', 'First book title matches');
  assert(parsedRbooks[0].author === 'Fyodor Dostoevsky', 'First book author matches');
  assert(parsedRbooks[0].groupName === 'Classics', 'First book group matches');
  assert(!parsedRbooks[0].hash.includes('books/'), 'Book hash does not contain books/ prefix');
  assert(parsedRbooks[1].title === 'The Metamorphosis', 'Second book title matches');

  // 2. Test Legacy / Full Backup Archive with config.json and nav.json
  console.log('\n--- Test 2: Full Archive with config.json and nav.json ---');
  const libraryJson = [
    {
      hash: 'hash-abc123',
      title: 'Solaris',
      author: 'Stanislaw Lem',
      format: 'EPUB',
      tags: ['Sci-Fi'],
      readingStatus: 'reading',
      progress: [150, 300],
    },
  ];

  const bookConfig = {
    booknotes: [
      {
        id: 'note-1',
        text: 'The ocean was thinking.',
        note: 'Key theme of sentient planet.',
        color: 'yellow',
        cfi: '/6/4[chap1]!/4/2/10',
        page: 45,
        updatedAt: 1700000000000,
      },
    ],
  };

  const navJson = [
    {
      href: 'chap1.html',
      label: 'Chapter 1: The Giga-Ocean',
    },
  ];

  const fullArchiveZip = zipSync({
    'Books/library.json': strToU8(JSON.stringify(libraryJson)),
    'Books/hash-abc123/config.json': strToU8(JSON.stringify(bookConfig)),
    'Books/hash-abc123/nav.json': strToU8(JSON.stringify(navJson)),
    'Books/hash-abc123/cover.png': new Uint8Array([137, 80, 78, 71]),
  });

  const parsedArchive = await PackParser.parseBuffer(fullArchiveZip, 'backup.zip');
  assert(parsedArchive.length === 1, `Expected 1 book in full archive, got ${parsedArchive.length}`);
  assert(parsedArchive[0].title === 'Solaris', 'Title Solaris matches');
  assert(parsedArchive[0].readingStatus === 'reading', 'Reading status reading matches');
  assert(parsedArchive[0].progressPercent === 50, 'Progress 50% calculated correctly');
  assert(parsedArchive[0].notes.length === 1, 'Extracted 1 highlight');
  assert(parsedArchive[0].notes[0].text === 'The ocean was thinking.', 'Highlight text matches');
  assert(parsedArchive[0].notes[0].chapterTitle === 'Chapter 1: The Giga-Ocean', 'Chapter resolved from nav.json');
  assert(parsedArchive[0].coverBuffer !== undefined, 'Cover buffer extracted');

  // 3. Test JSON Export Parser ($format === 'readest-annotations')
  console.log('\n--- Test 3: Readest JSON Export Parser ---');
  const jsonExport = {
    $format: 'readest-annotations',
    version: 1,
    exportedAt: 1700000000000,
    book: {
      hash: 'book-hash-99',
      title: 'Brave New World',
      author: 'Aldous Huxley',
      format: 'EPUB',
    },
    annotations: [
      {
        id: 'ann-1',
        text: 'Words can be like X-rays, if you use them properly—they’ll go through anything.',
        color: 'green',
        page: 72,
        createdAt: 1700000000000,
      },
    ],
    progress: [200, 250],
  };

  const parsedJson = JsonExportParser.parse(JSON.stringify(jsonExport));
  assert(parsedJson.length === 1, `Expected 1 book from JSON, got ${parsedJson.length}`);
  assert(parsedJson[0].title === 'Brave New World', 'JSON export title matches');
  assert(parsedJson[0].progressPercent === 80, 'Progress 80% matches');
  assert(parsedJson[0].notes[0].color === 'Green', 'Highlight color Green matches');

  // 4. Test Markdown Formatter & Safe Merge
  console.log('\n--- Test 4: Markdown Formatter & Non-destructive Merge ---');
  const sampleBook: NormalizedBook = {
    hash: 'book-12345',
    title: 'Clean Code: A Handbook of Agile Software Craftsmanship',
    author: 'Robert C. Martin',
    format: 'PDF',
    readingStatus: 'finished',
    progressCurrent: 464,
    progressTotal: 464,
    progressPercent: 100,
    tags: ['Software', 'Best Practices'],
    notes: [
      {
        id: 'n1',
        type: 'annotation',
        text: 'Clean code always looks like it was written by someone who cares.',
        note: 'Famous quote.',
        color: 'Blue',
        colorHex: '#60a5fa',
        style: 'highlight',
        page: 9,
        timestamp: 1700000000000,
      },
    ],
  };

  const freshNote = MarkdownFormatter.format(sampleBook, DEFAULT_SETTINGS);
  assert(freshNote.includes('title: "Clean Code: A Handbook of Agile Software Craftsmanship"'), 'Frontmatter title quoted and escaped');
  assert(freshNote.includes('readingStatus: finished'), 'Reading status included');
  assert(freshNote.includes('Clean code always looks like it was written by someone who cares.'), 'Highlight included');
  assert(freshNote.includes('<!-- readest-sync-highlights-start -->'), 'Start delimiter included');
  assert(freshNote.includes('<!-- readest-sync-highlights-end -->'), 'End delimiter included');
  assert(freshNote.includes('## 📝 My Personal Notes & Reflections'), 'Personal notes placeholder present');

  // Test Merge with user written reflections
  const existingNoteWithUserWriting = freshNote.replace(
    '*Your thoughts here...*',
    'This is my personal review of Clean Code! I loved chapter 3 on functions.'
  );

  // Add another highlight to book
  sampleBook.notes.push({
    id: 'n2',
    type: 'annotation',
    text: 'Functions should do one thing. They should do it well. They should do it only.',
    color: 'Yellow',
    style: 'highlight',
    page: 35,
    timestamp: 1700000100000,
  });

  // Test Cover Wikilink formatting
  const noteWithCover = MarkdownFormatter.format(sampleBook, DEFAULT_SETTINGS, 'Readest/Covers/Clean Code - Robert C. Martin_12345.png');
  assert(noteWithCover.includes('![[Readest/Covers/Clean Code - Robert C. Martin_12345.png|180]]'), 'Cover uses native Obsidian wikilink embed syntax with spaces');

  const mergedNote = MarkdownFormatter.format(sampleBook, DEFAULT_SETTINGS, undefined, existingNoteWithUserWriting);
  assert(mergedNote.includes('This is my personal review of Clean Code! I loved chapter 3 on functions.'), 'USER PERSONAL NOTES PRESERVED AFTER MERGE!');
  assert(mergedNote.includes('Functions should do one thing.'), 'New highlight appended after merge');
  assert(mergedNote.includes('totalHighlights: 2'), 'Frontmatter totalHighlights updated to 2');
  assert(mergedNote.includes('> - **Highlights & Notes**: 2'), 'Overview section updated in body upon merge');
  assert((mergedNote.match(/\ntags:/g) || []).length === 1, 'Frontmatter has exactly one tags block (no duplicate tags or red syntax error)');

  // Test Stale PC sync prevention (Mobile finished book, PC has stale unread state)
  const staleBook: NormalizedBook = {
    ...sampleBook,
    readingStatus: 'unread',
    progressPercent: 0,
    progressCurrent: 0,
  };
  const mergedStaleNote = MarkdownFormatter.format(staleBook, DEFAULT_SETTINGS, undefined, mergedNote);
  assert(mergedStaleNote.includes('readingStatus: finished'), 'Finished status preserved against stale PC sync');
  assert(mergedStaleNote.includes('> - **Status**: `FINISHED`'), 'Overview body preserved finished status against stale PC sync');

  // 5. Test File Utils
  console.log('\n--- Test 5: File & String Utils ---');
  const safeName = sanitizeFilename('Book: A Journey? *Illegal* [chars] / test');
  assert(!safeName.includes(':') && !safeName.includes('?') && !safeName.includes('*'), 'Sanitized illegal chars');

  const pBar = generateProgressBar(50, 100, 10);
  assert(pBar.percent === 50, 'Progress bar percent 50%');
  assert(pBar.bar.length === 10, 'Progress bar length 10');

  console.log(`\n========================================`);
  console.log(`Test Results: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((e) => {
  console.error('Unhandled test failure:', e);
  process.exit(1);
});
