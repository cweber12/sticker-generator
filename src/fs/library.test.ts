import { describe, it, expect } from 'vitest';
import {
  LIBRARY_FILE,
  emptyLibrary,
  importImages,
  readLibrary,
  readMaster,
  writeLibrary,
} from './library';
import { DEFAULT_TEMPLATE } from '@/config/template';
import type { Library } from '@/types';

/**
 * An in-memory FileSystemDirectoryHandle.
 *
 * Only the four calls library.ts actually makes are implemented, and
 * `getFileHandle` throws a real NotFoundError DOMException, because that is
 * the signal `freeName` uses to decide a master name is free. A fake that
 * threw anything else would let the collision test pass while the real thing
 * silently overwrote a master.
 */
function memoryDir(name = 'library'): FileSystemDirectoryHandle {
  const files = new Map<string, Blob>();
  const dirs = new Map<string, FileSystemDirectoryHandle>();

  const notFound = (entry: string) =>
    new DOMException(`${entry} not found`, 'NotFoundError');

  const fileHandleFor = (fileName: string): FileSystemFileHandle =>
    ({
      kind: 'file',
      name: fileName,
      getFile: async () => new File([files.get(fileName) ?? new Blob([])], fileName),
      createWritable: async () => {
        const chunks: BlobPart[] = [];
        return {
          write: async (data: BlobPart) => {
            chunks.push(data);
          },
          close: async () => {
            files.set(fileName, new Blob(chunks));
          },
        } as unknown as FileSystemWritableFileStream;
      },
    }) as unknown as FileSystemFileHandle;

  return {
    kind: 'directory',
    name,
    getFileHandle: async (fileName: string, options?: { create?: boolean }) => {
      if (!files.has(fileName)) {
        if (!options?.create) throw notFound(fileName);
        files.set(fileName, new Blob([]));
      }
      return fileHandleFor(fileName);
    },
    getDirectoryHandle: async (dirName: string, options?: { create?: boolean }) => {
      let existing = dirs.get(dirName);
      if (!existing) {
        if (!options?.create) throw notFound(dirName);
        existing = memoryDir(dirName);
        dirs.set(dirName, existing);
      }
      return existing;
    },
  } as unknown as FileSystemDirectoryHandle;
}

const MARKS = { barcode: true, logo: false };

const png = (name: string, body: string) =>
  new File([body], name, { type: 'image/png' });

/** Reads the raw JSON on disk, bypassing normalization. */
async function rawIndex(dir: FileSystemDirectoryHandle): Promise<Record<string, unknown>> {
  const handle = await dir.getFileHandle(LIBRARY_FILE);
  return JSON.parse(await (await handle.getFile()).text()) as Record<string, unknown>;
}

describe('readLibrary', () => {
  it('creates stickers.json with the default template when the folder is new', async () => {
    const dir = memoryDir();
    const library = await readLibrary(dir);

    expect(library.version).toBe(1);
    expect(library.stickers).toEqual([]);
    expect(library.template).toEqual(DEFAULT_TEMPLATE);

    // It is on disk, not just in memory — the next machine to open the folder
    // must find an index rather than create a competing one.
    expect(await rawIndex(dir)).toMatchObject({ version: 1, stickers: [] });
  });

  it('treats an empty file as a new library rather than failing', async () => {
    const dir = memoryDir();
    const handle = await dir.getFileHandle(LIBRARY_FILE, { create: true });
    const writable = await handle.createWritable();
    await writable.write('   ');
    await writable.close();

    await expect(readLibrary(dir)).resolves.toMatchObject({ stickers: [] });
  });

  it('refuses to overwrite an index it cannot parse', async () => {
    const dir = memoryDir();
    const handle = await dir.getFileHandle(LIBRARY_FILE, { create: true });
    const writable = await handle.createWritable();
    await writable.write('{ this is not json');
    await writable.close();

    await expect(readLibrary(dir)).rejects.toThrow(/not valid JSON/);
    // The damaged bytes are still there to be recovered from sync history.
    const handleAfter = await dir.getFileHandle(LIBRARY_FILE);
    expect(await (await handleAfter.getFile()).text()).toBe('{ this is not json');
  });

  it('replaces a non-numeric template value rather than feeding it to the renderer', async () => {
    const dir = memoryDir();
    await writeLibrary(dir, {
      ...emptyLibrary(),
      template: { ...DEFAULT_TEMPLATE, labelHeightIn: 'tall' },
    } as unknown as Library);

    const library = await readLibrary(dir);
    expect(library.template.labelHeightIn).toBe(DEFAULT_TEMPLATE.labelHeightIn);
  });
});

describe('stickers.json round-trip', () => {
  it('reads back exactly what was written', async () => {
    const dir = memoryDir();
    const { stickers } = await importImages(dir, [png('Sunset Beach.png', 'a')], MARKS);

    const written = await writeLibrary(dir, { ...emptyLibrary(), stickers });
    const read = await readLibrary(dir);

    expect(read).toEqual(written);
  });

  it('preserves fields a newer version of the app wrote', async () => {
    const dir = memoryDir();
    const { stickers } = await importImages(dir, [png('Sunset Beach.png', 'a')], MARKS);

    const written = await writeLibrary(dir, {
      ...emptyLibrary(),
      stickers: [{ ...stickers[0], printedAt: '2026-09-09' }],
      template: { ...DEFAULT_TEMPLATE, bleedIn: 0.125 },
      exportPreset: 'client-a',
    } as unknown as Library);

    const read = await readLibrary(dir);

    expect(read).toEqual(written);
    expect(read).toMatchObject({ exportPreset: 'client-a' });
    expect(read.template).toMatchObject({ bleedIn: 0.125 });
    expect(read.stickers[0]).toMatchObject({ printedAt: '2026-09-09' });

    // And they survive a second save, which is where a naive reader loses them.
    const resaved = await writeLibrary(dir, read);
    expect(await readLibrary(dir)).toEqual(resaved);
  });

  it('stamps updatedAt on every write', async () => {
    const dir = memoryDir();
    const written = await writeLibrary(dir, { ...emptyLibrary(), updatedAt: 'never' });
    expect(written.updatedAt).not.toBe('never');
    expect((await readLibrary(dir)).updatedAt).toBe(written.updatedAt);
  });
});

describe('importImages', () => {
  it('names the master from the filename and fills in the sticker', async () => {
    const dir = memoryDir();
    const { stickers, failures } = await importImages(
      dir,
      [png('01 - Sunset Beach_final.png', 'bytes')],
      { barcode: false, logo: true },
    );

    expect(failures).toEqual([]);
    expect(stickers).toHaveLength(1);
    expect(stickers[0]).toMatchObject({
      artName: 'Sunset Beach',
      slug: 'sunset-beach',
      masterFile: 'sunset-beach.png',
      defaultMarks: { barcode: false, logo: true },
      overrides: {},
      variantOverrides: {},
    });
    expect(stickers[0].id).toBeTruthy();
  });

  it('suffixes a colliding master instead of overwriting the first copy', async () => {
    const dir = memoryDir();

    const first = await importImages(dir, [png('Sunset Beach.png', 'first')], MARKS);
    const second = await importImages(dir, [png('sunset-beach.png', 'second')], MARKS);

    expect(first.stickers[0].masterFile).toBe('sunset-beach.png');
    expect(second.stickers[0].masterFile).toBe('sunset-beach-2.png');

    // Both sets of bytes are still there. This is the whole reason masters are
    // kept: an old artwork must stay renderable at a new size later.
    expect(await (await readMaster(dir, 'sunset-beach.png')).text()).toBe('first');
    expect(await (await readMaster(dir, 'sunset-beach-2.png')).text()).toBe('second');
  });

  it('suffixes collisions inside a single batch too', async () => {
    const dir = memoryDir();
    const { stickers } = await importImages(
      dir,
      [
        png('Sunset Beach.png', 'one'),
        png('sunset beach.png', 'two'),
        png('SUNSET-BEACH.png', 'three'),
      ],
      MARKS,
    );

    expect(stickers.map((s) => s.masterFile)).toEqual([
      'sunset-beach.png',
      'sunset-beach-2.png',
      'sunset-beach-3.png',
    ]);
    expect(await (await readMaster(dir, 'sunset-beach-3.png')).text()).toBe('three');
  });

  it('keeps the extension and falls back to .png when there is none', async () => {
    const dir = memoryDir();
    const { stickers } = await importImages(
      dir,
      [png('Sunset Beach.JPG', 'a'), png('Harbour', 'b')],
      MARKS,
    );

    expect(stickers.map((s) => s.masterFile)).toEqual(['sunset-beach.jpg', 'harbour.png']);
  });

  it('reports a failed file and still imports the rest', async () => {
    const dir = memoryDir();
    const masters = await dir.getDirectoryHandle('masters', { create: true });
    const original = masters.getFileHandle.bind(masters);
    masters.getFileHandle = (async (name: string, options?: { create?: boolean }) => {
      if (name === 'broken.png') throw new Error('disk is full');
      return original(name, options);
    }) as typeof masters.getFileHandle;

    const { stickers, failures } = await importImages(
      dir,
      [png('broken.png', 'x'), png('Harbour.png', 'y')],
      MARKS,
    );

    expect(stickers.map((s) => s.masterFile)).toEqual(['harbour.png']);
    expect(failures).toEqual([{ filename: 'broken.png', message: 'disk is full' }]);
  });
});
