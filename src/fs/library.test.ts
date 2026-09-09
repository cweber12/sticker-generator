import { describe, it, expect } from 'vitest';
import {
  LIBRARY_FILE,
  copyIntoLibrary,
  emptyLibrary,
  listMasters,
  readLibrary,
  readMaster,
  stickerFor,
  syncLibrary,
  writeLibrary,
} from './library';
import { DEFAULT_TEMPLATE } from '@/config/template';
import type { Library } from '@/types';

/**
 * An in-memory FileSystemDirectoryHandle.
 *
 * Only what library.ts actually calls. `getFileHandle` throws a real
 * NotFoundError DOMException because that is the signal used to decide whether
 * a name is free, and `entries()` is an async iterator because that is how the
 * folder listing is read.
 */
function memoryDir(name = 'library'): FileSystemDirectoryHandle {
  const files = new Map<string, Blob>();
  const dirs = new Map<string, FileSystemDirectoryHandle>();

  const notFound = (entry: string) => new DOMException(`${entry} not found`, 'NotFoundError');

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
    entries: async function* () {
      for (const fileName of files.keys()) yield [fileName, fileHandleFor(fileName)] as const;
      for (const [dirName, handle] of dirs) yield [dirName, handle] as const;
    },
    removeEntry: async (entry: string) => {
      if (!files.delete(entry) && !dirs.delete(entry)) throw notFound(entry);
    },
  } as unknown as FileSystemDirectoryHandle;
}

const MARKS = { barcode: true, logo: false };

const png = (name: string, body = 'bytes') => new File([body], name, { type: 'image/png' });

/** Drops files into the folder the way Explorer or a sync client would. */
async function place(dir: FileSystemDirectoryHandle, ...files: File[]): Promise<void> {
  for (const file of files) {
    const handle = await dir.getFileHandle(file.name, { create: true });
    const writable = await handle.createWritable();
    await writable.write(file);
    await writable.close();
  }
}

describe('listMasters', () => {
  it('finds artwork and ignores everything else in the folder', async () => {
    const dir = memoryDir();
    await place(dir, png('Sunset.png'), png('Harbour.JPG'), png('Notes.txt'), png('scan.webp'));
    await writeLibrary(dir, emptyLibrary());
    await dir.getDirectoryHandle('archive', { create: true });

    expect(await listMasters(dir)).toEqual(['Harbour.JPG', 'scan.webp', 'Sunset.png']);
  });

  it('sorts naturally, so 2 comes before 10', async () => {
    const dir = memoryDir();
    await place(dir, png('Art 10.png'), png('Art 2.png'), png('Art 1.png'));
    expect(await listMasters(dir)).toEqual(['Art 1.png', 'Art 2.png', 'Art 10.png']);
  });

  it('is empty for a folder with no artwork', async () => {
    expect(await listMasters(memoryDir())).toEqual([]);
  });
});

describe('stickerFor', () => {
  it('takes its identity from the filename', async () => {
    const sticker = stickerFor('01 - Sunset Beach_final.png', { barcode: false, logo: true });
    expect(sticker).toMatchObject({
      id: '01 - Sunset Beach_final.png',
      masterFile: '01 - Sunset Beach_final.png',
      artName: 'Sunset Beach',
      slug: 'sunset-beach',
      defaultMarks: { barcode: false, logo: true },
      overrides: {},
    });
  });

  it('gives both machines the same id for the same file', () => {
    // Filenames, not UUIDs, so two people adopting the same synced image
    // independently agree on what to call it.
    expect(stickerFor('Sunset.png', MARKS).id).toBe(stickerFor('Sunset.png', MARKS).id);
  });
});

describe('syncLibrary', () => {
  it('adopts every image in the folder without an import step', async () => {
    const dir = memoryDir();
    await place(dir, png('Sunset Beach.png'), png('Harbour.jpg'));

    const result = await syncLibrary(dir, await readLibrary(dir), MARKS);

    expect(result.files).toEqual(['Harbour.jpg', 'Sunset Beach.png']);
    expect(result.adopted).toEqual(['Harbour.jpg', 'Sunset Beach.png']);
    expect(result.library.stickers.map((s) => s.artName).sort()).toEqual([
      'Harbour',
      'Sunset Beach',
    ]);
    // Persisted, so the next machine to open the folder sees the same names.
    expect((await readLibrary(dir)).stickers).toHaveLength(2);
  });

  it('picks up a file the other machine synced in, leaving the rest alone', async () => {
    const dir = memoryDir();
    await place(dir, png('Sunset Beach.png'));
    const first = await syncLibrary(dir, await readLibrary(dir), MARKS);

    await place(dir, png('Harbour.jpg'));
    const second = await syncLibrary(dir, first.library, MARKS);

    expect(second.adopted).toEqual(['Harbour.jpg']);
    expect(second.files).toEqual(['Harbour.jpg', 'Sunset Beach.png']);
    expect(second.library.stickers).toHaveLength(2);
  });

  it('does not write when nothing changed, so two open tabs do not duel', async () => {
    const dir = memoryDir();
    await place(dir, png('Sunset Beach.png'));
    const first = await syncLibrary(dir, await readLibrary(dir), MARKS);

    const second = await syncLibrary(dir, first.library, MARKS);

    expect(second.adopted).toEqual([]);
    // Same object, and updatedAt untouched: no save happened.
    expect(second.library).toBe(first.library);
    expect((await readLibrary(dir)).updatedAt).toBe(first.library.updatedAt);
  });

  it('keeps the record of a file that is missing rather than deleting it', async () => {
    // A sync client can make a file briefly absent. Dropping the record would
    // throw away its overrides for good.
    const dir = memoryDir();
    await place(dir, png('Sunset Beach.png'));
    const first = await syncLibrary(dir, await readLibrary(dir), MARKS);

    const edited: Library = {
      ...first.library,
      stickers: first.library.stickers.map((s) => ({ ...s, overrides: { artName: 'Renamed' } })),
    };
    await writeLibrary(dir, edited);

    // The file really vanishes, the way a sync client can make it.
    await dir.removeEntry('Sunset Beach.png');
    const gone = await syncLibrary(dir, await readLibrary(dir), MARKS);

    expect(gone.files).toEqual([]);
    expect(gone.adopted).toEqual([]);
    // Not listed, but the record and its overrides are still on disk.
    expect(gone.library.stickers).toHaveLength(1);
    expect(gone.library.stickers[0].overrides).toEqual({ artName: 'Renamed' });

    // And when it comes back it re-links, overrides intact, not re-adopted.
    await place(dir, png('Sunset Beach.png'));
    const back = await syncLibrary(dir, gone.library, MARKS);
    expect(back.files).toEqual(['Sunset Beach.png']);
    expect(back.adopted).toEqual([]);
    expect(back.library.stickers).toHaveLength(1);
    expect(back.library.stickers[0].overrides).toEqual({ artName: 'Renamed' });
  });
});

describe('copyIntoLibrary', () => {
  it('copies files in and leaves them findable by name', async () => {
    const dir = memoryDir();
    const result = await copyIntoLibrary(dir, [png('Sunset Beach.png', 'a'), png('Harbour.jpg', 'b')]);

    expect(result.copied).toEqual(['Sunset Beach.png', 'Harbour.jpg']);
    expect(result.skipped).toEqual([]);
    expect(await (await readMaster(dir, 'Sunset Beach.png')).text()).toBe('a');
  });

  it('skips a name already taken instead of overwriting or renaming it', async () => {
    const dir = memoryDir();
    await place(dir, png('Sunset Beach.png', 'original'));

    const result = await copyIntoLibrary(dir, [png('Sunset Beach.png', 'different artwork')]);

    expect(result.copied).toEqual([]);
    expect(result.skipped).toEqual(['Sunset Beach.png']);
    // The folder is the user's now: nothing was clobbered, nothing was renamed
    // behind their back.
    expect(await (await readMaster(dir, 'Sunset Beach.png')).text()).toBe('original');
  });

  it('reports one failure and still copies the rest', async () => {
    const dir = memoryDir();
    const original = dir.getFileHandle.bind(dir);
    dir.getFileHandle = (async (name: string, options?: { create?: boolean }) => {
      if (name === 'broken.png' && options?.create) throw new Error('disk is full');
      return original(name, options);
    }) as typeof dir.getFileHandle;

    const result = await copyIntoLibrary(dir, [png('broken.png'), png('Harbour.jpg')]);

    expect(result.copied).toEqual(['Harbour.jpg']);
    expect(result.failures).toEqual([{ filename: 'broken.png', message: 'disk is full' }]);
  });
});

describe('readLibrary', () => {
  it('creates stickers.json with the default template when the folder is new', async () => {
    const dir = memoryDir();
    const library = await readLibrary(dir);

    expect(library.version).toBe(1);
    expect(library.stickers).toEqual([]);
    expect(library.template).toEqual(DEFAULT_TEMPLATE);
  });

  it('treats an empty file as a new library rather than failing', async () => {
    const dir = memoryDir();
    await place(dir, new File(['   '], LIBRARY_FILE));
    await expect(readLibrary(dir)).resolves.toMatchObject({ stickers: [] });
  });

  it('refuses to overwrite an index it cannot parse', async () => {
    const dir = memoryDir();
    await place(dir, new File(['{ this is not json'], LIBRARY_FILE));

    await expect(readLibrary(dir)).rejects.toThrow(/not valid JSON/);
    // The damaged bytes are still there to be recovered from sync history.
    const after = await dir.getFileHandle(LIBRARY_FILE);
    expect(await (await after.getFile()).text()).toBe('{ this is not json');
  });

  it('replaces a non-numeric template value rather than feeding it to the renderer', async () => {
    const dir = memoryDir();
    await writeLibrary(dir, {
      ...emptyLibrary(),
      template: { ...DEFAULT_TEMPLATE, labelHeightIn: 'tall' },
    } as unknown as Library);

    expect((await readLibrary(dir)).template.labelHeightIn).toBe(DEFAULT_TEMPLATE.labelHeightIn);
  });

  it('drops a record that names no file, since it can never match one', async () => {
    const dir = memoryDir();
    await writeLibrary(dir, {
      ...emptyLibrary(),
      stickers: [{ id: 'x', artName: 'Orphan' }],
    } as unknown as Library);

    expect((await readLibrary(dir)).stickers).toEqual([]);
  });
});

describe('stickers.json round-trip', () => {
  it('reads back exactly what was written', async () => {
    const dir = memoryDir();
    await place(dir, png('Sunset Beach.png'));
    const synced = await syncLibrary(dir, await readLibrary(dir), MARKS);

    const written = await writeLibrary(dir, synced.library);
    expect(await readLibrary(dir)).toEqual(written);
  });

  it('preserves fields a newer version of the app wrote', async () => {
    const dir = memoryDir();
    await place(dir, png('Sunset Beach.png'));
    const synced = await syncLibrary(dir, await readLibrary(dir), MARKS);

    const written = await writeLibrary(dir, {
      ...synced.library,
      stickers: [{ ...synced.library.stickers[0], printedAt: '2026-09-09' }],
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
