import { DPI } from '@/config/template';

/** Inches → canvas pixels at 300 dpi. */
export const inToPx = (inches: number): number => Math.round(inches * DPI);

/** Typographic points → canvas pixels at 300 dpi. */
export const ptToPx = (pt: number): number => Math.round((pt * DPI) / 72);

/** Canvas pixels → inches (for PDF placement). */
export const pxToIn = (px: number): number => px / DPI;

/** Canvas pixels → points. */
export const pxToPt = (px: number): number => (px * 72) / DPI;
