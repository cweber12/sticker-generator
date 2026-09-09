import { create } from 'zustand';
import type { Filters, Library } from '@/types';
import { SIZES, TYPES, getType } from '@/config/variants';
import {
  forgetFolderHandle,
  hasFolderAccess,
  isFolderPickerSupported,
  isPickerDismissal,
  loadFolderHandle,
  pickLibraryFolder,
  requestFolderAccess,
} from '@/fs/folder';
import { importImages, readLibrary, writeLibrary } from '@/fs/library';

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

  setFilters: (patch: Partial<Filters>) => void;
  clearNotices: () => void;
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

  init: async () => {
    if (!isFolderPickerSupported()) {
      set({ status: 'unsupported' });
      return;
    }

    const handle = await loadFolderHandle();
    if (!handle) {
      set({ status: 'disconnected' });
      return;
    }

    if (await hasFolderAccess(handle)) {
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
        // The user changed their mind. Leave them where they were.
        set((s) => ({ status: s.pendingDir ? 'needs-permission' : 'disconnected' }));
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
    set({
      status: 'disconnected',
      dir: null,
      pendingDir: null,
      library: null,
      error: null,
      notices: [],
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
      });
    } catch (error) {
      set({ busy: false, notices: [messageOf(error)] });
    }
  },

  setFilters: (patch) => set((s) => ({ filters: { ...s.filters, ...patch } })),
  clearNotices: () => set({ notices: [] }),
}));

type SetState = (partial: Partial<AppState>) => void;

/** Connects to a folder we are already permitted to use, and loads its index. */
async function open(handle: FileSystemDirectoryHandle, set: SetState): Promise<void> {
  set({ status: 'connecting', error: null });
  try {
    const library = await readLibrary(handle);
    set({ status: 'ready', dir: handle, pendingDir: null, library, error: null });
  } catch (error) {
    // A folder we cannot read is not a folder we should pretend to be in.
    set({ status: 'error', error: messageOf(error), dir: null, library: null });
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
