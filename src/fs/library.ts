import type { LabelTemplate } from '@/config/template';
import { DEFAULT_TEMPLATE } from '@/config/template';
import type { LabelOverride, Library, Sticker } from '@/types';
import type { Marks } from '@/render/slots';
import { parseFilename } from '@/lib/parseFilename';

/**
 * The library folder as a database.
 *
 * `stickers.json` is the index and `masters/` holds the bytes. Masters are
 * written once and never modified or overwritten: the whole point of keeping
 * them is that any sticker can be re-rendered at any size or type later, which
 * stops being true the moment a filename collision quietly replaces one.
 *
 * Reads preserve fields they do not recognise. Two people share this folder
 * through a sync client, so a newer version of the app can write keys this one
 * has never heard of, and dropping them on the next save would corrupt the
 * other machine's library from here.
 */

export const LIBRARY_FILE = 'stickers.json';
export const MASTERS_DIR = 'masters';

export function emptyLibrary(): Library {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    template: { ...DEFAULT_TEMPLATE },
    stickers: [],
  };
}

/**
 * Reads `stickers.json`, creating it with the default template if it is not
 * there yet. Throws only when the file exists but cannot be understood:
 * overwriting an unreadable library would destroy the other machine's work.
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

/** Writes the index and returns exactly what landed on disk. */
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

export interface ImportFailure {
  filename: string;
  message: string;
}

export interface ImportResult {
  stickers: Sticker[];
  failures: ImportFailure[];
}

/**
 * Copies images into `masters/` and returns a Sticker for each.
 *
 * Sequential on purpose: each master is on disk before the next name is
 * chosen, so a batch containing two files that parse to the same name gets
 * `sunset-beach.png` and `sunset-beach-2.png` rather than one overwriting the
 * other. A file that fails is reported, not thrown, so the rest still import.
 */
export async function importImages(
  dir: FileSystemDirectoryHandle,
  files: readonly File[],
  defaultMarks: Marks,
): Promise<ImportResult> {
  const masters = await dir.getDirectoryHandle(MASTERS_DIR, { create: true });
  const stickers: Sticker[] = [];
  const failures: ImportFailure[] = [];

  for (const file of files) {
    try {
      stickers.push(await importOne(masters, file, defaultMarks));
    } catch (error) {
      failures.push({
        filename: file.name,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { stickers, failures };
}

async function importOne(
  masters: FileSystemDirectoryHandle,
  file: File,
  defaultMarks: Marks,
): Promise<Sticker> {
  const { artName, slug } = parseFilename(file.name);
  const masterFile = await freeName(masters, `${slug || 'sticker'}${extensionOf(file.name)}`);

  const handle = await masters.getFileHandle(masterFile, { create: true });
  const writable = await handle.createWritable();
  await writable.write(file);
  await writable.close();

  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
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

/** Reads one master back out of `masters/`. */
export async function readMaster(
  dir: FileSystemDirectoryHandle,
  masterFile: string,
): Promise<File> {
  const masters = await dir.getDirectoryHandle(MASTERS_DIR);
  const handle = await masters.getFileHandle(masterFile);
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
 * Every card in the grid re-renders whenever a filter changes, so without this
 * a single click would re-read and re-decode every image on disk. Masters are
 * immutable once written, which is what makes caching them safe.
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

  // A failure must not be remembered, or a master that was merely missing when
  // the sync client had not caught up stays broken until a reload.
  pending.catch(() => decoded.delete(masterFile));

  decoded.set(masterFile, pending);
  return pending;
}

/** Called when the folder changes, so a new library cannot see old bytes. */
export function clearMasterCache(): void {
  decoded.clear();
}

// -- Naming -----------------------------------------------------------------

/** The extension as written, including the dot. `.png` when there is none. */
function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot > 0 ? filename.slice(dot).toLowerCase() : '.png';
}

/** `sunset-beach.png`, then `sunset-beach-2.png`, and so on. Never overwrites. */
async function freeName(dir: FileSystemDirectoryHandle, desired: string): Promise<string> {
  const dot = desired.lastIndexOf('.');
  const stem = dot > 0 ? desired.slice(0, dot) : desired;
  const ext = dot > 0 ? desired.slice(dot) : '';

  let candidate = desired;
  let n = 2;
  while (await fileHandle(dir, candidate)) {
    candidate = `${stem}-${n}${ext}`;
    n += 1;
  }
  return candidate;
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
    ? raw.stickers.filter(isRecord).map(normalizeSticker)
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
  const artName = str(raw.artName) ?? '';
  const marks = isRecord(raw.defaultMarks) ? raw.defaultMarks : {};

  return {
    ...raw,
    id: str(raw.id) ?? crypto.randomUUID(),
    artName,
    slug: str(raw.slug) ?? parseFilename(artName).slug,
    masterFile: str(raw.masterFile) ?? '',
    createdAt: str(raw.createdAt) ?? now,
    updatedAt: str(raw.updatedAt) ?? now,
    defaultMarks: {
      barcode: marks.barcode !== false,
      logo: marks.logo === true,
    },
    // Overrides stay exactly as written. The editor (#24) owns validating them;
    // until then nothing in this branch reads them, and dropping keys we do not
    // recognise is the one thing this function must not do.
    overrides: (isRecord(raw.overrides) ? raw.overrides : {}) as LabelOverride,
    variantOverrides: (isRecord(raw.variantOverrides)
      ? raw.variantOverrides
      : {}) as Record<string, LabelOverride>,
  };
}
