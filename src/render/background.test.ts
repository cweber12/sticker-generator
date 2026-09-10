import { describe, it, expect } from 'vitest';
import { isHexColor, pickBackgroundColor } from './background';

/** Builds RGBA pixel data, calling `at` for every pixel. */
function pixels(
  w: number,
  h: number,
  at: (x: number, y: number) => [number, number, number, number],
): Uint8ClampedArray {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, b, a] = at(x, y);
      const i = (y * w + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = a;
    }
  }
  return data;
}

const onRing = (x: number, y: number, w: number, h: number) =>
  x === 0 || y === 0 || x === w - 1 || y === h - 1;

describe('pickBackgroundColor', () => {
  it('returns the ring colour when the border is uniform', () => {
    const data = pixels(8, 8, () => [232, 213, 176, 255]);
    expect(pickBackgroundColor(data, 8, 8)).toBe('#e8d5b0');
  });

  it('samples the border, not the middle', () => {
    // The whole point: a tarot card is mostly sky and gold, but its mat is tan.
    const data = pixels(16, 16, (x, y) =>
      onRing(x, y, 16, 16) ? [232, 213, 176, 255] : [30, 100, 200, 255],
    );
    expect(pickBackgroundColor(data, 16, 16)).toBe('#e8d5b0');
  });

  it('ignores outliers on the ring', () => {
    // This is why it is a median and not a mean: a signature in the corner, or
    // a rendering artefact along one edge, must not drag the mat off-colour.
    const data = pixels(16, 16, (x, y) => {
      if (!onRing(x, y, 16, 16)) return [30, 100, 200, 255];
      return y === 0 && x < 6 ? [0, 0, 0, 255] : [232, 213, 176, 255];
    });
    expect(pickBackgroundColor(data, 16, 16)).toBe('#e8d5b0');
  });

  it('ignores transparent edge pixels', () => {
    const data = pixels(16, 16, (x, y) => {
      if (!onRing(x, y, 16, 16)) return [30, 100, 200, 255];
      return x === 0 ? [255, 0, 0, 0] : [232, 213, 176, 255];
    });
    expect(pickBackgroundColor(data, 16, 16)).toBe('#e8d5b0');
  });

  it('falls back to white when the whole ring is transparent', () => {
    const data = pixels(8, 8, () => [255, 0, 0, 0]);
    expect(pickBackgroundColor(data, 8, 8)).toBe('#ffffff');
  });

  it('pads each channel to two hex digits', () => {
    const data = pixels(8, 8, () => [1, 2, 3, 255]);
    expect(pickBackgroundColor(data, 8, 8)).toBe('#010203');
  });

  it('refuses a buffer that is shorter than the dimensions claim', () => {
    // The stubbed canvas in this suite returns exactly this. Without the
    // length check it reads undefined and reports "#NaNNaNNaN" as a colour.
    expect(pickBackgroundColor(new Uint8ClampedArray(4), 64, 64)).toBe('#ffffff');
  });

  it('survives degenerate dimensions without throwing', () => {
    for (const [w, h] of [
      [0, 0],
      [1, 1],
      [1, 8],
      [8, 1],
    ]) {
      const data = pixels(Math.max(w, 0), Math.max(h, 0), () => [10, 20, 30, 255]);
      expect(() => pickBackgroundColor(data, w, h)).not.toThrow();
      expect(pickBackgroundColor(data, w, h)).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});

describe('isHexColor', () => {
  it('accepts six-digit hex in either case', () => {
    expect(isHexColor('#e8d5b0')).toBe(true);
    expect(isHexColor('#E8D5B0')).toBe(true);
  });

  it('rejects anything the canvas would silently ignore', () => {
    for (const value of ['auto', '#fff', 'e8d5b0', '#gggggg', '', 'red', '#e8d5b0 ']) {
      expect(isHexColor(value)).toBe(false);
    }
  });
});
