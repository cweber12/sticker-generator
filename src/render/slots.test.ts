import { describe, it, expect } from 'vitest';
import {
  computeStickerGeometry,
  nameBaselineY,
  subtitleBaselineY,
  MIN_TEXT_AREA_IN,
} from './slots';
import { DEFAULT_TEMPLATE, STICKER_W_IN, STICKER_H_IN } from '@/config/template';
import { inToPx } from './units';

const T = DEFAULT_TEMPLATE;

const NONE = { barcode: false, logo: false };
const BARCODE = { barcode: true, logo: false };
const LOGO = { barcode: false, logo: true };
const BOTH = { barcode: true, logo: true };

describe('computeStickerGeometry — label box', () => {
  it('places the strip inset from the bottom and both sides', () => {
    const g = computeStickerGeometry(T, NONE);
    expect(g.stickerW).toBe(inToPx(STICKER_W_IN));
    expect(g.stickerH).toBe(inToPx(STICKER_H_IN));
    expect(g.labelX).toBe(inToPx(T.labelInsetIn));
    expect(g.labelW).toBe(g.stickerW - inToPx(T.labelInsetIn) * 2);
    expect(g.labelY + g.labelH).toBe(g.stickerH - inToPx(T.labelInsetIn));
  });

  it('is identical regardless of which marks are enabled', () => {
    const boxes = [NONE, BARCODE, LOGO, BOTH].map((m) => {
      const g = computeStickerGeometry(T, m);
      return [g.labelX, g.labelY, g.labelW, g.labelH].join();
    });
    expect(new Set(boxes).size).toBe(1);
  });
});

describe('computeStickerGeometry — the four mark combinations', () => {
  it('no marks: full padded width, no slots', () => {
    const g = computeStickerGeometry(T, NONE);
    expect(g.slots).toHaveLength(0);
    expect(g.textAreaW).toBe(g.labelW - g.padPx * 2);
    expect(g.overflow).toBe(false);
  });

  it('barcode only: flush right, full label height', () => {
    const g = computeStickerGeometry(T, BARCODE);
    expect(g.slots).toHaveLength(1);
    const [bc] = g.slots;
    expect(bc.kind).toBe('barcode');
    expect(bc.x + bc.w).toBe(g.labelX + g.labelW); // flush to the right edge
    expect(bc.y).toBe(g.labelY);
    expect(bc.h).toBe(g.labelH);
    expect(bc.w).toBe(inToPx(T.barcodeWidthIn));
  });

  it('logo only: right margin of one padding, vertically centred', () => {
    const g = computeStickerGeometry(T, LOGO, 2);
    expect(g.slots).toHaveLength(1);
    const [logo] = g.slots;
    expect(logo.kind).toBe('logo');
    expect(logo.x + logo.w).toBe(g.labelX + g.labelW - g.padPx);
    expect(logo.h).toBe(inToPx(T.logoHeightIn));
    expect(logo.w).toBe(Math.round(logo.h * 2)); // aspect respected
    const topGap = logo.y - g.labelY;
    const bottomGap = g.labelY + g.labelH - (logo.y + logo.h);
    expect(Math.abs(topGap - bottomGap)).toBeLessThanOrEqual(1);
  });

  it('both marks: logo sits left of the barcode with exactly one gap', () => {
    const g = computeStickerGeometry(T, BOTH, 1);
    expect(g.slots).toHaveLength(2);
    const bc = g.slots.find((s) => s.kind === 'barcode')!;
    const logo = g.slots.find((s) => s.kind === 'logo')!;
    expect(logo.x + logo.w).toBe(bc.x - g.padPx);
    expect(bc.x + bc.w).toBe(g.labelX + g.labelW);
  });

  it('never overlaps the text column with a mark', () => {
    for (const marks of [NONE, BARCODE, LOGO, BOTH]) {
      const g = computeStickerGeometry(T, marks, 1.6);
      const textRight = g.textX + g.textAreaW;
      for (const slot of g.slots) {
        expect(slot.x).toBeGreaterThanOrEqual(textRight);
      }
    }
  });

  it('shrinks the text area as marks are added, never the reverse', () => {
    const widths = [NONE, LOGO, BARCODE, BOTH].map(
      (m) => computeStickerGeometry(T, m, 1).textAreaW,
    );
    expect(widths[0]).toBeGreaterThan(widths[1]);
    expect(widths[1]).toBeGreaterThan(widths[3]);
    expect(widths[2]).toBeGreaterThan(widths[3]);
  });
});

describe('computeStickerGeometry — degenerate inputs', () => {
  it('clamps the text area at zero instead of going negative', () => {
    const cramped = { ...T, barcodeWidthIn: 3.5, logoHeightIn: 0.5 };
    const g = computeStickerGeometry(cramped, BOTH, 4);
    expect(g.textAreaW).toBe(0);
    expect(g.textAreaW).not.toBeLessThan(0);
  });

  it('flags overflow when marks crowd out the text', () => {
    const cramped = { ...T, barcodeWidthIn: 3.2 };
    expect(computeStickerGeometry(cramped, BARCODE).overflow).toBe(true);
    expect(computeStickerGeometry(T, BARCODE).overflow).toBe(false);
  });

  it('flags overflow exactly at the MIN_TEXT_AREA_IN boundary', () => {
    const g = computeStickerGeometry(T, NONE);
    expect(g.textAreaW).toBeGreaterThanOrEqual(inToPx(MIN_TEXT_AREA_IN));
  });

  it('survives a zero or negative logo aspect without producing NaN', () => {
    for (const aspect of [0, -3, Number.NaN]) {
      const g = computeStickerGeometry(T, LOGO, aspect);
      const logo = g.slots[0];
      expect(Number.isFinite(logo.w)).toBe(true);
      expect(logo.w).toBeGreaterThan(0);
      expect(Number.isFinite(g.textAreaW)).toBe(true);
    }
  });

  it('handles zero padding', () => {
    const g = computeStickerGeometry({ ...T, labelPaddingIn: 0 }, BOTH, 1);
    expect(g.padPx).toBe(0);
    expect(g.textAreaW).toBeGreaterThan(0);
  });
});

describe('baselines', () => {
  it('keeps the art name inside the strip', () => {
    const g = computeStickerGeometry(T, BARCODE);
    const y = nameBaselineY(g, 52);
    expect(y).toBeGreaterThan(g.labelY);
    expect(y).toBeLessThan(g.labelY + g.labelH);
  });

  it('keeps the subtitle inside the strip and below the name', () => {
    const g = computeStickerGeometry(T, BARCODE);
    expect(subtitleBaselineY(g, 38)).toBeGreaterThan(nameBaselineY(g, 52));
    expect(subtitleBaselineY(g, 38)).toBeLessThan(g.labelY + g.labelH);
  });
});

const CONTAIN = { ...T, fit: 'contain' as const };

/** The three vertical gaps under contain: above the image, between, below. */
function gaps(g: ReturnType<typeof computeStickerGeometry>) {
  return [
    g.image.dy,
    g.labelY - (g.image.dy + g.image.dh),
    g.stickerH - (g.labelY + g.labelH),
  ];
}

describe('computeStickerGeometry - cover artwork', () => {
  it('draws onto the whole canvas whatever the master', () => {
    for (const [w, h] of [[1000, 1200], [600, 1200], [800, 1200], [2000, 500]]) {
      const g = computeStickerGeometry(T, NONE, 1, w, h);
      expect([g.image.dx, g.image.dy, g.image.dw, g.image.dh]).toEqual([
        0, 0, g.stickerW, g.stickerH,
      ]);
    }
  });

  it('crops the width of a master wider than 2:3, centred', () => {
    const g = computeStickerGeometry(T, NONE, 1, 1000, 1200);
    expect(g.image.sw).toBeCloseTo(800, 6);
    expect(g.image.sx).toBeCloseTo(100, 6);
    expect(g.image.sy).toBe(0);
    expect(g.image.sh).toBe(1200);
  });

  it('crops the height of a master taller than 2:3, centred', () => {
    const g = computeStickerGeometry(T, NONE, 1, 600, 1200);
    expect(g.image.sh).toBeCloseTo(900, 6);
    expect(g.image.sy).toBeCloseTo(150, 6);
    expect(g.image.sx).toBe(0);
    expect(g.image.sw).toBe(600);
  });

  it('takes the whole master when it is already 2:3', () => {
    const g = computeStickerGeometry(T, NONE, 1, 800, 1200);
    expect(g.image.sx).toBeCloseTo(0, 6);
    expect(g.image.sy).toBeCloseTo(0, 6);
    expect(g.image.sw).toBeCloseTo(800, 6);
    expect(g.image.sh).toBeCloseTo(1200, 6);
  });

  it('leaves the label where it has always been', () => {
    const g = computeStickerGeometry(T, NONE, 1, 1000, 1200);
    expect(g.labelX).toBe(inToPx(T.labelInsetIn));
    expect(g.labelY + g.labelH).toBe(g.stickerH - inToPx(T.labelInsetIn));
  });
});

describe('computeStickerGeometry - contain artwork', () => {
  it('makes the three vertical gaps equal', () => {
    for (const [w, h] of [[1000, 1200], [1000, 2000], [1050, 1404], [1000, 1000], [900, 1100]]) {
      const [top, middle, bottom] = gaps(computeStickerGeometry(CONTAIN, NONE, 1, w, h));
      expect(top).toBe(bottom);
      // Flooring lets the middle carry a remainder of at most 2px.
      expect(Math.abs(middle - top)).toBeLessThanOrEqual(2);
    }
  });

  it('divides exactly when the arithmetic allows it', () => {
    const [top, middle, bottom] = gaps(computeStickerGeometry(CONTAIN, NONE, 1, 1000, 1200));
    expect([top, middle, bottom]).toEqual([123, 123, 123]);
  });

  it('shows the whole master - never crops', () => {
    for (const [w, h] of [[1000, 1200], [1000, 2000], [2000, 800]]) {
      const g = computeStickerGeometry(CONTAIN, NONE, 1, w, h);
      expect([g.image.sx, g.image.sy, g.image.sw, g.image.sh]).toEqual([0, 0, w, h]);
    }
  });

  it('never lets the image exceed the label width', () => {
    for (const [w, h] of [[1000, 1200], [4000, 1000], [1000, 1000]]) {
      const g = computeStickerGeometry(CONTAIN, NONE, 1, w, h);
      expect(g.image.dw).toBeLessThanOrEqual(g.labelW);
    }
  });

  it('aligns the image edges with the label when it is width-limited', () => {
    const g = computeStickerGeometry(CONTAIN, NONE, 1, 1000, 1200);
    expect(g.image.dx).toBe(g.labelX);
    expect(g.image.dx + g.image.dw).toBe(g.labelX + g.labelW);
  });

  it('centres a master too tall to reach the label width', () => {
    const g = computeStickerGeometry(CONTAIN, NONE, 1, 1000, 2000);
    expect(g.image.dw).toBeLessThan(g.labelW);
    const left = g.image.dx;
    const right = g.stickerW - (g.image.dx + g.image.dw);
    expect(Math.abs(left - right)).toBeLessThanOrEqual(1);
  });

  it('holds the gap at framePaddingIn when the image is height-limited', () => {
    const g = computeStickerGeometry(CONTAIN, NONE, 1, 1000, 2000);
    expect(g.image.dy).toBe(inToPx(CONTAIN.framePaddingIn));
  });

  it('grows the gap past framePaddingIn when the image is width-limited', () => {
    const g = computeStickerGeometry(CONTAIN, NONE, 1, 1000, 1200);
    expect(g.image.dy).toBeGreaterThan(inToPx(CONTAIN.framePaddingIn));
  });

  it('never lets the gap fall below framePaddingIn', () => {
    for (const [w, h] of [[1000, 1200], [1000, 9000], [9000, 1000], [1, 1]]) {
      const g = computeStickerGeometry(CONTAIN, NONE, 1, w, h);
      expect(g.image.dy).toBeGreaterThanOrEqual(inToPx(CONTAIN.framePaddingIn));
    }
  });

  it('insets the label by framePaddingIn, not labelInsetIn', () => {
    const g = computeStickerGeometry(CONTAIN, NONE, 1, 1000, 1200);
    expect(g.labelX).toBe(inToPx(CONTAIN.framePaddingIn));
    expect(g.labelW).toBe(g.stickerW - inToPx(CONTAIN.framePaddingIn) * 2);
  });

  it('keeps the label clear of the bottom edge, unlike cover', () => {
    const g = computeStickerGeometry(CONTAIN, NONE, 1, 1000, 1200);
    expect(g.labelY + g.labelH).toBeLessThan(g.stickerH);
  });

  it('keeps the artwork clear of the label', () => {
    for (const [w, h] of [[1000, 1200], [1000, 2000], [3000, 1000]]) {
      const g = computeStickerGeometry(CONTAIN, BOTH, 1, w, h);
      expect(g.image.dy + g.image.dh).toBeLessThanOrEqual(g.labelY);
    }
  });

  it('places marks against the contained label box', () => {
    const g = computeStickerGeometry(CONTAIN, BARCODE, 1, 1000, 1200);
    const [bc] = g.slots;
    expect(bc.x + bc.w).toBe(g.labelX + g.labelW);
    expect(bc.y).toBe(g.labelY);
  });

  it('survives a degenerate master without producing NaN', () => {
    for (const [w, h] of [[0, 0], [-5, 100], [Number.NaN, 100]]) {
      const g = computeStickerGeometry(CONTAIN, NONE, 1, w, h);
      for (const value of [g.image.dx, g.image.dy, g.image.dw, g.image.dh, g.labelY]) {
        expect(Number.isFinite(value)).toBe(true);
      }
      expect(g.labelY).toBeGreaterThanOrEqual(0);
    }
  });
});
