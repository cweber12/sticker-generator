import { describe, it, expect } from 'vitest';
import { parseFilename } from './parseFilename';

describe('parseFilename', () => {
  it('takes the base name as the art name', () => {
    expect(parseFilename('Sunset Beach.png').artName).toBe('Sunset Beach');
  });

  it('strips only the final extension', () => {
    expect(parseFilename('Study No. 4.png').artName).toBe('Study No. 4');
  });

  it('treats a dot-separated noise suffix as noise', () => {
    expect(parseFilename('art.final.png').artName).toBe('art');
  });

  it('leaves hyphenated words alone', () => {
    expect(parseFilename('Twenty-One Pilots.png').artName).toBe('Twenty-One Pilots');
    expect(parseFilename('Blue - Green Study.png').artName).toBe('Blue - Green Study');
  });

  it('handles a name with no extension', () => {
    expect(parseFilename('Sunset Beach').artName).toBe('Sunset Beach');
  });

  it('converts underscores to spaces', () => {
    expect(parseFilename('sunset_beach_at_dusk.jpg').artName).toBe('sunset beach at dusk');
  });

  it('preserves the user capitalisation rather than guessing title case', () => {
    expect(parseFilename('SUNSET BEACH.png').artName).toBe('SUNSET BEACH');
    expect(parseFilename('Study No. 4 in Bb.png').artName).toBe('Study No. 4 in Bb');
  });

  it('drops a trailing size that belongs to the variant, not the name', () => {
    expect(parseFilename('Sunset Beach 16x20.png').artName).toBe('Sunset Beach');
    expect(parseFilename('8x10.png').artName).toBe('8x10');
  });

  it('drops batch ordering prefixes', () => {
    expect(parseFilename('01 - Sunset Beach.png').artName).toBe('Sunset Beach');
    expect(parseFilename('003_Sunset Beach.png').artName).toBe('Sunset Beach');
    expect(parseFilename('12.Sunset Beach.png').artName).toBe('Sunset Beach');
  });

  it('does not eat digits that are part of the name', () => {
    expect(parseFilename('4 Seasons.png').artName).toBe('4 Seasons');
  });

  it('drops export noise suffixes, including stacked ones', () => {
    expect(parseFilename('Sunset Beach_final.png').artName).toBe('Sunset Beach');
    expect(parseFilename('Sunset Beach-v2.png').artName).toBe('Sunset Beach');
    expect(parseFilename('Sunset Beach_final_v3.png').artName).toBe('Sunset Beach');
    expect(parseFilename('Sunset Beach hi-res.png').artName).toBe('Sunset Beach');
  });

  it('keeps unicode names intact and still slugs them', () => {
    const r = parseFilename('Café Crème.png');
    expect(r.artName).toBe('Café Crème');
    expect(r.slug).toBe('cafe-creme');
  });

  it('produces a matching slug', () => {
    expect(parseFilename('Sunset  Beach.PNG').slug).toBe('sunset-beach');
  });

  it('retains the original filename for duplicate reporting', () => {
    expect(parseFilename('01 - Sunset Beach.png').originalName).toBe('01 - Sunset Beach.png');
  });

  it('survives a dotfile-style name', () => {
    expect(parseFilename('.hidden').artName).toBe('.hidden');
  });
});
