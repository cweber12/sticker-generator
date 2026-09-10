import { create } from 'zustand';
import type { LabelOverride, Library, Sticker, Variant } from '@/types';
import type { Marks } from '@/render/slots';
import { addVariant, basketRequests, parseRequestKey, type RequestKey } from '@/lib/basket';
import type { SizeId, TypeId } from '@/config/variants';
import { SIZES, TYPES } from '@/config/variants';
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
import {
  clearMasterCache,
  copyIntoLibrary,
  readLibrary,
  syncLibrary,
  writeLibrary,
} from '@/fs/library';

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

/**
 * What the maximized view is showing.
 *
 * A Sticker plus a Variant — the same pair a basket entry is — because you
 * open it to check one specific rendering. `from` decides what the arrows
 * walk: the basket entries when you came from the basket, the visible grid at
 * a fixed variant when you came from a card.
 */
export interface DetailTarget {
  stickerId: string;
  size: SizeId;
  type: TypeId;
  from: 'basket' | 'grid';
}

interface AppState {
  status: ConnectionStatus;
  /** The library folder. Non-null exactly when status is 'ready'. */
  dir: FileSystemDirectoryHandle | null;
  /** Remembered but not yet permitted: the one-click reconnect case. */
  pendingDir: FileSystemDirectoryHandle | null;
  error: string | null;

  /**
   * The whole of stickers.json, including keys this version does not know.
   * Metadata only — `files` is what says which stickers exist (ADR-0003).
   */
  library: Library | null;
  /** Images actually in the library folder, in display order. THE library. */
  files: string[];
  /** An import or a save is in flight. */
  busy: boolean;
  /** Non-fatal things worth telling the user about, newest batch only. */
  notices: string[];

  /** The Variant everything is drawn as, and that Add will use. Not a filter. */
  variant: Variant;
  /**
   * Marks for the DOWNLOAD, not for a request. The filename encodes size and
   * type only, so two entries differing by marks would be indistinguishable
   * in the ZIP — see docs/adr/0004-the-basket-of-requests.md.
   */
  marks: Marks;
  /** Sticker x Variant entries the download will render. */
  basket: ReadonlySet<RequestKey>;
  /** Whether the basket panel is open beside the grid. */
  basketOpen: boolean;
  /**
   * The sticker being looked at full size, or null.
   *
   * It carries its OWN variant rather than reading the bar's, because a basket
   * row opens at the variant that row is for and the grid must not follow it
   * there. `from` says which list the arrows walk.
   */
  detail: DetailTarget | null;
  /** Free text matched against art names. */
  search: string;
  /** Stickers ticked in the grid. Staging: what the next Add will use. */
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

  /** Copies images from elsewhere into the library folder. */
  importFiles: (files: readonly File[]) => Promise<void>;
  /** Re-reads the folder, picking up whatever the other machine synced in. */
  rescan: () => Promise<void>;
  /** Renders the basket and saves one ZIP. */
  downloadBasket: () => Promise<void>;

  setVariant: (patch: Partial<Variant>) => void;
  setMarks: (patch: Partial<Marks>) => void;
  /** Selection x the current Variant, unioned in. Does NOT clear the ticks. */
  addToBasket: () => void;
  removeFromBasket: (key: RequestKey) => void;
  emptyBasket: () => void;
  toggleBasket: () => void;

  openDetail: (target: DetailTarget) => void;
  closeDetail: () => void;
  /** Walks the list `detail.from` names. Clamps at both ends. */
  stepDetail: (delta: number) => void;
  setSearch: (search: string) => void;

  /**
   * Patches one sticker's overrides in memory. An `undefined` value DELETES
   * the key, so reverting a field inherits the template again rather than
   * remembering what it used to be (CONTEXT.md: Override).
   *
   * Deliberately does not write: a colour picker fires on every mouse move.
   */
  setOverride: (stickerId: string, patch: LabelOverride) => void;
  /** Writes stickers.json. Called when an edit settles, not while it moves. */
  persistLibrary: () => Promise<void>;

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
  files: [],
  busy: false,
  notices: [],

  variant: { size: SIZES[0].id, type: TYPES[0].id },
  // Product type supplies only a DEFAULT, and it seeds the bar, not a sticker.
  marks: { ...TYPES[0].defaultMarks },
  basket: new Set<RequestKey>(),
  basketOpen: false,
  detail: null,
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
      files: [],
      selected: new Set<string>(),
      anchorId: null,
      search: '',
      basket: new Set<RequestKey>(),
      basketOpen: false,
      detail: null,
    });
  },

  importFiles: async (files) => {
    const { dir, library } = get();
    if (!dir || !library || files.length === 0) return;

    set({ busy: true, notices: [] });
    try {
      const { copied, skipped, failures } = await copyIntoLibrary(dir, files);
      const synced = await syncLibrary(dir, library);

      const notices = failures.map((f) => `${f.filename} could not be copied in: ${f.message}`);
      if (skipped.length > 0) {
        notices.push(
          `Already in the library, left alone: ${skipped.join(', ')}. Rename the file if it is different artwork.`,
        );
      }

      set({
        library: synced.library,
        files: synced.files,
        busy: false,
        notices,
        // Select what you just brought in — almost always what you are about
        // to download. Ids are filenames now, so this needs no lookup.
        selected: new Set(copied),
        anchorId: copied.at(-1) ?? null,
      });
    } catch (error) {
      set({ busy: false, notices: [messageOf(error)] });
    }
  },

  rescan: async () => {
    const { dir, library } = get();
    if (!dir || !library) return;

    set({ busy: true, notices: [] });
    try {
      const synced = await syncLibrary(dir, library);
      set({
        library: synced.library,
        files: synced.files,
        busy: false,
        notices:
          synced.adopted.length > 0
            ? [`Found ${synced.adopted.length} new image${synced.adopted.length === 1 ? '' : 's'}.`]
            : [],
      });
    } catch (error) {
      set({ busy: false, notices: [messageOf(error)] });
    }
  },

  downloadBasket: async () => {
    const { dir, library, files, basket, marks, upcs } = get();
    if (!dir || !library || basket.size === 0) return;

    set({ busy: true, notices: [] });
    try {
      // Library order, not the order things were added, so the archive comes
      // out in the same order as the grid you picked from.
      const requests = basketRequests(basket, presentStickers(library, files), marks);

      const archive = await buildStickerArchive(requests, {
        dir,
        template: library.template,
        stickersById: new Map(library.stickers.map((sticker) => [sticker.id, sticker])),
        upcs,
      });

      if (archive.blob) saveBlob(archive.blob, archive.filename);

      // Once downloaded they live in the ZIP and nowhere else. A failure never
      // downloaded, so it stays put and one more press retries it.
      const next = new Set(basket);
      for (const key of archive.succeeded) next.delete(key);

      const notices = archive.failures.map((f) => `${f.label} could not be rendered: ${f.message}`);
      if (!archive.blob) {
        notices.unshift('Nothing could be rendered, so no archive was downloaded.');
      }
      set({ basket: next, busy: false, notices });
    } catch (error) {
      set({ busy: false, notices: [messageOf(error)] });
    }
  },

  setVariant: (patch) => set((s) => ({ variant: { ...s.variant, ...patch } })),
  setMarks: (patch) => set((s) => ({ marks: { ...s.marks, ...patch } })),

  /**
   * Selection x the current Variant, unioned into the basket.
   *
   * Does NOT clear the selection. That is what makes adding the same stickers
   * at a second variant one more press instead of a fresh round of ticking.
   */
  addToBasket: () => {
    const { selected, variant, basket } = get();
    if (selected.size === 0) return;
    set({ basket: addVariant(basket, selected, variant.size, variant.type) });
  },

  removeFromBasket: (key) =>
    set((s) => {
      const next = new Set(s.basket);
      next.delete(key);
      const parsed = parseRequestKey(key);
      const looking =
        s.detail?.from === 'basket' &&
        parsed !== null &&
        s.detail.stickerId === parsed.stickerId &&
        s.detail.size === parsed.size &&
        s.detail.type === parsed.type;
      return { basket: next, detail: looking ? null : s.detail };
    }),

  emptyBasket: () => set({ basket: new Set<RequestKey>(), detail: null }),
  toggleBasket: () => set((s) => ({ basketOpen: !s.basketOpen })),

  openDetail: (target) => set({ detail: target }),
  closeDetail: () => set({ detail: null }),

  stepDetail: (delta) => {
    const { detail } = get();
    if (!detail) return;

    const list = detailList(get(), detail.from);
    const at = list.findIndex(
      (t) =>
        t.stickerId === detail.stickerId && t.size === detail.size && t.type === detail.type,
    );
    if (at === -1) return;

    // Clamped, not wrapped: running off the end of an order is how you know
    // you have proofed all of it.
    const next = list[Math.min(Math.max(at + delta, 0), list.length - 1)];
    set({ detail: { ...next, from: detail.from } });
  },
  setSearch: (search) => set({ search }),

  setOverride: (stickerId, patch) =>
    set((s) => {
      if (!s.library) return {};
      const now = new Date().toISOString();
      return {
        library: {
          ...s.library,
          stickers: s.library.stickers.map((sticker) =>
            sticker.id === stickerId
              ? {
                  ...sticker,
                  overrides: patchOverride(sticker.overrides, patch),
                  updatedAt: now,
                }
              : sticker,
          ),
        },
      };
    }),

  persistLibrary: async () => {
    const { dir, library } = get();
    if (!dir || !library) return;
    try {
      set({ library: await writeLibrary(dir, library) });
    } catch (error) {
      // The edit is still on screen and still in memory; only the folder is
      // behind. Saying so beats diverging from the other machine in silence.
      set({ notices: [messageOf(error)] });
    }
  },

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

/**
 * The library as the FOLDER defines it: present files in display order, paired
 * with their metadata. A record whose file is absent is skipped rather than
 * deleted — see ADR-0003.
 */
export function presentStickers(
  library: Library | null,
  files: readonly string[],
): Sticker[] {
  if (!library) return [];
  const byFile = new Map(library.stickers.map((sticker) => [sticker.masterFile, sticker]));
  return files
    .map((file) => byFile.get(file))
    .filter((sticker): sticker is Sticker => sticker !== undefined);
}

/**
 * The ordered list `stepDetail` walks.
 *
 * From the basket: every ENTRY, in the same order the ZIP will hold them, so
 * one pass proofs the whole order. From the grid: the stickers the search box
 * currently admits, all at the bar's variant.
 */
function detailList(
  state: Pick<AppState, 'library' | 'files' | 'basket' | 'variant' | 'search'>,
  from: 'basket' | 'grid',
): { stickerId: string; size: SizeId; type: TypeId }[] {
  const present = presentStickers(state.library, state.files);

  if (from === 'basket') {
    return basketRequests(state.basket, present, { barcode: false, logo: false }).map(
      ({ stickerId, size, type }) => ({ stickerId, size, type }),
    );
  }

  return present
    .filter((sticker) => matchesSearch(sticker, state.search))
    .map((sticker) => ({ stickerId: sticker.id, size: state.variant.size, type: state.variant.type }));
}

/** A folder is already open, or in the middle of opening. */
function isSettled(status: ConnectionStatus): boolean {
  return status === 'ready' || status === 'connecting';
}

type SetState = (partial: Partial<AppState>) => void;

/** Connects to a folder we are already permitted to use, and loads its index. */
async function open(
  handle: FileSystemDirectoryHandle,
  set: SetState,
): Promise<void> {
  set({ status: 'connecting', error: null });
  clearMasterCache();
  try {
    // Read the overlay, then let the folder say what is actually in it.
    const library = await readLibrary(handle);
    const synced = await syncLibrary(handle, library);
    set({
      status: 'ready',
      dir: handle,
      pendingDir: null,
      library: synced.library,
      files: synced.files,
      error: null,
      selected: new Set<string>(),
      anchorId: null,
      basket: new Set<RequestKey>(),
      detail: null,
    });
  } catch (error) {
    // A folder we cannot read is not a folder we should pretend to be in.
    set({ status: 'error', error: messageOf(error), dir: null, library: null, files: [] });
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Applies a sparse patch to one sticker's overrides.
 *
 * `undefined` deletes rather than stores, which is what makes reverting a
 * field exact: the key goes, and the template is inherited again. Storing a
 * remembered value instead is how a layout ends up pinned to a number nobody
 * chose.
 */
function patchOverride(current: LabelOverride, patch: LabelOverride): LabelOverride {
  const next: Record<string, unknown> = { ...current };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) delete next[key];
    else next[key] = value;
  }
  return next as LabelOverride;
}
