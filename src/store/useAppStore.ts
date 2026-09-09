import { create } from 'zustand';
import type { Filters } from '@/types';
import { SIZES, TYPES } from '@/config/variants';
import {
  forgetFolderHandle,
  hasFolderAccess,
  isFolderPickerSupported,
  isPickerDismissal,
  loadFolderHandle,
  pickLibraryFolder,
  requestFolderAccess,
} from '@/fs/folder';

/**
 * Application state.
 *
 * `status` is the connection to the library folder and drives which screen is
 * shown. Everything else is meaningless until it reads 'ready'.
 *
 *   checking ─────► unsupported            (no showDirectoryPicker)
 *            ├────► disconnected           (nothing remembered)
 *            ├────► needs-permission       (remembered, permission lapsed)
 *            └────► ready
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
  /** Remembered but not yet permitted — the one-click reconnect case. */
  pendingDir: FileSystemDirectoryHandle | null;
  error: string | null;

  filters: Filters;

  /** Run once on mount: reconnects to a remembered folder if it can. */
  init: () => Promise<void>;
  /** Opens the picker. Must be called from a user gesture. */
  connect: () => Promise<void>;
  /** Re-requests access to the remembered folder. User gesture required. */
  grantAccess: () => Promise<void>;
  /** Forgets the folder and returns to the gate. */
  disconnect: () => Promise<void>;

  setFilters: (patch: Partial<Filters>) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  status: 'checking',
  dir: null,
  pendingDir: null,
  error: null,

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
      open(handle, set);
    } else {
      set({ status: 'needs-permission', pendingDir: handle });
    }
  },

  connect: async () => {
    try {
      const handle = await pickLibraryFolder();
      open(handle, set);
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
      open(handle, set);
    } else {
      set({
        status: 'needs-permission',
        error: 'Access to the library folder was not granted.',
      });
    }
  },

  disconnect: async () => {
    await forgetFolderHandle();
    set({ status: 'disconnected', dir: null, pendingDir: null, error: null });
  },

  setFilters: (patch) => set((s) => ({ filters: { ...s.filters, ...patch } })),
}));

type SetState = (partial: Partial<AppState>) => void;

/** Connects to a folder we are already permitted to use. */
function open(handle: FileSystemDirectoryHandle, set: SetState): void {
  set({ status: 'ready', dir: handle, pendingDir: null, error: null });
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
