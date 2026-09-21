/**
 * Pure text helpers shared by the API (size extraction) and the UI
 * (color / size / descriptive matching). No DOM or Node dependencies.
 */

export interface ColorDef {
  key: string;
  label: string;
  css: string;
  words: string[];
}

export const COLORS: ColorDef[] = [
  { key: 'red', label: 'Red', css: '#c0392b', words: ['red', 'reddish', 'crimson', 'scarlet', 'rufous', 'ruddy', 'vermilion', 'maroon'] },
  { key: 'orange', label: 'Orange', css: '#e67e22', words: ['orange', 'orangish', 'tawny', 'rust', 'rusty', 'ochre', 'apricot'] },
  { key: 'yellow', label: 'Yellow', css: '#f1c40f', words: ['yellow', 'yellowish', 'golden', 'gold', 'lemon'] },
  { key: 'green', label: 'Green', css: '#27ae60', words: ['green', 'greenish', 'olive', 'emerald'] },
  { key: 'blue', label: 'Blue', css: '#2980b9', words: ['blue', 'bluish', 'azure', 'cobalt', 'cerulean', 'indigo'] },
  { key: 'purple', label: 'Purple', css: '#8e44ad', words: ['purple', 'purplish', 'violet', 'lavender', 'lilac'] },
  { key: 'pink', label: 'Pink', css: '#e84393', words: ['pink', 'pinkish', 'rose', 'rosy', 'salmon'] },
  { key: 'brown', label: 'Brown', css: '#8d6e4b', words: ['brown', 'brownish', 'tan', 'chestnut', 'cinnamon', 'beige', 'sandy', 'fawn', 'buff'] },
  { key: 'gray', label: 'Gray', css: '#7f8c8d', words: ['gray', 'grey', 'grayish', 'greyish', 'silver', 'silvery', 'slate', 'ashy'] },
  { key: 'black', label: 'Black', css: '#222222', words: ['black', 'blackish', 'jet', 'sooty', 'ebony'] },
  { key: 'white', label: 'White', css: '#f5f5f5', words: ['white', 'whitish', 'cream', 'ivory', 'snowy', 'pale'] },
];

const colorRegex = new Map<string, RegExp>(
  COLORS.map((c) => [c.key, new RegExp(`\\b(?:${c.words.join('|')})\\b`, 'i')]),
);

export function hasColor(text: string, colorKey: string): boolean {
  const re = colorRegex.get(colorKey);
  return re ? re.test(text) : false;
}

/* ---------------------------------------------------------------- size --- */

export type SizeKey = 'tiny' | 'small' | 'medium' | 'large';

export const SIZES: { key: SizeKey; label: string; hint: string; min: number; max: number }[] = [
  { key: 'tiny', label: 'Tiny', hint: 'under 5 cm / 2 in', min: 0, max: 5 },
  { key: 'small', label: 'Small', hint: '5–30 cm / 2–12 in', min: 5, max: 30 },
  { key: 'medium', label: 'Medium', hint: '30 cm–1 m / 1–3 ft', min: 30, max: 100 },
  { key: 'large', label: 'Large', hint: 'over 1 m / 3 ft', min: 100, max: Infinity },
];

export function sizeBucket(cm: number | null): SizeKey | null {
  if (cm == null) return null;
  for (const s of SIZES) if (cm >= s.min && cm < s.max) return s.key;
  return null;
}

const UNIT_TO_CM: Record<string, number> = {
  mm: 0.1, millimetre: 0.1, millimetres: 0.1, millimeter: 0.1, millimeters: 0.1,
  cm: 1, centimetre: 1, centimetres: 1, centimeter: 1, centimeters: 1,
  m: 100, metre: 100, metres: 100, meter: 100, meters: 100,
  in: 2.54, inch: 2.54, inches: 2.54,
  ft: 30.48, foot: 30.48, feet: 30.48,
};

const MEASURE_RE =
  /(\d+(?:[.,]\d+)?)\s*(?:(?:–|-|to|and)\s*(\d+(?:[.,]\d+)?)\s*)?(mm|millimet(?:re|er)s?|cm|centimet(?:re|er)s?|m|met(?:re|er)s?|in|inch(?:es)?|ft|foot|feet)\b(?![a-z])/gi;

const SIZE_CONTEXT_RE =
  /\b(long|length|lengths|tall|height|wingspan|span|grow|grows|growing|reach|reaches|reaching|measure|measures|measuring|size|sized|body|bodies|shell|carapace|diameter|across|snout|total|adult|adults|averag\w*|up to|large|small)\b/i;

/**
 * Best-effort body size (cm) from a Wikipedia-style summary. Only counts
 * measurements that appear shortly after a size-related word, and returns the
 * largest such value (typically max adult length or wingspan).
 */
export function extractSizeCm(text: string): number | null {
  if (!text) return null;
  let best: number | null = null;
  for (const m of text.matchAll(MEASURE_RE)) {
    const start = m.index ?? 0;
    const context = text.slice(Math.max(0, start - 90), start);
    if (!SIZE_CONTEXT_RE.test(context)) continue;
    const unit = m[3].toLowerCase();
    const factor = UNIT_TO_CM[unit];
    if (!factor) continue;
    const a = parseFloat(m[1].replace(',', '.'));
    const b = m[2] ? parseFloat(m[2].replace(',', '.')) : a;
    const cm = Math.max(a, b) * factor;
    if (!Number.isFinite(cm) || cm <= 0 || cm > 4000) continue;
    if (best == null || cm > best) best = cm;
  }
  return best;
}

export function formatSize(cm: number): string {
  if (cm < 1) return `${Math.round(cm * 10)} mm`;
  if (cm < 100) return `${Math.round(cm * 10) / 10} cm`;
  return `${Math.round(cm / 10) / 10} m`;
}

/* -------------------------------------------------------- text search --- */

const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'of', 'in', 'on', 'at', 'with', 'is', 'are', 'it', 'its', 'that', 'this',
  'has', 'have', 'to', 'by', 'for', 'from', 'as', 'be', 'very', 'some', 'like', 'looks', 'look', 'animal',
]);

export function tokenize(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t))
    .map((t) => (t.length >= 4 && t.endsWith('s') && !t.endsWith('ss') ? t.slice(0, -1) : t));
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Compile tokens into word-prefix regexes (e.g. "wing" matches "wings", "winged"). */
export function compileTokens(tokens: string[]): RegExp[] {
  return tokens.map((t) => new RegExp(`\\b${escapeRe(t)}`, 'i'));
}

export function matchesAll(haystack: string, patterns: RegExp[]): boolean {
  for (const p of patterns) if (!p.test(haystack)) return false;
  return true;
}

/** Short excerpt around the first match of any pattern, for card snippets. */
export function snippet(text: string, patterns: RegExp[], width = 160): string {
  if (!text) return '';
  let idx = -1;
  for (const p of patterns) {
    const m = p.exec(text);
    if (m && (idx === -1 || m.index < idx)) idx = m.index;
  }
  if (idx <= 0) return text.length > width ? text.slice(0, width).replace(/\s+\S*$/, '') + '…' : text;
  const start = Math.max(0, idx - Math.floor(width / 3));
  const end = Math.min(text.length, start + width);
  return (start > 0 ? '…' : '') + text.slice(start, end).trim() + (end < text.length ? '…' : '');
}
