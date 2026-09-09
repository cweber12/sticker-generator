import { describe, it, expect } from 'vitest';
import { SIZES, TYPES, defaultSubtitle, allVariants, parseVariantKey, variantKey } from './variants';

describe('defaultSubtitle', () => {
  it('prints the full product name, because the product is a kit', () => {
    expect(defaultSubtitle('16x20', 'DAK')).toBe('16 × 20 Diamond Art Kit');
    expect(defaultSubtitle('8x10', 'PBN')).toBe('8 × 10 Paint by Numbers Kit');
  });

  it('never abbreviates to the filter-bar form', () => {
    // `short` exists so the filter buttons stay narrow. It is not what the
    // customer reads off the printed sticker.
    for (const size of SIZES) {
      for (const type of TYPES) {
        expect(defaultSubtitle(size.id, type.id)).toContain(type.label);
      }
    }
  });

  it('degrades to whichever half it knows rather than printing junk', () => {
    expect(defaultSubtitle('16x20', 'nope')).toBe('16 × 20');
    expect(defaultSubtitle('nope', 'DAK')).toBe('Diamond Art Kit');
    expect(defaultSubtitle('nope', 'nope')).toBe('');
  });
});

describe('variantKey', () => {
  it('round-trips every variant a sticker implies', () => {
    const variants = allVariants();
    expect(variants).toHaveLength(SIZES.length * TYPES.length);

    for (const { size, type } of variants) {
      expect(parseVariantKey(variantKey(size, type))).toEqual({ size, type });
    }
  });

  it('rejects a key naming a size or type that no longer exists', () => {
    expect(parseVariantKey('20x24|DAK')).toBeNull();
    expect(parseVariantKey('16x20|XYZ')).toBeNull();
    expect(parseVariantKey('16x20')).toBeNull();
  });
});
