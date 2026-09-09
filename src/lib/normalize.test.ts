import { describe, it, expect } from 'vitest';
import { slugify, normalizeSize, normalizeType, lookupKey, compact } from './normalize';

describe('slugify', () => {
  it('lowercases and hyphenates', () => {
    expect(slugify('Sunset Beach')).toBe('sunset-beach');
  });

  it('collapses runs of punctuation and whitespace', () => {
    expect(slugify('Sunset  --  Beach!!')).toBe('sunset-beach');
  });

  it('strips leading and trailing separators', () => {
    expect(slugify('  ~Sunset Beach~  ')).toBe('sunset-beach');
  });

  it('strips accents so casing and diacritics cannot split a key', () => {
    expect(slugify('Café Crème')).toBe('cafe-creme');
    expect(slugify('CAFE CREME')).toBe(slugify('Café Crème'));
  });

  it('keeps digits', () => {
    expect(slugify('Study No. 4')).toBe('study-no-4');
  });

  it('returns empty for input with no alphanumerics', () => {
    expect(slugify('---')).toBe('');
  });
});

describe('normalizeSize', () => {
  it('accepts every spelling of the same size', () => {
    for (const v of ['8x10', '8 x 10', '8×10', '8X10', ' 8 X 10 ']) {
      expect(normalizeSize(v)).toBe('8x10');
    }
  });

  it('returns empty for an unknown size rather than guessing', () => {
    expect(normalizeSize('20x24')).toBe('');
    expect(normalizeSize('')).toBe('');
  });
});

describe('normalizeType', () => {
  it('maps product name variants to codes', () => {
    expect(normalizeType('Diamond Art')).toBe('DAK');
    expect(normalizeType('diamond painting kit')).toBe('DAK');
    expect(normalizeType('DAK')).toBe('DAK');
    expect(normalizeType('Paint by Numbers')).toBe('PBN');
    expect(normalizeType('PBN')).toBe('PBN');
  });

  it('prefers the longest matching alias', () => {
    expect(normalizeType('16x20 paint by numbers kit')).toBe('PBN');
  });

  it('returns empty for an unknown type', () => {
    expect(normalizeType('cross stitch')).toBe('');
  });
});

describe('lookupKey', () => {
  it('is stable across casing and punctuation drift', () => {
    expect(lookupKey('Sunset Beach', '16x20', 'DAK')).toBe('sunset-beach|16x20|DAK');
    expect(lookupKey('sunset  beach', '16x20', 'DAK')).toBe(
      lookupKey('Sunset Beach', '16x20', 'DAK'),
    );
  });

  it('distinguishes variants of the same artwork', () => {
    expect(lookupKey('A', '8x10', 'DAK')).not.toBe(lookupKey('A', '8x10', 'PBN'));
    expect(lookupKey('A', '8x10', 'DAK')).not.toBe(lookupKey('A', '16x20', 'DAK'));
  });
});

describe('compact', () => {
  it('trims and collapses internal whitespace', () => {
    expect(compact('  Diamond   Art  ')).toBe('diamond art');
  });
});
