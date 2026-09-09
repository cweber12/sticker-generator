import type { LabelTemplate } from '@/config/template';
import { DEFAULT_TEMPLATE } from '@/config/template';
import type { LabelOverride, Library, Sticker } from '@/types';
import type { Marks } from '@/render/slots';
import { parseFilename } from '@/lib/parseFilename';

/**
 * The library folder.
 *
 * ADR-0003: the folder IS the list of stickers. Masters sit directly in it,
 * beside `stickers.json`, and every image found there is a sticker. There is
 * no import step and no separate index of what exists — put a file in the
 * folder, from either machine, and it is in the library.
 *
 * `stickers.json` is therefore not a registry. It is a metadata overlay: art
 * names, marks and overrides, keyed by filename. A record whose file is not
 * present is simply not shown; it is never deleted, because a sync client can
 * make a file briefly absent and throwing away someone's overrides over a
 * transient miss would be unrecoverable.
 *
 * Reads preserve fields they do not recognise, so a newer version of the app
 * writing keys this one has never heard of survives a save from here.
 */

export const LIBRARY_FILE = 'stickers.json';

/** What counts as artwork sitting in the folder. */
const IMAGE_RE = /\.(png|jpe?g|webp|gif|bmp|avif)$/i;

export function emptyLibrary(): Library {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    template: { ...DEFAULT_TEMPLATE },
    stickers: [],
  };
}

/**
 * Reads `stickers.json`, creating it if it is not there yet. Throws only when
 * the file exists but cannot be understood: overwriting an unreadable overlay
 * would destroy the other machine's work.
 */
export async function readLibrary(dir: FileSystemDirectoryHandle): Promise<Library> {
  const handle = await fileHandle(dir, LIBRARY_FILE);
  if (!handle) return writeLibrary(dir, emptyLibrary());

  const text = await (await handle.getFile()).text();
  if (!text.trim()) return writeLibrary(dir, emptyLibrary());

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error(
      `${LIBRARY_FILE} is not valid JSON. Fix it, or restore it from your sync client's version history. The app will not overwrite it.`,
    );
  }
  return normalizeLibrary(raw);
}

/** Writes the overlay and returns exactly what landed on disk. */
export async function writeLibrary(
  dir: FileSystemDirectoryHandle,
  library: Library,
): Promise<Library> {
  const next: Library = { ...library, updatedAt: new Date().toISOString() };
  const handle = await dir.getFileHandle(LIBRARY_FILE, { create: true });
  const writable = await handle.createWritable();
  await writable.write(JSON.stringify(next, null, 2));
  await writable.close();
  return next;
}

/**
 * Every image sitting in the library folder, in display order.
 *
 * Not recursive: subfolders are yours to organise however you like, and only
 * the top level is the library. Sorted naturally so "Art 2" precedes "Art 10".
 */
export async function listMasters(dir: FileSystemDirectoryHandle): Promise<string[]> {
  const names: string[] = [];
  for await (const [name, handle] of dir.entries()) {
    if (handle.kind === 'file' && IMAGE_RE.test(name)) names.push(name);
  }
  return names.sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }),
  );
}

export interface SyncResult {
  library: Library;
  /** Filenames present in the folder, in display order. This is the library. */
  files: string[];
  /** Files that had no record and just got one. */
  adopted: string[];
}

/**
 * Reconciles the overlay against what is actually in the folder.
 *
 * Adds a record for every image that does not have one. Never removes: see the
 * note at the top of this file. Writes only when something was adopted, so
 * merely opening the app on both machines does not produce duelling saves.
 */
export async function syncLibrary(
  dir: FileSystemDirectoryHandle,
  library: Library,
  defaultMarks: Marks,
): Promise<SyncResult> {
  const files = await listMasters(dir);
  const known = new Set(library.stickers.map((sticker) => sticker.masterFile));
  const adopted = files.filter((file) => !known.has(file));

  if (adopted.length === 0) return { library, files, adopted };

  const next = await writeLibrary(dir, {
    ...library,
    stickers: [...library.stickers, ...adopted.map((file) => stickerFor(file, defaultMarks))],
  });

  return { library: next, files, adopted };
}

/**
 * The record for one image.
 *
 * The filename is the id. It is already unique — one folder cannot hold two
 * files of the same name — and it means both machines independently adopting
 * the same file agree on what to call it, so `stickers.json` stays readable
 * and diffable in the sync client's version history.
 */
export function stickerFor(masterFile: string, defaultMarks: Marks): Sticker {
  const { artName, slug } = parseFilename(masterFile);
  const now = new Date().toISOString();
  return {
    id: masterFile,
    artName,
    slug,
    masterFile,
    createdAt: now,
    updatedAt: now,
    defaultMarks: { ...defaultMarks },
    overrides: {},
    variantOverrides: {},
  };
}

export interface CopyFailure {
  filename: string;
  message: string;
}

export interface CopyResult {
  copied: string[];
  /** Already in the folder under that name; left alone. */
  skipped: string[];
  failures: CopyFailure[];
}

/**
 * Copies files chosen from elsewhere into the library folder.
 *
 * A convenience, not a gate: dropping the files in with Explorer does exactly
 * the same thing. A name that is already taken is skipped rather than
 * overwritten or silently renamed — the folder is yours now, and quietly
 * turning your "Coffee.png" into "Coffee-2.png" would be presumptuous.
 */
export async function copyIntoLibrary(
  dir: FileSystemDirectoryHandle,
  files: readonly File[],
): Promise<CopyResult> {
  const copied: string[] = [];
  const skipped: string[] = [];
  const failures: CopyFailure[] = [];

  for (const file of files) {
    try {
      if (await fileHandle(dir, file.name)) {
        skipped.push(file.name);
        continue;
      }
      const handle = await dir.getFileHandle(file.name, { create: true });
      const writable = await handle.createWritable();
      await writable.write(file);
      await writable.close();
      copied.push(file.name);
    } catch (error) {
      failures.push({
        filename: file.name,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { copied, skipped, failures };
}

/** Reads one master out of the library folder. */
export async function readMaster(
  dir: FileSystemDirectoryHandle,
  masterFile: string,
): Promise<File> {
  const handle = await dir.getFileHandle(masterFile);
  return handle.getFile();
}

export interface MasterImage {
  source: CanvasImageSource;
  width: number;
  height: number;
}

/**
 * Decoded masters, keyed by filename.
 *
 * Every card re-renders when a filter changes, so without this a single click
 * would re-read and re-decode every image on disk.
 */
const decoded = new Map<string, Promise<MasterImage>>();

export function loadMasterImage(
  dir: FileSystemDirectoryHandle,
  masterFile: string,
): Promise<MasterImage> {
  const cached = decoded.get(masterFile);
  if (cached) return cached;

  const pending = (async (): Promise<MasterImage> => {
    const bitmap = await createImageBitmap(await readMaster(dir, masterFile));
    return { source: bitmap, width: bitmap.width, height: bitmap.height };
  })();

  // A failure must not be remembered, or a master that was merely mid-sync
  // stays broken until a reload.
  pending.catch(() => decoded.delete(masterFile));

  decoded.set(masterFile, pending);
  return pending;
}

/** Called when the folder changes, so a new library cannot see old bytes. */
export function clearMasterCache(): void {
  decoded.clear();
}

/** The handle, or null when the file is simply not there. Other errors throw. */
async function fileHandle(
  dir: FileSystemDirectoryHandle,
  name: string,
): Promise<FileSystemFileHandle | null> {
  try {
    return await dir.getFileHandle(name);
  } catch (error) {
    if (error instanceof DOMException && error.name === 'NotFoundError') return null;
    throw error;
  }
}

// -- Reading ----------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined;
}

function normalizeLibrary(raw: unknown): Library {
  if (!isRecord(raw)) {
    throw new Error(`${LIBRARY_FILE} does not contain a JSON object.`);
  }

  const stickers = Array.isArray(raw.stickers)
    ? raw.stickers.filter(isRecord).map(normalizeSticker).filter((s) => s.masterFile !== '')
    : [];

  return {
    ...raw,
    // A future version number is carried through rather than downgraded. There
    // is only one today, so anything unusable becomes 1.
    version: (typeof raw.version === 'number' ? raw.version : 1) as 1,
    updatedAt: str(raw.updatedAt) ?? new Date().toISOString(),
    template: mergeTemplate(raw.template),
    stickers,
  };
}

/**
 * Every known template key is guaranteed to be a finite number, because the
 * render path does arithmetic on these. Unknown keys ride along untouched.
 */
function mergeTemplate(raw: unknown): LabelTemplate {
  const source = isRecord(raw) ? raw : {};
  const out: Record<string, unknown> = { ...source };

  for (const key of Object.keys(DEFAULT_TEMPLATE) as (keyof LabelTemplate)[]) {
    const value = source[key];
    out[key] = typeof value === 'number' && Number.isFinite(value) ? value : DEFAULT_TEMPLATE[key];
  }

  return out as unknown as LabelTemplate;
}

function normalizeSticker(raw: Record<string, unknown>): Sticker {
  const now = new Date().toISOString();
  const masterFile = str(raw.masterFile) ?? '';
  const artName = str(raw.artName) ?? parseFilename(masterFile).artName;
  const marks = isRecord(raw.defaultMarks) ? raw.defaultMarks : {};

  return {
    ...raw,
    // Records written before ADR-0003 carry a UUID here. The filename is the
    // id now, and rewriting it costs nothing because nothing outlives a run.
    id: masterFile,
    artName,
    slug: str(raw.slug) ?? parseFilename(artName).slug,
    masterFile,
    createdAt: str(raw.createdAt) ?? now,
    updatedAt: str(raw.updatedAt) ?? now,
    defaultMarks: {
      barcode: marks.barcode !== false,
      logo: marks.logo === true,
    },
    // Overrides stay exactly as written. The editor (#24) owns validating them;
    // dropping keys we do not recognise is the one thing this must not do.
    overrides: (isRecord(raw.overrides) ? raw.overrides : {}) as LabelOverride,
    variantOverrides: (isRecord(raw.variantOverrides)
      ? raw.variantOverrides
      : {}) as Record<string, LabelOverride>,
  };
}
