import { toCanvas } from 'bwip-js/browser';

/** UPC-A is exactly 12 digits. Anything else renders no barcode. */
export const UPC_A_RE = /^\d{12}$/;

export function isValidUpc(upc: string | null | undefined): boolean {
  return !!upc && UPC_A_RE.test(upc);
}

/**
 * Renders a UPC-A barcode to an offscreen canvas.
 * Returns null for an invalid or absent UPC — never throws. A sticker with no
 * UPC simply has no barcode; it must not block an export.
 */
export function renderBarcode(upc: string | null | undefined): HTMLCanvasElement | null {
  if (!isValidUpc(upc)) return null;
  try {
    const canvas = document.createElement('canvas');
    toCanvas(canvas, {
      bcid: 'upca',
      text: upc as string,
      scale: 4,
      height: 18,
      includetext: true,
      textxalign: 'center',
    });
    return canvas;
  } catch {
    return null;
  }
}
