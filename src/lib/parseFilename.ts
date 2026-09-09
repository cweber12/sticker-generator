import { slugify } from './normalize';

/**
 * Filename → art name.
 *
 * The filename IS the metadata in v2 — there is no spreadsheet to reconcile
 * against — so this runs on every upload and the result is what appears on the
 * sticker until the user edits it.
 *
 * Deliberately conservative: separators are normalized and obvious noise is
 * removed, but the user's capitalisation is preserved. Guessing title case
 * mangles real product names ("Study No. 4 in Bb").
 */

/** Ordering prefixes people put on batches: "01 - ", "003_", "12." */
const ORDER_PREFIX = /^\s*\d{1,4}\s*[-_.)]\s*/;

/**
 * Export-tool suffixes worth dropping. A dot counts as a separator so that
 * "art.final.png" — where only ".png" is stripped as the extension — still
 * loses the ".final".
 */
const NOISE_SUFFIX = /[\s_.-]+(final|v\d+|copy|edit(ed)?|hi[\s_-]?res|print|\d+x\d+)$/i;

export interface ParsedFilename {
  artName: string;
  slug: string;
  /** The original filename, kept for display and duplicate reporting. */
  originalName: string;
}

export function parseFilename(filename: string): ParsedFilename {
  const originalName = filename;

  // Strip only the final extension, so "Study No. 4.png" keeps its full name.
  const lastDot = filename.lastIndexOf('.');
  let base = lastDot > 0 ? filename.slice(0, lastDot) : filename;

  base = base.replace(ORDER_PREFIX, '');
  base = base.replace(/[_]+/g, ' ');
  // Hyphens are left exactly as found: normalising the spacing around them
  // would turn "hi-res" into "hi - res" and mangle real hyphenated names.
  base = base.replace(/\s+/g, ' ').trim();

  let previous: string;
  do {
    previous = base;
    base = base.replace(NOISE_SUFFIX, '').trim();
  } while (base !== previous);

  base = base.replace(/\s*-\s*$/, '').trim();

  const artName = base;
  return { artName, slug: slugify(artName), originalName };
}
