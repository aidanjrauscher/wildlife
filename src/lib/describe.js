/**
 * Heuristics that turn a plain-text species description into structured
 * attributes for filtering: dominant colors mentioned and an approximate
 * body-size bucket parsed from metric measurements.
 */

export const COLORS = [
  { key: 'black', label: 'Black', swatch: '#1f2937', pattern: /\bblack(?:ish)?\b/ },
  { key: 'white', label: 'White', swatch: '#f9fafb', pattern: /\bwhit(?:e|ish)\b/ },
  { key: 'gray', label: 'Gray', swatch: '#9ca3af', pattern: /\bgr[ae]y(?:ish)?\b|\bsilver(?:y)?\b/ },
  { key: 'brown', label: 'Brown', swatch: '#92400e', pattern: /\bbrown(?:ish)?\b|\bchestnut\b|\brufous\b|\brusty\b/ },
  { key: 'tan', label: 'Tan', swatch: '#d6b487', pattern: /\btan\b|\bbuff(?:y)?\b|\bbeige\b|\bcream(?:y)?\b|\bsandy\b/ },
  { key: 'red', label: 'Red', swatch: '#dc2626', pattern: /\bred(?:dish)?\b|\bcrimson\b|\bscarlet\b/ },
  { key: 'orange', label: 'Orange', swatch: '#f97316', pattern: /\borang(?:e|ish)\b/ },
  { key: 'yellow', label: 'Yellow', swatch: '#facc15', pattern: /\byellow(?:ish)?\b|\bgold(?:en)?\b/ },
  { key: 'green', label: 'Green', swatch: '#16a34a', pattern: /\bgreen(?:ish)?\b|\bolive\b/ },
  { key: 'blue', label: 'Blue', swatch: '#2563eb', pattern: /\bblu(?:e|ish)\b/ },
  { key: 'purple', label: 'Purple', swatch: '#7c3aed', pattern: /\bpurpl(?:e|ish)\b|\bviolet\b|\blavender\b/ },
  { key: 'pink', label: 'Pink', swatch: '#ec4899', pattern: /\bpink(?:ish)?\b|\brosy\b/ },
];

export const SIZES = [
  { key: 'tiny', label: 'Tiny', hint: 'under 5 cm / 2 in', max: 5 },
  { key: 'small', label: 'Small', hint: '5–25 cm / 2–10 in', max: 25 },
  { key: 'medium', label: 'Medium', hint: '25–100 cm / 10–40 in', max: 100 },
  { key: 'large', label: 'Large', hint: 'over 1 m / 40 in', max: Infinity },
];

export function detectColors(text) {
  if (!text) return [];
  const lower = text.toLowerCase();
  return COLORS.filter((c) => c.pattern.test(lower)).map((c) => c.key);
}

/**
 * Find the largest metric length in the text (mm, cm, m) and return it in cm.
 * Wikipedia intros usually give sizes as "30–40 cm (12–16 in)".
 */
const LENGTH_RE = /(\d+(?:\.\d+)?)(?:\s*(?:–|-|to|and)\s*(\d+(?:\.\d+)?))?\s*(mm|millimet(?:er|re)s?|cm|centimet(?:er|re)s?|m|met(?:er|re)s?)\b/g;
const TO_CM = { mm: 0.1, cm: 1, m: 100 };

export function parseSizeCm(text) {
  if (!text) return null;
  let max = null;
  for (const m of text.matchAll(LENGTH_RE)) {
    const unitWord = m[3];
    const unit = unitWord.startsWith('mm') || unitWord.startsWith('milli') ? 'mm' : unitWord.startsWith('c') ? 'cm' : 'm';
    const raw = Math.max(Number(m[1]), m[2] ? Number(m[2]) : 0);
    const cm = raw * TO_CM[unit];
    // Ignore obvious non-body measurements: depths, elevations, ranges in km, etc.
    if (unit === 'm' && raw > 40) continue;
    if (cm <= 0 || cm > 4000) continue;
    if (max === null || cm > max) max = cm;
  }
  return max;
}

export function sizeBucket(cm) {
  if (cm == null) return null;
  return SIZES.find((s) => cm < s.max)?.key ?? 'large';
}

export function formatSize(cm) {
  if (cm == null) return null;
  const inches = cm / 2.54;
  if (cm >= 100) return `~${(cm / 100).toFixed(1)} m / ${(inches / 12).toFixed(1)} ft`;
  if (cm < 1) return `~${(cm * 10).toFixed(0)} mm / ${inches.toFixed(2)} in`;
  return `~${cm.toFixed(0)} cm / ${inches.toFixed(1)} in`;
}

export function describe(text) {
  const sizeCm = parseSizeCm(text);
  return { colors: detectColors(text), sizeCm, size: sizeBucket(sizeCm) };
}
