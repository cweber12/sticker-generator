/**
 * Key normalization.
 *
 * One rule, used everywhere: the slug is what joins an uploaded filename to a
 * row in upc-lookup.csv to a saved sticker in catalog.json. If these ever
 * disagree, barcodes attach to the wrong artwork — so there is exactly one
 * implementation and it is tested.
 */

/** Lowercase, strip accents and punctuation, hyphen-separate. */
export function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Loose comparison form for human-entered text (CSV cells, filenames). */
export function compact(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

const SIZE_ALIASES: Record<string, string> = {
  '8x10': '8x10', '8 x 10': '8x10', '8×10': '8x10',
  '10x12': '10x12', '10 x 12': '10x12', '10×12': '10x12',
  '16x20': '16x20', '16 x 20': '16x20', '16×20': '16x20',
};

const TYPE_ALIASES: Record<string, string> = {
  'dak': 'DAK',
  'diamond art': 'DAK',
  'diamond art kit': 'DAK',
  'diamond painting': 'DAK',
  'diamond painting kit': 'DAK',
  'pbn': 'PBN',
  'paint by number': 'PBN',
  'paint by numbers': 'PBN',
  'paint by numbers kit': 'PBN',
};

/** Maps a free-text size cell to a canonical size id, or '' if unrecognized. */
export function normalizeSize(value: string): string {
  if (!value.trim()) return '';
  const c = compact(value);
  return SIZE_ALIASES[c] ?? SIZE_ALIASES[c.replace(/\s+/g, '').replace(/×/g, 'x')] ?? '';
}

/** Maps a free-text type cell to a canonical type id, or '' if unrecognized. */
export function normalizeType(value: string): string {
  if (!value.trim()) return '';
  const c = compact(value);
  if (TYPE_ALIASES[c]) return TYPE_ALIASES[c];
  const alias = Object.keys(TYPE_ALIASES)
    .sort((a, b) => b.length - a.length)
    .find((key) => c.includes(key));
  return alias ? TYPE_ALIASES[alias] : '';
}

/**
 * The join key between a sticker and a upc-lookup.csv row.
 * Shape: "sunset-beach|16x20|DAK".
 */
export function lookupKey(artName: string, size: string, type: string): string {
  return `${slugify(artName)}|${size}|${type}`;
}
