export const READEST_COLOR_MAP: Record<string, { name: string; hex: string; emoji: string }> = {
  yellow: { name: 'Yellow', hex: '#facc15', emoji: '🟡' },
  red: { name: 'Red', hex: '#f87171', emoji: '🔴' },
  green: { name: 'Green', hex: '#4ade80', emoji: '🟢' },
  blue: { name: 'Blue', hex: '#60a5fa', emoji: '🔵' },
  violet: { name: 'Violet', hex: '#c084fc', emoji: '🟣' },
  purple: { name: 'Purple', hex: '#c084fc', emoji: '🟣' },
  orange: { name: 'Orange', hex: '#fb923c', emoji: '🟠' },
  pink: { name: 'Pink', hex: '#f472b6', emoji: '🌸' },
  gray: { name: 'Gray', hex: '#9ca3af', emoji: '⚪' },
};

export function getHighlightColorInfo(color?: string): { name: string; hex: string; emoji: string } {
  if (!color) {
    return { name: 'Yellow', hex: '#facc15', emoji: '🟡' };
  }

  const normalized = color.toLowerCase().trim();
  if (READEST_COLOR_MAP[normalized]) {
    return READEST_COLOR_MAP[normalized];
  }

  // If it's already a hex color
  if (normalized.startsWith('#')) {
    return { name: normalized, hex: normalized, emoji: '🏷️' };
  }

  return { name: color, hex: '#facc15', emoji: '💡' };
}
