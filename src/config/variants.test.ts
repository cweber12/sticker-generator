import { describe, it, expect } from 'vitest';
import { SIZES, TYPES, defaultSubtitle, allVariants, parseVariantKey, variantKey } from './variants';

describe('defaultSubtitle', () => {
  it('prints the unspaced size and the full product name', () => {
    expect(defaultSubtitle('16x20', 'DAK')).toBe('16x20 Diamond Art Kit');
    expect(defaultSubtitle('8x10', 'PBN')).toBe('8x10 Paint by Numbers Kit');
  });

  it('never uses a UI form on the sticker', () => {
    // The filter bar gets the prettier "16 × 20" and the abbreviated
    // "Diamond Art". Neither is what the customer reads off the print.
    for (const size of SIZES) {
      for (const type of TYPES) {
        const subtitle = defaultSubtitle(size.id, type.id);
        expect(subtitle).toContain(size.id);
        expect(subtitle).toContain(type.label);
        expect(subtitle).not.toContain('×');
        // Exactly one space, between the size and the product name.
        expect(subtitle.split(' ')[0]).toBe(size.id);
      }
    }
  });

  it('degrades to whichever half it knows rather than printing junk', () => {
    expect(defaultSubtitle('16x20', 'nope')).toBe('16x20');
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
