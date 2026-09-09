import { describe, it, expect } from 'vitest';
import {
  computeLabelGeometry,
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

describe('computeLabelGeometry — label box', () => {
  it('places the strip inset from the bottom and both sides', () => {
    const g = computeLabelGeometry(T, NONE);
    expect(g.stickerW).toBe(inToPx(STICKER_W_IN));
    expect(g.stickerH).toBe(inToPx(STICKER_H_IN));
    expect(g.labelX).toBe(inToPx(T.labelInsetIn));
    expect(g.labelW).toBe(g.stickerW - inToPx(T.labelInsetIn) * 2);
    expect(g.labelY + g.labelH).toBe(g.stickerH - inToPx(T.labelInsetIn));
  });

  it('is identical regardless of which marks are enabled', () => {
    const boxes = [NONE, BARCODE, LOGO, BOTH].map((m) => {
      const g = computeLabelGeometry(T, m);
      return [g.labelX, g.labelY, g.labelW, g.labelH].join();
    });
    expect(new Set(boxes).size).toBe(1);
  });
});

describe('computeLabelGeometry — the four mark combinations', () => {
  it('no marks: full padded width, no slots', () => {
    const g = computeLabelGeometry(T, NONE);
    expect(g.slots).toHaveLength(0);
    expect(g.textAreaW).toBe(g.labelW - g.padPx * 2);
    expect(g.overflow).toBe(false);
  });

  it('barcode only: flush right, full label height', () => {
    const g = computeLabelGeometry(T, BARCODE);
    expect(g.slots).toHaveLength(1);
    const [bc] = g.slots;
    expect(bc.kind).toBe('barcode');
    expect(bc.x + bc.w).toBe(g.labelX + g.labelW); // flush to the right edge
    expect(bc.y).toBe(g.labelY);
    expect(bc.h).toBe(g.labelH);
    expect(bc.w).toBe(inToPx(T.barcodeWidthIn));
  });

  it('logo only: right margin of one padding, vertically centred', () => {
    const g = computeLabelGeometry(T, LOGO, 2);
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
    const g = computeLabelGeometry(T, BOTH, 1);
    expect(g.slots).toHaveLength(2);
    const bc = g.slots.find((s) => s.kind === 'barcode')!;
    const logo = g.slots.find((s) => s.kind === 'logo')!;
    expect(logo.x + logo.w).toBe(bc.x - g.padPx);
    expect(bc.x + bc.w).toBe(g.labelX + g.labelW);
  });

  it('never overlaps the text column with a mark', () => {
    for (const marks of [NONE, BARCODE, LOGO, BOTH]) {
      const g = computeLabelGeometry(T, marks, 1.6);
      const textRight = g.textX + g.textAreaW;
      for (const slot of g.slots) {
        expect(slot.x).toBeGreaterThanOrEqual(textRight);
      }
    }
  });

  it('shrinks the text area as marks are added, never the reverse', () => {
    const widths = [NONE, LOGO, BARCODE, BOTH].map(
      (m) => computeLabelGeometry(T, m, 1).textAreaW,
    );
    expect(widths[0]).toBeGreaterThan(widths[1]);
    expect(widths[1]).toBeGreaterThan(widths[3]);
    expect(widths[2]).toBeGreaterThan(widths[3]);
  });
});

describe('computeLabelGeometry — degenerate inputs', () => {
  it('clamps the text area at zero instead of going negative', () => {
    const cramped = { ...T, barcodeWidthIn: 3.5, logoHeightIn: 0.5 };
    const g = computeLabelGeometry(cramped, BOTH, 4);
    expect(g.textAreaW).toBe(0);
    expect(g.textAreaW).not.toBeLessThan(0);
  });

  it('flags overflow when marks crowd out the text', () => {
    const cramped = { ...T, barcodeWidthIn: 3.2 };
    expect(computeLabelGeometry(cramped, BARCODE).overflow).toBe(true);
    expect(computeLabelGeometry(T, BARCODE).overflow).toBe(false);
  });

  it('flags overflow exactly at the MIN_TEXT_AREA_IN boundary', () => {
    const g = computeLabelGeometry(T, NONE);
    expect(g.textAreaW).toBeGreaterThanOrEqual(inToPx(MIN_TEXT_AREA_IN));
  });

  it('survives a zero or negative logo aspect without producing NaN', () => {
    for (const aspect of [0, -3, Number.NaN]) {
      const g = computeLabelGeometry(T, LOGO, aspect);
      const logo = g.slots[0];
      expect(Number.isFinite(logo.w)).toBe(true);
      expect(logo.w).toBeGreaterThan(0);
      expect(Number.isFinite(g.textAreaW)).toBe(true);
    }
  });

  it('handles zero padding', () => {
    const g = computeLabelGeometry({ ...T, labelPaddingIn: 0 }, BOTH, 1);
    expect(g.padPx).toBe(0);
    expect(g.textAreaW).toBeGreaterThan(0);
  });
});

describe('baselines', () => {
  it('keeps the art name inside the strip', () => {
    const g = computeLabelGeometry(T, BARCODE);
    const y = nameBaselineY(g, 52);
    expect(y).toBeGreaterThan(g.labelY);
    expect(y).toBeLessThan(g.labelY + g.labelH);
  });

  it('keeps the subtitle inside the strip and below the name', () => {
    const g = computeLabelGeometry(T, BARCODE);
    expect(subtitleBaselineY(g, 38)).toBeGreaterThan(nameBaselineY(g, 52));
    expect(subtitleBaselineY(g, 38)).toBeLessThan(g.labelY + g.labelH);
  });
});
