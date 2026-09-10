import type { LabelTemplate } from '@/config/template';
import { STICKER_W_IN, STICKER_H_IN } from '@/config/template';
import { inToPx, ptToPx } from './units';

/**
 * Sticker slot math.
 *
 * This is the one genuinely fiddly piece of the renderer, so it lives alone,
 * stays pure, and is tested exhaustively. Everything about where things sit —
 * the artwork AND the label — is decided here; the renderer only draws.
 *
 * The artwork lives here rather than in the renderer because under `contain`
 * the two are COUPLED: the gap depends on how tall the fitted image came out,
 * and the label's Y depends on the gap. Two functions could not agree on that
 * without one of them recomputing the other's answer.
 *
 * Both fits return the same shape — a source rect and a destination rect — so
 * the renderer makes one drawImage call and has no idea which fit it is on:
 *
 *   cover                          contain
 *   +------------------+           +------------------+
 *   |##################|           |       gap        |
 *   |### art, cropped #|           |  +------------+  |
 *   |##################|           |  | art, whole |  |
 *   |##+------------+##|           |  +------------+  |
 *   |##| NAME   ### |##|           |       gap        |
 *   |##+------------+##|           | +--------------+ |
 *   +------------------+           | | NAME     ### | |
 *    label floats on top           | +--------------+ |
 *                                  |       gap        |
 *                                  +------------------+
 *                                   background elsewhere
 *
 * Marks are INDEPENDENT — barcode and logo are each on or off, on any product
 * type. That gives four valid states, and no type-dependent branching anywhere
 * in the render path.
 *
 * Slots fill from the right edge of the label inward:
 *
 *   +--------------------------------------------------+
 *   |  ART NAME                    [logo]  [ barcode ] |
 *   |  16 × 20 Diamond Art                             |
 *   +--------------------------------------------------+
 *      <- text area (computed)  ->  <-  marks (measured) ->
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

/** A drawImage call, split into its source and destination rects. */
export interface ImagePlacement {
  /** Source rect in the master's own pixels. Cropped under `cover`. */
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  /** Destination rect on the sticker canvas. The full canvas under `cover`. */
  dx: number;
  dy: number;
  dw: number;
  dh: number;
}

export interface StickerGeometry {
  /** Full sticker canvas, in px at 300 dpi. */
  stickerW: number;
  stickerH: number;
  /** Where the master goes, and which part of it. */
  image: ImagePlacement;
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

const NO_IMAGE: ImagePlacement = { sx: 0, sy: 0, sw: 0, sh: 0, dx: 0, dy: 0, dw: 0, dh: 0 };

/**
 * Computes the artwork placement, the label box and the mark placement.
 *
 * @param logoAspect natural width / height of the logo image. Only consulted
 *   when the logo mark is on. Passed in rather than read from an image so this
 *   stays pure and testable.
 * @param imageW natural width of the master. Only affects the artwork rect —
 *   the label box under `cover` does not depend on it, which is why it
 *   defaults and every mark test can ignore it.
 * @param imageH natural height of the master.
 */
export function computeStickerGeometry(
  template: LabelTemplate,
  marks: Marks,
  logoAspect = 1,
  imageW = 0,
  imageH = 0,
): StickerGeometry {
  const stickerW = inToPx(STICKER_W_IN);
  const stickerH = inToPx(STICKER_H_IN);

  const padPx = inToPx(template.labelPaddingIn);
  const labelH = inToPx(template.labelHeightIn);

  const frame =
    template.fit === 'contain'
      ? containFrame(template, stickerW, stickerH, labelH, imageW, imageH)
      : coverFrame(template, stickerW, stickerH, labelH, imageW, imageH);

  const { labelX, labelY, labelW, image } = frame;

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
    image,
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

interface Frame {
  labelX: number;
  labelY: number;
  labelW: number;
  image: ImagePlacement;
}

/** Artwork bleeds off all four edges; the label floats on top of it. */
function coverFrame(
  template: LabelTemplate,
  stickerW: number,
  stickerH: number,
  labelH: number,
  imageW: number,
  imageH: number,
): Frame {
  const inset = inToPx(template.labelInsetIn);
  return {
    labelX: inset,
    labelY: stickerH - inset - labelH,
    labelW: stickerW - inset * 2,
    image: coverPlacement(imageW, imageH, stickerW, stickerH),
  };
}

/**
 * The whole master shows, above the label, on a background.
 *
 * The three vertical gaps — above the image, between image and label, and
 * below the label — are EQUAL, and derived rather than configured:
 * `framePaddingIn` is the side margin and the floor for the gap, never the gap
 * itself. Requiring the sides to equal the gaps as well is not merely
 * unattractive but unsolvable at these proportions; ADR-0005 has the algebra.
 */
function containFrame(
  template: LabelTemplate,
  stickerW: number,
  stickerH: number,
  labelH: number,
  imageW: number,
  imageH: number,
): Frame {
  const fp = inToPx(template.framePaddingIn);
  const labelW = stickerW - fp * 2;

  // The image box: never wider than the label, and tall enough only for what
  // is left once the label and three gaps of the minimum size are taken out.
  const fitted = fitInside(imageW, imageH, labelW, stickerH - fp * 3 - labelH);

  // Whatever the image did not use, split three ways. Flooring keeps the top
  // and bottom gaps exact and lets the middle absorb a remainder of at most
  // 2px — 0.007in, which no press can hold anyway.
  const gap = Math.floor((stickerH - labelH - fitted.h) / 3);

  return {
    labelX: fp,
    labelY: stickerH - gap - labelH,
    labelW,
    image: {
      sx: 0,
      sy: 0,
      sw: Math.max(0, imageW),
      sh: Math.max(0, imageH),
      // Centred horizontally. A master taller than the box comes out narrower
      // than the label, which is accepted rather than corrected.
      dx: Math.round((stickerW - fitted.w) / 2),
      dy: gap,
      dw: fitted.w,
      dh: fitted.h,
    },
  };
}

/** Centre cover-crop: the largest centred source rect of the target's aspect. */
export function coverPlacement(
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
): ImagePlacement {
  if (!(srcW > 0) || !(srcH > 0) || !(dstW > 0) || !(dstH > 0)) return NO_IMAGE;

  const srcRatio = srcW / srcH;
  const dstRatio = dstW / dstH;

  let sx = 0;
  let sy = 0;
  let sw = srcW;
  let sh = srcH;

  if (srcRatio > dstRatio) {
    sw = srcH * dstRatio;
    sx = (srcW - sw) / 2;
  } else {
    sh = srcW / dstRatio;
    sy = (srcH - sh) / 2;
  }

  return { sx, sy, sw, sh, dx: 0, dy: 0, dw: dstW, dh: dstH };
}

/** The largest size fitting inside the box, preserving aspect. */
function fitInside(
  srcW: number,
  srcH: number,
  maxW: number,
  maxH: number,
): { w: number; h: number } {
  if (!(srcW > 0) || !(srcH > 0) || !(maxW > 0) || !(maxH > 0)) return { w: 0, h: 0 };
  const scale = Math.min(maxW / srcW, maxH / srcH);
  return { w: Math.round(srcW * scale), h: Math.round(srcH * scale) };
}

/**
 * Baseline for the art name. Uppercase, so no ascenders above cap height:
 * padding from the label top plus ~72% of the font size.
 */
export function nameBaselineY(geom: StickerGeometry, fontPx: number): number {
  return geom.labelY + geom.padPx + Math.round(fontPx * 0.72);
}

/**
 * Baseline for the subtitle. Mixed case, so leave room for descenders:
 * padding from the label bottom minus ~20% of the font size.
 */
export function subtitleBaselineY(geom: StickerGeometry, fontPx: number): number {
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
