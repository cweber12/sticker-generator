import { jsPDF } from 'jspdf';
import { STICKER_W_IN, STICKER_H_IN } from '@/config/template';

/**
 * Wraps a rendered sticker canvas in a 4×6in PDF page.
 *
 * Rasterized only. v1 also carried a "selectable text" mode that re-implemented
 * all the label geometry in jsPDF coordinates and needed .ttf files that were
 * never present — two sources of truth for the same layout, and the one place
 * the two could disagree silently. It is deliberately not ported.
 *
 * PNG rather than JPEG: chroma subsampling blurs the hard black/white
 * transitions in a barcode and hurts scan reliability.
 */
export function canvasToStickerPdf(
  canvas: HTMLCanvasElement,
  meta: { artName: string; subtitle: string; upc?: string | null } ,
): ArrayBuffer {
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'in',
    format: [STICKER_W_IN, STICKER_H_IN],
    compress: true,
  });

  pdf.addImage(
    canvas.toDataURL('image/png'),
    'PNG',
    0, 0,
    STICKER_W_IN, STICKER_H_IN,
    undefined,
    'FAST',
  );

  pdf.setProperties({
    title: `${meta.artName} — ${meta.subtitle}`,
    subject: meta.upc || 'Sticker',
    creator: 'Sticker Generator',
  });

  return pdf.output('arraybuffer');
}
