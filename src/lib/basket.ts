import type { SizeId, TypeId } from '@/config/variants';
import { SIZES, TYPES } from '@/config/variants';
import type { Marks } from '@/render/slots';
import type { Sticker, StickerRequest } from '@/types';

/**
 * The basket, as a set of keys.
 *
 * A basket entry is a Sticker + a Variant, and nothing else. Marks are NOT
 * part of it: `stickerFilename()` is `ArtName_DAK_16x20.pdf`, so two entries
 * differing only by marks would produce the same filename and the difference
 * would be invisible to whoever prints them. Marks belong to the download —
 * see docs/adr/0004-the-basket-of-requests.md.
 *
 * Distinct from `VariantKey` in config/variants.ts, which is persisted as the
 * key of `variantOverrides` in stickers.json. These two must not be conflated.
 */
export type RequestKey = string;

const SEP = '|';

export function requestKey(stickerId: string, size: SizeId, type: TypeId): RequestKey {
  return `${stickerId}${SEP}${size}${SEP}${type}`;
}

/**
 * Splits from the RIGHT, because the id is a filename and a filename is not
 * ours to constrain. Size and type ids are enumerated in variants.ts and never
 * contain a separator, so the last two fields are unambiguous.
 *
 * Returns null for a size or type this build does not know, rather than
 * inventing one: a key written by a future version is not a rendering job.
 */
export function parseRequestKey(
  key: RequestKey,
): { stickerId: string; size: SizeId; type: TypeId } | null {
  const parts = key.split(SEP);
  if (parts.length < 3) return null;

  const type = parts[parts.length - 1];
  const size = parts[parts.length - 2];
  const stickerId = parts.slice(0, -2).join(SEP);

  if (!stickerId) return null;
  if (!SIZES.some((s) => s.id === size)) return null;
  if (!TYPES.some((t) => t.id === type)) return null;

  return { stickerId, size, type };
}

/**
 * Add, as a union.
 *
 * Adding a sticker already in the basket at that variant is a no-op — two
 * requests at one variant are byte-identical PDFs, so a duplicate has no
 * meaning and the model should not be able to hold one.
 */
export function addVariant(
  basket: ReadonlySet<RequestKey>,
  stickerIds: Iterable<string>,
  size: SizeId,
  type: TypeId,
): Set<RequestKey> {
  const next = new Set(basket);
  for (const id of stickerIds) next.add(requestKey(id, size, type));
  return next;
}

/** How many distinct stickers the basket touches — the "7 stickers" half of the count. */
export function stickerCount(basket: ReadonlySet<RequestKey>): number {
  const ids = new Set<string>();
  for (const key of basket) {
    const parsed = parseRequestKey(key);
    if (parsed) ids.add(parsed.stickerId);
  }
  return ids.size;
}

/**
 * The basket as a render list.
 *
 * Ordered by the library, then by size, then by type, so the archive comes out
 * in the same order as the grid it was picked from and two runs of the same
 * basket produce the same ZIP.
 *
 * An entry whose sticker is not in `order` is skipped rather than failed: the
 * caller keeps it in the basket, because a file can be briefly missing while
 * the sync client writes it (ADR-0003).
 */
export function basketRequests(
  basket: ReadonlySet<RequestKey>,
  order: readonly Sticker[],
  marks: Marks,
): StickerRequest[] {
  const requests: StickerRequest[] = [];

  for (const sticker of order) {
    for (const size of SIZES) {
      for (const type of TYPES) {
        if (!basket.has(requestKey(sticker.id, size.id, type.id))) continue;
        requests.push({
          stickerId: sticker.id,
          size: size.id,
          type: type.id,
          barcode: marks.barcode,
          logo: marks.logo,
        });
      }
    }
  }

  return requests;
}

/** One sticker's worth of basket entries, for a panel row. */
export interface BasketGroup {
  stickerId: string;
  /** null when the file is not in the folder right now — the row greys out. */
  sticker: Sticker | null;
  entries: { key: RequestKey; size: SizeId; type: TypeId }[];
}

/**
 * The basket as panel rows: present stickers in library order, then whatever
 * is no longer in the folder, so a disappearance is visible rather than
 * silently shrinking the order.
 */
export function groupBasket(
  basket: ReadonlySet<RequestKey>,
  order: readonly Sticker[],
): BasketGroup[] {
  const groups = new Map<string, BasketGroup>();
  const byId = new Map(order.map((sticker) => [sticker.id, sticker]));

  const add = (stickerId: string, entry: BasketGroup['entries'][number]) => {
    const group = groups.get(stickerId);
    if (group) {
      group.entries.push(entry);
      return;
    }
    groups.set(stickerId, {
      stickerId,
      sticker: byId.get(stickerId) ?? null,
      entries: [entry],
    });
  };

  // Present stickers first, in library order and canonical variant order.
  for (const sticker of order) {
    for (const size of SIZES) {
      for (const type of TYPES) {
        const key = requestKey(sticker.id, size.id, type.id);
        if (basket.has(key)) add(sticker.id, { key, size: size.id, type: type.id });
      }
    }
  }

  // Then anything the folder no longer has, in whatever order it was added.
  for (const key of basket) {
    const parsed = parseRequestKey(key);
    if (!parsed || byId.has(parsed.stickerId)) continue;
    add(parsed.stickerId, { key, size: parsed.size, type: parsed.type });
  }

  return [...groups.values()];
}
