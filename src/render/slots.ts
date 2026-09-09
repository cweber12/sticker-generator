import type { LabelTemplate } from '@/config/template';
import { STICKER_W_IN, STICKER_H_IN } from '@/config/template';
import { inToPx, ptToPx } from './units';

/**
 * Label slot math.
 *
 * This is the one genuinely fiddly piece of the renderer, so it lives alone,
 * stays pure, and is tested exhaustively. Everything about where things sit
 * inside the white strip is decided here; the renderer only draws.
 *
 * Marks are INDEPENDENT — barcode and logo are each on or off, on any product
 * type. That gives four valid states, and no type-dependent branching anywhere
 * in the render path.
 *
 * Slots fill from the right edge of the label inward:
 *
 *   ┌──────────────────────────────────────────────────┐
 *   │  ART NAME                    [logo]  [ barcode ] │
 *   │  16 × 20 Diamond Art                             │
 *   └──────────────────────────────────────────────────┘
 *      ← text area (computed)  →  ←  marks (measured) →
 */

export interface Marks {
  barcode: boolean;
  logo: boolean;
}

export type MarkKind = 'barcode' | 'logo';

export interface Slot {
  kind: MarkKind;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LabelGeometry {
  /** Full sticker canvas, in px at 300 dpi. */
  stickerW: number;
  stickerH: number;
  /** The white strip. */
  labelX: number;
  labelY: number;
  labelW: number;
  labelH: number;
  /** Inner padding, px. */
  padPx: number;
  /** Left edge of the text column. */
  textX: number;
  /** Width available for art name and subtitle after marks are placed. */
  textAreaW: number;
  /** Placed marks, right to left. Empty when both marks are off. */
  slots: Slot[];
  /**
   * True when the enabled marks leave less than MIN_TEXT_AREA_IN for text.
   * The renderer still renders (clamped, never negative) — this is a signal
   * for the UI to warn, not a reason to throw.
   */
  overflow: boolean;
}

/** Below this the label is unusable; surfaces as `overflow`. */
export const MIN_TEXT_AREA_IN = 0.5;

/**
 * Computes the label box and mark placement.
 *
 * @param logoAspect natural width / height of the logo image. Only consulted
 *   when the logo mark is on. Passed in rather than read from an image so this
 *   stays pure and testable.
 */
export function computeLabelGeometry(
  template: LabelTemplate,
  marks: Marks,
  logoAspect = 1,
): LabelGeometry {
  const stickerW = inToPx(STICKER_W_IN);
  const stickerH = inToPx(STICKER_H_IN);

  const inset = inToPx(template.labelInsetIn);
  const padPx = inToPx(template.labelPaddingIn);
  const labelH = inToPx(template.labelHeightIn);

  const labelX = inset;
  const labelY = stickerH - inset - labelH;
  const labelW = stickerW - inset * 2;

  const slots: Slot[] = [];

  // Cursor walks leftward from the label's right edge.
  let cursor = labelX + labelW;

  if (marks.barcode) {
    // Barcode is flush to the label's right/top/bottom edges (v1 behaviour) —
    // quiet zones are baked into the bwip-js output, so extra padding here
    // only shrinks the scannable area.
    const w = inToPx(template.barcodeWidthIn);
    slots.push({ kind: 'barcode', x: cursor - w, y: labelY, w, h: labelH });
    cursor = cursor - w - padPx;
  }

  if (marks.logo) {
    const h = inToPx(template.logoHeightIn);
    const w = Math.max(1, Math.round(h * (logoAspect > 0 ? logoAspect : 1)));
    // When the logo is the rightmost element it needs its own right margin.
    // When it sits left of the barcode, the barcode step already consumed one.
    const rightMargin = marks.barcode ? 0 : padPx;
    const x = cursor - rightMargin - w;
    slots.push({ kind: 'logo', x, y: labelY + Math.round((labelH - h) / 2), w, h });
    cursor = x - padPx;
  }

  const textX = labelX + padPx;
  const rawTextAreaW = cursor - padPx - textX;
  // With no marks the cursor is still at the right edge, so one padding is
  // subtracted above and one by textX — the strip is padded symmetrically.
  const textAreaW = Math.max(0, rawTextAreaW);

  return {
    stickerW,
    stickerH,
    labelX,
    labelY,
    labelW,
    labelH,
    padPx,
    textX,
    textAreaW,
    slots,
    overflow: rawTextAreaW < inToPx(MIN_TEXT_AREA_IN),
  };
}

/**
 * Baseline for the art name. Uppercase, so no ascenders above cap height:
 * padding from the label top plus ~72% of the font size.
 */
export function nameBaselineY(geom: LabelGeometry, fontPx: number): number {
  return geom.labelY + geom.padPx + Math.round(fontPx * 0.72);
}

/**
 * Baseline for the subtitle. Mixed case, so leave room for descenders:
 * padding from the label bottom minus ~20% of the font size.
 */
export function subtitleBaselineY(geom: LabelGeometry, fontPx: number): number {
  return geom.labelY + geom.labelH - geom.padPx - Math.round(fontPx * 0.2);
}

/** Convenience: the two font sizes in canvas px, before fit-shrinking. */
export function templateFontPx(template: LabelTemplate) {
  return {
    namePx: ptToPx(template.nameFontPt),
    namePxTracking: ptToPx(template.nameTrackingPt),
    subtitlePx: ptToPx(template.subtitleFontPt),
  };
}
