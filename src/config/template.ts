/**
 * Sticker geometry, stored in real-world units.
 *
 * v1 stored layout in canvas pixels and documented a magic
 * "1 design unit = 3.82 px" conversion. v2 stores inches for geometry and
 * points for type, and derives pixels at render time. Nothing downstream
 * needs to know the DPI except the two helpers in render/units.ts.
 */

export const DPI = 300;
export const STICKER_W_IN = 4;
export const STICKER_H_IN = 6;

export interface LabelTemplate {
  /** Gap between the floating white label and all four sticker edges. */
  labelInsetIn: number;
  /** Height of the floating white info strip. */
  labelHeightIn: number;
  /** Inner padding inside the label strip. */
  labelPaddingIn: number;
  /** Width reserved for the UPC-A barcode when the barcode mark is on. */
  barcodeWidthIn: number;
  /** Height of the diamond logo when the logo mark is on. Width follows aspect. */
  logoHeightIn: number;
  /** Starting size for the art name; shrinks to fit. */
  nameFontPt: number;
  /** Letter-spacing applied to the art name. */
  nameTrackingPt: number;
  /** Starting size for the subtitle line; shrinks to fit. */
  subtitleFontPt: number;
}

/**
 * Ported from v1's DEFAULT_LAYOUT (canvas px @ 300dpi) converted to real units:
 *   labelInset 46px → 0.153in    labelHeight 171px → 0.570in
 *   labelPadding 38px → 0.127in  barcodeZoneWidth 382px → 1.273in
 *   nameFontSize 52px → 12.5pt   sizeFontSize 38px → 9.1pt
 *   letterSpacing 12px → 2.88pt  logo height (171 − 2×38)px → 0.317in
 *
 * v1's `textAreaWidth` is deliberately absent: it was always derivable from the
 * label width minus padding minus the enabled marks, and storing it separately
 * is what let the text area and the mark zone disagree.
 */
export const DEFAULT_TEMPLATE: LabelTemplate = {
  labelInsetIn: 0.153,
  labelHeightIn: 0.57,
  labelPaddingIn: 0.127,
  barcodeWidthIn: 1.273,
  logoHeightIn: 0.317,
  nameFontPt: 12.5,
  nameTrackingPt: 2.9,
  subtitleFontPt: 9.1,
};

export interface TemplateField {
  key: keyof LabelTemplate;
  label: string;
  unit: 'in' | 'pt';
  min: number;
  max: number;
  step: number;
}

/** Drives the editor panel. Real units with sane clamps — never raw pixels. */
export const TEMPLATE_FIELDS: readonly TemplateField[] = [
  { key: 'labelInsetIn', label: 'Label inset', unit: 'in', min: 0, max: 0.75, step: 0.005 },
  { key: 'labelHeightIn', label: 'Label height', unit: 'in', min: 0.25, max: 2, step: 0.01 },
  { key: 'labelPaddingIn', label: 'Inner padding', unit: 'in', min: 0, max: 0.5, step: 0.005 },
  { key: 'barcodeWidthIn', label: 'Barcode width', unit: 'in', min: 0.5, max: 2.5, step: 0.01 },
  { key: 'logoHeightIn', label: 'Logo height', unit: 'in', min: 0.1, max: 1.5, step: 0.005 },
  { key: 'nameFontPt', label: 'Art name size', unit: 'pt', min: 4, max: 36, step: 0.5 },
  { key: 'nameTrackingPt', label: 'Art name tracking', unit: 'pt', min: 0, max: 8, step: 0.1 },
  { key: 'subtitleFontPt', label: 'Subtitle size', unit: 'pt', min: 4, max: 24, step: 0.5 },
] as const;
