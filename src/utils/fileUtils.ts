/**
 * Sanitizes a string for use as a valid Obsidian note filename.
 * Obsidian disallows characters: * " \ / < > : | ? # ^ [ ]
 */
export function sanitizeFilename(name: string): string {
  if (!name) return 'Untitled';
  
  // Replace illegal characters with dashes or remove them
  let sanitized = name
    .replace(/[\\/:*?"<>|#^[\]]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();

  // If filename ends with a dot or dash, trim it
  sanitized = sanitized.replace(/[.-]+$/, '').trim();

  // Limit length to 200 characters to prevent OS filesystem errors
  if (sanitized.length > 200) {
    sanitized = sanitized.substring(0, 200).trim();
  }

  return sanitized || 'Untitled';
}

/**
 * Creates a visual ASCII progress bar for reading progress.
 * e.g., 47% [█████████░░░░░░░░░░]
 */
export function generateProgressBar(current?: number, total?: number, length = 16): { bar: string; percent: number } {
  const safeLength = Math.max(1, Math.min(100, length));
  if (current === undefined || total === undefined || total <= 0) {
    return { bar: '░'.repeat(safeLength), percent: 0 };
  }

  const ratio = Math.max(0, Math.min(1, current / total));
  const percent = Math.round(ratio * 100);
  const filled = Math.max(0, Math.min(safeLength, Math.round(ratio * safeLength)));
  const empty = Math.max(0, safeLength - filled);

  const bar = '█'.repeat(filled) + '░'.repeat(empty);
  return { bar, percent };
}

/**
 * Formats a timestamp into a readable date string.
 */
export function formatTimestamp(timestamp?: number, format = 'YYYY-MM-DD HH:mm'): string {
  if (!timestamp) return '';

  const date = new Date(timestamp);
  if (isNaN(date.getTime())) return '';

  const YYYY = date.getFullYear().toString();
  const MM = String(date.getMonth() + 1).padStart(2, '0');
  const DD = String(date.getDate()).padStart(2, '0');
  const HH = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');

  return format
    .replace(/YYYY/g, YYYY)
    .replace(/MM/g, MM)
    .replace(/DD/g, DD)
    .replace(/HH/g, HH)
    .replace(/mm/g, mm)
    .replace(/ss/g, ss);
}

/**
 * Cleans up and escapes text for Markdown quotes.
 */
export function formatQuoteText(text: string): string {
  if (!text) return '';
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line, i, arr) => line.length > 0 || (i > 0 && i < arr.length - 1 && arr[i - 1].length > 0))
    .join('\n');
}

/**
 * Truncates text with ellipsis if it exceeds maxLength.
 */
export function truncateText(text: string, maxLength = 80): string {
  if (!text || text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}
