/**
 * Font loading and availability.
 *
 * v1 set `ctx.font = "52px 'Baskerville Display PT'"` with no @font-face
 * anywhere. Canvas does not error on a missing font — it silently substitutes.
 * That meant stickers rendered correctly only on machines that happened to have
 * the fonts installed, which quietly defeats the whole point of choosing a
 * rasterized PDF for font fidelity.
 *
 * Here the faces are self-hosted (see public/fonts/README.md), loading is
 * awaited before any draw, and availability is verified by MEASUREMENT rather
 * than by trusting document.fonts.check — which reports true for system fonts
 * and so cannot distinguish "loaded" from "substituted".
 */

export const NAME_FAMILY = 'Sticker Name';
export const SUBTITLE_FAMILY = 'Sticker Subtitle';

export const NAME_STACK = `"${NAME_FAMILY}", "Baskerville Display PT", Baskerville, "Times New Roman", serif`;
export const SUBTITLE_STACK = `"${SUBTITLE_FAMILY}", "Tw Cen MT", "Century Gothic", "Trebuchet MS", sans-serif`;

export interface FontStatus {
  name: boolean;
  subtitle: boolean;
  /** True when both faces resolved to the intended files. */
  ok: boolean;
}

const PROBE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/**
 * Detects whether `family` actually resolves, by comparing rendered text width
 * against each generic fallback. If the family is missing, the browser falls
 * back and the widths match exactly.
 */
export function isFontAvailable(family: string): boolean {
  const ctx = document.createElement('canvas').getContext('2d');
  if (!ctx) return false;

  const generics = ['monospace', 'serif', 'sans-serif'];
  return generics.some((generic) => {
    ctx.font = `72px ${generic}`;
    const fallbackWidth = ctx.measureText(PROBE).width;
    ctx.font = `72px "${family}", ${generic}`;
    return Math.abs(ctx.measureText(PROBE).width - fallbackWidth) > 0.5;
  });
}

let cached: Promise<FontStatus> | null = null;

/**
 * Awaits both faces and reports what actually resolved. Call once at startup
 * and again is free — the result is cached. Never throws: a missing font is a
 * warning the UI shows, not a reason to block rendering.
 */
export function ensureFontsLoaded(): Promise<FontStatus> {
  cached ??= (async (): Promise<FontStatus> => {
    try {
      await Promise.all([
        document.fonts.load(`72px "${NAME_FAMILY}"`),
        document.fonts.load(`72px "${SUBTITLE_FAMILY}"`),
      ]);
      await document.fonts.ready;
    } catch {
      // FontFaceSet unavailable (jsdom, very old browsers) — fall through to
      // measurement, which is the check that actually matters.
    }

    const name = isFontAvailable(NAME_FAMILY);
    const subtitle = isFontAvailable(SUBTITLE_FAMILY);
    return { name, subtitle, ok: name && subtitle };
  })();

  return cached;
}

/** Test seam. */
export function resetFontCache(): void {
  cached = null;
}
