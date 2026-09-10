import type { LabelTemplate } from '@/config/template';
import type { SizeId, TypeId, VariantKey } from '@/config/variants';
import { defaultSubtitle, variantKey } from '@/config/variants';

/**
 * The two nouns of the application.
 *
 * v1's `StickerRow` was a spreadsheet record with an image attached, which is
 * why it needed column mapping, fuzzy name matching and a `needsReview` flag.
 * In v2 the image IS the record, and size/type are not properties of it — they
 * are axes of a REQUEST. That split is what removes the matching problem.
 */

/** Fields a sticker may override on top of the global template. */
export interface LabelOverride extends Partial<LabelTemplate> {
  /** Display name, when it should differ from the parsed filename. */
  artName?: string;
  /** Subtitle line, when it should differ from "<size> <type short>". */
  subtitle?: string;
}

/** Persistent. One per uploaded artwork. Lives in stickers.json. */
export interface Sticker {
  id: string;
  /** Parsed from the filename, user-editable. */
  artName: string;
  /** slugify(artName) — the join key to upc-lookup.csv. */
  slug: string;
  /** Filename of the master image inside the library folder's masters/. */
  masterFile: string;
  createdAt: string;
  updatedAt: string;
  /**
   * SPARSE. A key that is absent inherits the global template, so reverting a
   * field is `delete overrides[key]` — exact, not "restore a remembered value".
   */
  overrides: LabelOverride;
  /** SPARSE and rare: overrides that apply to one size x type only. */
  variantOverrides: Record<VariantKey, LabelOverride>;
}

/**
 * Ephemeral. What the user is asking for right now. Never persisted.
 * A download is simply StickerRequest[] -> ZIP.
 */
export interface StickerRequest {
  stickerId: string;
  size: SizeId;
  type: TypeId;
  barcode: boolean;
  logo: boolean;
}

/**
 * The Variant everything is currently drawn as, and that Add will use.
 *
 * NOT a filter: changing it removes no card from the grid. Search is the only
 * filter. Marks are deliberately absent — they belong to the download, not to
 * a request. See docs/adr/0004-the-basket-of-requests.md.
 */
export interface Variant {
  size: SizeId;
  type: TypeId;
}

/**
 * What the user is currently asking to see. Filters describe a REQUEST, never
 * a sticker: changing one must not mutate anything persistent.
 */
export interface Filters {
  size: SizeId;
  type: TypeId;
  barcode: boolean;
  logo: boolean;
}

/** The whole index, as stored in stickers.json at the library folder root. */
export interface Library {
  version: 1;
  updatedAt: string;
  template: LabelTemplate;
  stickers: Sticker[];
}

/** Resolves template -> sticker overrides -> variant overrides, in that order. */
export function resolveTemplate(
  template: LabelTemplate,
  sticker: Pick<Sticker, 'overrides' | 'variantOverrides'>,
  key?: VariantKey,
): LabelTemplate {
  const variant = key ? sticker.variantOverrides[key] : undefined;
  return { ...template, ...geometryOnly(sticker.overrides), ...geometryOnly(variant) };
}

/**
 * The two text lines for one request.
 *
 * Same precedence as the geometry: variant override, then sticker override,
 * then the derived default. Reading it in one place stops the grid preview and
 * the exported PDF from disagreeing about what a sticker is called.
 */
export function resolveLabelText(
  sticker: Pick<Sticker, 'artName' | 'overrides' | 'variantOverrides'>,
  size: SizeId,
  type: TypeId,
): { artName: string; subtitle: string } {
  const variant = sticker.variantOverrides[variantKey(size, type)];
  return {
    artName: variant?.artName ?? sticker.overrides.artName ?? sticker.artName,
    subtitle: variant?.subtitle ?? sticker.overrides.subtitle ?? defaultSubtitle(size, type),
  };
}

/**
 * The UPC for one request, or null when the lookup has no row for it.
 *
 * Keyed on the stored slug, which is what joins a sticker to a row in
 * upc-lookup.csv. Same shape as lib/normalize's lookupKey:
 * "sunset-beach|16x20|DAK".
 */
export function upcFor(
  upcs: Readonly<Record<string, string>>,
  sticker: Pick<Sticker, 'slug'>,
  size: SizeId,
  type: TypeId,
): string | null {
  return upcs[`${sticker.slug}|${variantKey(size, type)}`] ?? null;
}

/** Text overrides are not template fields — drop them before merging. */
function geometryOnly(o: LabelOverride | undefined): Partial<LabelTemplate> {
  if (!o) return {};
  const out: Partial<LabelTemplate> = {};
  for (const [k, v] of Object.entries(o)) {
    if (k === 'artName' || k === 'subtitle') continue;
    (out as Record<string, unknown>)[k] = v;
  }
  return out;
}
