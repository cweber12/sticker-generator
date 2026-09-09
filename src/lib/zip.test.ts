import { describe, it, expect } from 'vitest';
import { archiveFilename, safeStem, stickerFilename, uniqueFilename } from './zip';

describe('safeStem', () => {
  it('closes spaces up rather than turning them into the field separator', () => {
    expect(safeStem('Sunset Beach')).toBe('SunsetBeach');
  });

  it('preserves the capitalisation the user chose', () => {
    expect(safeStem('sunset BEACH')).toBe('sunsetBEACH');
  });

  it('drops punctuation that filesystems argue about', () => {
    expect(safeStem('Study No. 4 / "Blue"')).toBe('StudyNo4Blue');
    expect(safeStem('Cliffs: Dawn <2>')).toBe('CliffsDawn2');
  });

  it('folds accents instead of emitting them', () => {
    expect(safeStem('Café Crème')).toBe('CafeCreme');
  });

  it('falls back rather than producing a nameless file', () => {
    expect(safeStem('***')).toBe('Sticker');
    expect(safeStem('')).toBe('Sticker');
  });
});

describe('stickerFilename', () => {
  it('uses the type code and the size id', () => {
    expect(stickerFilename('Sunset Beach', '16x20', 'DAK')).toBe('SunsetBeach_DAK_16x20.pdf');
    expect(stickerFilename('Sunset Beach', '8x10', 'PBN')).toBe('SunsetBeach_PBN_8x10.pdf');
  });

  it('passes an unknown size or type through rather than dropping the field', () => {
    expect(stickerFilename('Art', '20x24', 'XYZ')).toBe('Art_XYZ_20x24.pdf');
  });
});

describe('uniqueFilename', () => {
  it('leaves a free name alone', () => {
    expect(uniqueFilename('a.pdf', new Set())).toBe('a.pdf');
  });

  it('suffixes before the extension, not after it', () => {
    expect(uniqueFilename('a.pdf', new Set(['a.pdf']))).toBe('a-2.pdf');
  });

  it('keeps counting past an existing suffix', () => {
    const taken = new Set(['a.pdf', 'a-2.pdf', 'a-3.pdf']);
    expect(uniqueFilename('a.pdf', taken)).toBe('a-4.pdf');
  });

  it('does not claim the name it returns, so the caller stays in control', () => {
    const taken = new Set<string>();
    expect(uniqueFilename('a.pdf', taken)).toBe('a.pdf');
    expect(taken.size).toBe(0);
  });

  it('handles a name with no extension', () => {
    expect(uniqueFilename('README', new Set(['README']))).toBe('README-2');
  });

  it('gives two stickers that reduce to the same name distinct entries', () => {
    // "Sunset Beach" and "sunset beach!" both stem to the same filename, which
    // is the collision the archive has to survive.
    const taken = new Set<string>();
    const first = uniqueFilename(stickerFilename('Sunset Beach', '16x20', 'DAK'), taken);
    taken.add(first);
    const second = uniqueFilename(stickerFilename('Sunset  Beach', '16x20', 'DAK'), taken);

    expect(first).toBe('SunsetBeach_DAK_16x20.pdf');
    expect(second).toBe('SunsetBeach_DAK_16x20-2.pdf');
  });
});

describe('archiveFilename', () => {
  it('is dated in local time', () => {
    expect(archiveFilename(new Date(2026, 8, 9, 14, 30))).toBe('stickers_2026-09-09.zip');
  });

  it('pads single-digit months and days', () => {
    expect(archiveFilename(new Date(2026, 0, 5))).toBe('stickers_2026-01-05.zip');
  });
});
