import { create } from 'zustand';
import type { Filters, Library, Sticker, StickerRequest } from '@/types';
import { SIZES, TYPES, getType } from '@/config/variants';
import { buildStickerArchive, saveBlob } from '@/lib/zip';
import {
  forgetFolderHandle,
  hasFolderAccess,
  isFolderPickerSupported,
  isPickerDismissal,
  loadFolderHandle,
  pickLibraryFolder,
  requestFolderAccess,
} from '@/fs/folder';
import { clearMasterCache, importImages, readLibrary, writeLibrary } from '@/fs/library';

/**
 * Application state.
 *
 * `status` is the connection to the library folder and decides which screen is
 * shown. Everything else is meaningless until it reads 'ready'.
 *
 *   checking -> unsupported        (no showDirectoryPicker)
 *            -> disconnected       (nothing remembered)
 *            -> needs-permission   (remembered, permission lapsed)
 *            -> ready
 */
export type ConnectionStatus =
  | 'checking'
  | 'unsupported'
  | 'disconnected'
  | 'needs-permission'
  | 'connecting'
  | 'ready'
  | 'error';

interface AppState {
  status: ConnectionStatus;
  /** The library folder. Non-null exactly when status is 'ready'. */
  dir: FileSystemDirectoryHandle | null;
  /** Remembered but not yet permitted: the one-click reconnect case. */
  pendingDir: FileSystemDirectoryHandle | null;
  error: string | null;

  /** The whole of stickers.json, including keys this version does not know. */
  library: Library | null;
  /** An import or a save is in flight. */
  busy: boolean;
  /** Non-fatal things worth telling the user about, newest batch only. */
  notices: string[];

  filters: Filters;
  /** Free text matched against art names. */
  search: string;
  /** Sticker ids picked for download. Survives filter changes by design. */
  selected: ReadonlySet<string>;
  /** Where the last plain click landed, so shift-click has a range to fill. */
  anchorId: string | null;

  /**
   * lookupKey -> UPC, read from upc-lookup.csv. Empty until #25 parses it, so
   * every barcode request currently reports a miss and badges the card, which
   * is exactly what the absence of the file means.
   */
  upcs: Readonly<Record<string, string>>;

  /** Run once on mount: reconnects to a remembered folder if it can. */
  init: () => Promise<void>;
  /** Opens the picker. Must be called from a user gesture. */
  connect: () => Promise<void>;
  /** Re-requests access to the remembered folder. User gesture required. */
  grantAccess: () => Promise<void>;
  /** Forgets the folder and returns to the gate. */
  disconnect: () => Promise<void>;

  /** Copies images into masters/ and appends them to the library. */
  importFiles: (files: readonly File[]) => Promise<void>;
  /** Renders the selection as the current request and saves one ZIP. */
  downloadSelected: () => Promise<void>;

  setFilters: (patch: Partial<Filters>) => void;
  setSearch: (search: string) => void;

  /** Plain click toggles one card; shift-click fills the range from the anchor. */
  clickSticker: (id: string, visibleIds: readonly string[], shift: boolean) => void;
  selectAll: (visibleIds: readonly string[]) => void;
  clearSelection: () => void;

  clearNotices: () => void;
}

/**
 * Whether the search box admits a sticker. The master filename counts too, so
 * looking for the file you just dropped in finds it even if the parsed art
 * name came out differently from what you typed.
 */
export function matchesSearch(
  sticker: Pick<Sticker, 'artName' | 'masterFile'>,
  search: string,
): boolean {
  const query = search.trim().toLowerCase();
  if (!query) return true;
  return (
    sticker.artName.toLowerCase().includes(query) ||
    sticker.masterFile.toLowerCase().includes(query)
  );
}


export const useAppStore = create<AppState>((set, get) => ({
  status: 'checking',
  dir: null,
  pendingDir: null,
  error: null,

  library: null,
  busy: false,
  notices: [],

  filters: {
    size: SIZES[0].id,
    type: TYPES[0].id,
    barcode: true,
    logo: false,
  },
  search: '',
  selected: new Set<string>(),
  anchorId: null,
  upcs: {},

  init: async () => {
    if (!isFolderPickerSupported()) {
      set({ status: 'unsupported' });
      return;
    }

    const handle = await loadFolderHandle();
    // Reading IndexedDB is slow enough that a folder can already be open by the
    // time it finishes — React StrictMode runs this twice in dev, and the
    // second pass must not throw away what the first one connected to.
    if (isSettled(get().status)) return;

    if (!handle) {
      set({ status: 'disconnected' });
      return;
    }

    const permitted = await hasFolderAccess(handle);
    if (isSettled(get().status)) return;

    if (permitted) {
      await open(handle, set);
    } else {
      set({ status: 'needs-permission', pendingDir: handle });
    }
  },

  connect: async () => {
    try {
      const handle = await pickLibraryFolder();
      await open(handle, set);
    } catch (error) {
      if (isPickerDismissal(error)) {
        // Chrome throws AbortError both when you dismiss the picker and when
        // it refuses the folder you chose. Returning silently to the gate
        // renders the identical screen, so it has to say something.
        set((s) => ({
          status: s.pendingDir ? 'needs-permission' : 'disconnected',
          error: DISMISSED,
        }));
        return;
      }
      set({ status: 'error', error: messageOf(error) });
    }
  },

  grantAccess: async () => {
    const handle = get().pendingDir;
    if (!handle) return;

    if (await requestFolderAccess(handle)) {
      await open(handle, set);
    } else {
      set({
        status: 'needs-permission',
        error: 'Access to the library folder was not granted.',
      });
    }
  },

  disconnect: async () => {
    await forgetFolderHandle();
    clearMasterCache();
    set({
      status: 'disconnected',
      dir: null,
      pendingDir: null,
      library: null,
      error: null,
      notices: [],
      selected: new Set<string>(),
      anchorId: null,
      search: '',
    });
  },

  importFiles: async (files) => {
    const { dir, library, filters } = get();
    if (!dir || !library || files.length === 0) return;

    set({ busy: true, notices: [] });
    try {
      // Product type supplies only a DEFAULT for the marks; the filter bar
      // still decides what any given render actually shows.
      const defaultMarks = getType(filters.type)?.defaultMarks ?? { barcode: true, logo: false };
      const { stickers, failures } = await importImages(dir, files, defaultMarks);

      const next = await writeLibrary(dir, {
        ...library,
        stickers: [...library.stickers, ...stickers],
      });

      set({
        library: next,
        busy: false,
        notices: failures.map((f) => `${f.filename} could not be imported: ${f.message}`),
        // Importing selects what you just brought in, which is almost always
        // what you are about to download.
        selected: new Set(stickers.map((s) => s.id)),
        anchorId: stickers.at(-1)?.id ?? null,
      });
    } catch (error) {
      set({ busy: false, notices: [messageOf(error)] });
    }
  },

  downloadSelected: async () => {
    const { dir, library, selected, filters, upcs } = get();
    if (!dir || !library || selected.size === 0) return;

    set({ busy: true, notices: [] });
    try {
      // Library order, not selection order, so the archive comes out in the
      // same order as the grid you picked from.
      const chosen = library.stickers.filter((sticker) => selected.has(sticker.id));
      const requests: StickerRequest[] = chosen.map((sticker) => ({
        stickerId: sticker.id,
        size: filters.size,
        type: filters.type,
        barcode: filters.barcode,
        logo: filters.logo,
      }));

      const archive = await buildStickerArchive(requests, {
        dir,
        template: library.template,
        stickersById: new Map(library.stickers.map((sticker) => [sticker.id, sticker])),
        upcs,
      });

      if (archive.blob) saveBlob(archive.blob, archive.filename);

      const notices = archive.failures.map((f) => `${f.label} could not be rendered: ${f.message}`);
      if (!archive.blob) {
        notices.unshift('Nothing could be rendered, so no archive was downloaded.');
      }
      set({ busy: false, notices });
    } catch (error) {
      set({ busy: false, notices: [messageOf(error)] });
    }
  },

  setFilters: (patch) => set((s) => ({ filters: { ...s.filters, ...patch } })),
  setSearch: (search) => set({ search }),

  clickSticker: (id, visibleIds, shift) => {
    const { selected, anchorId } = get();
    const next = new Set(selected);

    const from = anchorId ? visibleIds.indexOf(anchorId) : -1;
    const to = visibleIds.indexOf(id);

    if (shift && from !== -1 && to !== -1) {
      // A range only ever adds. Making it toggle would mean dragging across a
      // partly-selected grid silently deselected things.
      const [lo, hi] = from < to ? [from, to] : [to, from];
      for (let i = lo; i <= hi; i += 1) next.add(visibleIds[i]);
      set({ selected: next });
      return;
    }

    if (next.has(id)) next.delete(id);
    else next.add(id);
    set({ selected: next, anchorId: id });
  },

  selectAll: (visibleIds) => set({ selected: new Set(visibleIds) }),
  clearSelection: () => set({ selected: new Set<string>(), anchorId: null }),

  clearNotices: () => set({ notices: [] }),
}));

/**
 * Chrome rejects with AbortError for a dismissed picker AND for a folder it
 * will not hand over, with nothing to tell them apart, so this covers both.
 */
const DISMISSED =
  'No folder was opened. If you picked one and Chrome then asked whether to let ' +
  'this site view or edit files, choose "Edit files" — view-only is not enough. ' +
  'Chrome also refuses some protected locations, so try a subfolder rather than ' +
  'the top of your user folder or a drive root.';

/** A folder is already open, or in the middle of opening. */
function isSettled(status: ConnectionStatus): boolean {
  return status === 'ready' || status === 'connecting';
}

type SetState = (partial: Partial<AppState>) => void;

/** Connects to a folder we are already permitted to use, and loads its index. */
async function open(handle: FileSystemDirectoryHandle, set: SetState): Promise<void> {
  set({ status: 'connecting', error: null });
  clearMasterCache();
  try {
    const library = await readLibrary(handle);
    set({
      status: 'ready',
      dir: handle,
      pendingDir: null,
      library,
      error: null,
      selected: new Set<string>(),
      anchorId: null,
    });
  } catch (error) {
    // A folder we cannot read is not a folder we should pretend to be in.
    set({ status: 'error', error: messageOf(error), dir: null, library: null });
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
