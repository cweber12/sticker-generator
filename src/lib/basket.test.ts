import { describe, it, expect } from 'vitest';
import {
  addVariant,
  basketRequests,
  groupBasket,
  parseRequestKey,
  requestKey,
  stickerCount,
} from './basket';
import type { Sticker } from '@/types';

const MARKS = { barcode: true, logo: false };

function sticker(masterFile: string): Sticker {
  const artName = masterFile.replace(/\.\w+$/, '');
  return {
    id: masterFile,
    artName,
    slug: artName.toLowerCase().replace(/\s+/g, '-'),
    masterFile,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    overrides: {},
    variantOverrides: {},
  };
}

describe('requestKey', () => {
  it('joins the sticker id, the size and the type', () => {
    expect(requestKey('Sunset Beach.png', '16x20', 'DAK')).toBe('Sunset Beach.png|16x20|DAK');
  });

  it('round-trips through parseRequestKey', () => {
    const key = requestKey('Sunset Beach.png', '8x10', 'PBN');
    expect(parseRequestKey(key)).toEqual({
      stickerId: 'Sunset Beach.png',
      size: '8x10',
      type: 'PBN',
    });
  });

  it('parses a filename that itself contains a separator', () => {
    // Ids are filenames. Size and type ids never contain "|", so the split
    // has to come from the right or an odd filename loses its tail.
    const key = requestKey('Odd|Name.png', '16x20', 'DAK');
    expect(parseRequestKey(key)?.stickerId).toBe('Odd|Name.png');
  });

  it('rejects a key with an unknown size or type rather than guessing', () => {
    expect(parseRequestKey('Art.png|20x24|DAK')).toBeNull();
    expect(parseRequestKey('Art.png|16x20|XYZ')).toBeNull();
    expect(parseRequestKey('nonsense')).toBeNull();
  });
});

describe('addVariant', () => {
  it('adds one entry per sticker at the given variant', () => {
    const next = addVariant(new Set(), ['a.png', 'b.png'], '16x20', 'DAK');
    expect([...next].sort()).toEqual(['a.png|16x20|DAK', 'b.png|16x20|DAK']);
  });

  it('is idempotent — a second Add at the same variant changes nothing', () => {
    const once = addVariant(new Set(), ['a.png'], '16x20', 'DAK');
    const twice = addVariant(once, ['a.png'], '16x20', 'DAK');
    expect([...twice]).toEqual([...once]);
  });

  it('keeps the same sticker at a second variant as a separate entry', () => {
    const first = addVariant(new Set(), ['a.png'], '16x20', 'DAK');
    const second = addVariant(first, ['a.png'], '8x10', 'PBN');
    expect([...second].sort()).toEqual(['a.png|16x20|DAK', 'a.png|8x10|PBN']);
  });

  it('does not mutate the basket it was given', () => {
    const before = new Set(['a.png|16x20|DAK']);
    addVariant(before, ['b.png'], '8x10', 'PBN');
    expect(before.size).toBe(1);
  });
});

describe('stickerCount', () => {
  it('counts distinct stickers, not entries', () => {
    expect(stickerCount(new Set(['a.png|16x20|DAK', 'a.png|8x10|PBN', 'b.png|8x10|PBN']))).toBe(2);
  });

  it('ignores a key it cannot parse', () => {
    expect(stickerCount(new Set(['nonsense']))).toBe(0);
  });
});

describe('basketRequests', () => {
  const order = [sticker('Aaa.png'), sticker('Bbb.png')];

  it('carries the download marks onto every request', () => {
    const basket = new Set(['Aaa.png|16x20|DAK']);
    expect(basketRequests(basket, order, { barcode: false, logo: true })).toEqual([
      { stickerId: 'Aaa.png', size: '16x20', type: 'DAK', barcode: false, logo: true },
    ]);
  });

  it('comes out in library order, then size order, then type order', () => {
    const basket = new Set(['Bbb.png|8x10|DAK', 'Aaa.png|16x20|PBN', 'Aaa.png|8x10|DAK']);
    expect(
      basketRequests(basket, order, MARKS).map((r) => `${r.stickerId} ${r.size} ${r.type}`),
    ).toEqual(['Aaa.png 8x10 DAK', 'Aaa.png 16x20 PBN', 'Bbb.png 8x10 DAK']);
  });

  it('skips an entry whose sticker is not in the folder right now', () => {
    // ADR-0003: absence may be a sync client mid-write. The entry stays in
    // the basket; it simply is not rendered this time.
    const basket = new Set(['Gone.png|16x20|DAK', 'Aaa.png|16x20|DAK']);
    expect(basketRequests(basket, order, MARKS).map((r) => r.stickerId)).toEqual(['Aaa.png']);
  });
});

describe('groupBasket', () => {
  const order = [sticker('Aaa.png'), sticker('Bbb.png')];

  it('groups the variants of one sticker together, in library order', () => {
    const basket = new Set(['Bbb.png|8x10|DAK', 'Aaa.png|16x20|PBN', 'Aaa.png|8x10|DAK']);
    const groups = groupBasket(basket, order);

    expect(groups.map((g) => g.stickerId)).toEqual(['Aaa.png', 'Bbb.png']);
    expect(groups[0].entries.map((e) => `${e.size} ${e.type}`)).toEqual(['8x10 DAK', '16x20 PBN']);
  });

  it('keeps a missing sticker as a group with no record, listed last', () => {
    const basket = new Set(['Gone.png|16x20|DAK', 'Aaa.png|16x20|DAK']);
    const groups = groupBasket(basket, order);

    expect(groups.map((g) => g.stickerId)).toEqual(['Aaa.png', 'Gone.png']);
    expect(groups[0].sticker).not.toBeNull();
    expect(groups[1].sticker).toBeNull();
  });

  it('drops a key that does not parse rather than rendering a broken row', () => {
    expect(groupBasket(new Set(['nonsense']), order)).toEqual([]);
  });
});
