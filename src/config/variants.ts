/**
 * The ONLY place sizes and product types are enumerated.
 *
 * Adding a size or a product line is a one-line change here: the filter bar,
 * the variant matrix, the Drive folder names and the export filenames all read
 * from these tables.
 */

export interface SizeDef {
  /** Canonical id — also the Drive folder name and the filename fragment. */
  id: string;
  /** Human label for the UI. */
  label: string;
}

export interface TypeDef {
  id: string;
  /** Full product name, used in the label subtitle. */
  label: string;
  /** Short form used on the sticker when the full name will not fit. */
  short: string;
  /** Filename fragment, e.g. ArtName_DAK_16x20.pdf */
  code: string;
  /** Drive folder name under library/. */
  folder: string;
  /** Marks pre-selected when this type is chosen. User can override freely. */
  defaultMarks: { barcode: boolean; logo: boolean };
}

export const SIZES: readonly SizeDef[] = [
  { id: '8x10', label: '8 × 10' },
  { id: '10x12', label: '10 × 12' },
  { id: '16x20', label: '16 × 20' },
] as const;

export const TYPES: readonly TypeDef[] = [
  {
    id: 'DAK',
    label: 'Diamond Art Kit',
    short: 'Diamond Art',
    code: 'DAK',
    folder: 'DiamondArtKit',
    defaultMarks: { barcode: true, logo: false },
  },
  {
    id: 'PBN',
    label: 'Paint by Numbers Kit',
    short: 'Paint by Numbers',
    code: 'PBN',
    folder: 'PaintByNumbersKit',
    defaultMarks: { barcode: true, logo: false },
  },
] as const;

export type SizeId = string;
export type TypeId = string;

/** Stable key for a size × type pair, e.g. "16x20|DAK". */
export type VariantKey = string;

export const SIZE_IDS: readonly string[] = SIZES.map((s) => s.id);
export const TYPE_IDS: readonly string[] = TYPES.map((t) => t.id);

export function variantKey(size: SizeId, type: TypeId): VariantKey {
  return `${size}|${type}`;
}

export function parseVariantKey(key: VariantKey): { size: SizeId; type: TypeId } | null {
  const [size, type] = key.split('|');
  if (!size || !type) return null;
  if (!SIZE_IDS.includes(size) || !TYPE_IDS.includes(type)) return null;
  return { size, type };
}

export function getSize(id: SizeId): SizeDef | undefined {
  return SIZES.find((s) => s.id === id);
}

export function getType(id: TypeId): TypeDef | undefined {
  return TYPES.find((t) => t.id === id);
}

/** Every size × type combination. One image implies all of these. */
export function allVariants(): { size: SizeId; type: TypeId }[] {
  return SIZES.flatMap((s) => TYPES.map((t) => ({ size: s.id, type: t.id })));
}

/**
 * The subtitle line printed under the art name, e.g. "16 × 20 Diamond Art".
 * Uses the short product name; the editor can override per sticker.
 */
export function defaultSubtitle(size: SizeId, type: TypeId): string {
  const s = getSize(size);
  const t = getType(type);
  if (!s && !t) return '';
  if (!t) return s!.label;
  if (!s) return t.short;
  return `${s.label} ${t.short}`;
}
