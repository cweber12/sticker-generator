import type { LabelTemplate } from '@/config/template';
import type { Marks } from './slots';
import {
  computeStickerGeometry,
  nameBaselineY,
  subtitleBaselineY,
  templateFontPx,
} from './slots';
import { resolveBackground } from './background';
import { renderBarcode } from './barcode';
import { NAME_STACK, SUBTITLE_STACK, ensureFontsLoaded } from './fonts';

/**
 * Composites one sticker.
 *
 * ONE code path serves both the grid preview and the print export: `scale`
 * shrinks the output canvas while all drawing happens in full-resolution
 * coordinates. A preview is therefore a true miniature of the PDF, and there
 * is no second geometry implementation to drift out of sync (which is exactly
 * where v1's dual raster/vector export paths went wrong).
 *
 * It also serves both fits without knowing which one it is on. `slots.ts`
 * hands back a source rect and a destination rect; cover yields a cropped
 * source onto the whole canvas, contain a whole source onto an inset one. The
 * only `if` about fit in the entire render path is inside that pure function.
 */

/** Below this the fit-shrink gives up. */
const FONT_FLOOR_PX = 10;

export interface LogoAsset {
  source: CanvasImageSource;
  width: number;
  height: number;
}

let logoPromise: Promise<LogoAsset | null> | null = null;

/**
 * The diamond logo, loaded once and shared by every render.
 *
 * Resolves to null rather than throwing when the file is missing: a missing
 * logo costs you a logo and a warning, never an export.
 */
export function loadDiamondLogo(): Promise<LogoAsset | null> {
  logoPromise ??= new Promise<LogoAsset | null>((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ source: img, width: img.width, height: img.height });
    img.onerror = () => resolve(null);
    img.src = `${import.meta.env.BASE_URL}diamond-logo.png`;
  });
  return logoPromise;
}

export interface RenderStickerInput {
  image: CanvasImageSource;
  imageW: number;
  imageH: number;
  artName: string;
  subtitle: string;
  upc?: string | null;
  marks: Marks;
  template: LabelTemplate;
  logo?: LogoAsset | null;
  /** 1 = full 300 dpi print render. ~0.22 = grid card. */
  scale?: number;
  onWarning?: (message: string) => void;
}

export async function renderSticker(input: RenderStickerInput): Promise<HTMLCanvasElement> {
  const {
    image, imageW, imageH, artName, subtitle, upc,
    marks, template, logo = null, scale = 1, onWarning,
  } = input;

  const logoAspect = logo && logo.height > 0 ? logo.width / logo.height : 1;
  const geom = computeStickerGeometry(template, marks, logoAspect, imageW, imageH);

  if (geom.overflow) {
    onWarning?.('The enabled marks leave almost no room for the label text.');
  }

  // Fonts must resolve BEFORE any text is measured or drawn, or the canvas
  // silently composites with a fallback face.
  const fonts = await ensureFontsLoaded();
  if (!fonts.ok) {
    onWarning?.(
      'Label fonts are not loaded — this render uses substitute typefaces and will not match the print proof. See public/fonts/README.md.',
    );
  }

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(geom.stickerW * scale));
  canvas.height = Math.max(1, Math.round(geom.stickerH * scale));

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not acquire a 2D canvas context.');

  ctx.save();
  ctx.scale(scale, scale);

  // ── Background ───────────────────────────────────────────────────────────
  // Painted under both fits. Under cover the artwork then hides it entirely,
  // except where a master carries transparency — which is the one case where
  // a white sticker was never what you wanted either.
  ctx.fillStyle = resolveBackground(template.background, image);
  ctx.fillRect(0, 0, geom.stickerW, geom.stickerH);

  // ── Artwork ──────────────────────────────────────────────────────────────
  const { sx, sy, sw, sh, dx, dy, dw, dh } = geom.image;
  if (dw > 0 && dh > 0) {
    ctx.drawImage(image, sx, sy, sw, sh, dx, dy, dw, dh);
  }

  // ── Label strip ──────────────────────────────────────────────────────────
  // White under both fits, deliberately: bwip-js composites the barcode with a
  // transparent background, so this strip IS its quiet zone.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(geom.labelX, geom.labelY, geom.labelW, geom.labelH);

  // ── Marks ────────────────────────────────────────────────────────────────
  for (const slot of geom.slots) {
    if (slot.kind === 'barcode') {
      const bc = renderBarcode(upc);
      if (bc) {
        ctx.drawImage(bc, slot.x, slot.y, slot.w, slot.h);
      } else if (upc) {
        onWarning?.(`"${upc}" is not a valid 12-digit UPC-A — no barcode rendered.`);
      }
    } else if (slot.kind === 'logo') {
      if (logo) {
        ctx.drawImage(logo.source, slot.x, slot.y, slot.w, slot.h);
      } else {
        onWarning?.('The diamond logo could not be loaded — no logo rendered.');
      }
    }
  }

  // ── Text ─────────────────────────────────────────────────────────────────
  const { namePx, namePxTracking, subtitlePx } = templateFontPx(template);

  const nameText = artName.toUpperCase();
  ctx.letterSpacing = `${namePxTracking}px`;
  const fittedName = fitFontSize(ctx, nameText, geom.textAreaW, namePx, NAME_STACK);
  ctx.font = `${fittedName}px ${NAME_STACK}`;
  ctx.fillStyle = '#111111';
  ctx.fillText(nameText, geom.textX, nameBaselineY(geom, fittedName));

  ctx.letterSpacing = '0px';
  const fittedSubtitle = fitFontSize(ctx, subtitle, geom.textAreaW, subtitlePx, SUBTITLE_STACK);
  ctx.font = `${fittedSubtitle}px ${SUBTITLE_STACK}`;
  ctx.fillStyle = '#444444';
  ctx.fillText(subtitle, geom.textX, subtitleBaselineY(geom, fittedSubtitle));

  ctx.restore();
  return canvas;
}

/** Steps the font size down until the text fits, with a hard floor. */
export function fitFontSize(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  startPx: number,
  stack: string,
): number {
  let size = startPx;
  ctx.font = `${size}px ${stack}`;
  while (size > FONT_FLOOR_PX && ctx.measureText(text).width > maxWidth) {
    size -= 1;
    ctx.font = `${size}px ${stack}`;
  }
  return size;
}
