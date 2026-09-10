import { AUTO_BACKGROUND, type Background } from '@/config/template';

/**
 * The colour behind a contained master.
 *
 * The background is a mat around the artwork, so what reads as cohesive is
 * continuity with the artwork's own edge — not its average, and not its most
 * popular colour. A tarot card is mostly sky and gold; its mat is the tan
 * border it already has. So: sample the border, take the median.
 *
 * Median rather than mean, because a signature in a corner or a dark artefact
 * along one edge must not drag the whole mat off-colour. See
 * docs/adr/0005-contained-artwork-and-the-frame.md.
 */

/** The master is downscaled to this before its outer ring is read. */
const SAMPLE = 64;

/** Used when there is nothing to sample — a fully transparent edge, no context. */
const FALLBACK = '#ffffff';

/** Below this alpha an edge pixel is not really there and is not sampled. */
const MIN_ALPHA = 128;

/** What the colour input produces and what the canvas will actually honour. */
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export function isHexColor(value: string): boolean {
  return HEX_RE.test(value);
}

/**
 * The median colour of the outermost ring of an RGBA buffer.
 *
 * Pure, and takes raw pixels rather than an image, so the rule this feature
 * turns on is testable without a canvas.
 */
export function pickBackgroundColor(
  data: Uint8ClampedArray,
  w: number,
  h: number,
): string {
  if (w <= 0 || h <= 0) return FALLBACK;
  // A buffer shorter than w x h x 4 is not the image it claims to be. Reading
  // past the end yields undefined, and undefined compares false against every
  // threshold — so it would sail past the alpha guard and come out as a colour.
  if (data.length < w * h * 4) return FALLBACK;

  const rs: number[] = [];
  const gs: number[] = [];
  const bs: number[] = [];

  const sample = (x: number, y: number): void => {
    const i = (y * w + x) * 4;
    if (data[i + 3] < MIN_ALPHA) return;
    rs.push(data[i]);
    gs.push(data[i + 1]);
    bs.push(data[i + 2]);
  };

  // The ring only, so this stays O(w + h) rather than O(w × h). A one-pixel
  // wide or tall buffer samples some positions twice, which a median does not
  // care about.
  for (let x = 0; x < w; x++) {
    sample(x, 0);
    sample(x, h - 1);
  }
  for (let y = 1; y < h - 1; y++) {
    sample(0, y);
    sample(w - 1, y);
  }

  if (rs.length === 0) return FALLBACK;
  return toHex(median(rs), median(gs), median(bs));
}

/**
 * Sampled masters, keyed by the decoded image itself.
 *
 * A WeakMap rather than a filename cache because `loadMasterImage` already
 * caches one ImageBitmap per master — that bitmap IS the stable key, so this
 * needs no invalidation and no plumbing to reach it.
 */
const sampled = new WeakMap<CanvasImageSource, string>();

/** The auto colour for one master. Sampled once, then remembered. */
export function autoBackgroundFor(image: CanvasImageSource): string {
  const cached = sampled.get(image);
  if (cached !== undefined) return cached;

  const colour = sampleEdge(image);
  sampled.set(image, colour);
  return colour;
}

/** The colour to actually paint: a stored hex, or the sampled one. */
export function resolveBackground(background: Background, image: CanvasImageSource): string {
  if (background !== AUTO_BACKGROUND && isHexColor(background)) return background;
  return autoBackgroundFor(image);
}

function sampleEdge(image: CanvasImageSource): string {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = SAMPLE;
    canvas.height = SAMPLE;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return FALLBACK;

    // Squashing the aspect is fine — the ring still maps to the master's edge,
    // and the downscale averages away single-pixel noise before the median runs.
    ctx.drawImage(image, 0, 0, SAMPLE, SAMPLE);
    const { data } = ctx.getImageData(0, 0, SAMPLE, SAMPLE);
    return pickBackgroundColor(data, SAMPLE, SAMPLE);
  } catch {
    // A colour is never worth an export. Fall back and carry on.
    return FALLBACK;
  }
}

/** Lower-middle for an even count, so the result is a colour that was there. */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) / 2)];
}

function toHex(r: number, g: number, b: number): string {
  const pair = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${pair(r)}${pair(g)}${pair(b)}`;
}
