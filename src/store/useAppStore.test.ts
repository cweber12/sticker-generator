import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useAppStore } from './useAppStore';
import { emptyLibrary } from '@/fs/library';
import * as folder from '@/fs/folder';
import * as library from '@/fs/library';

/**
 * The connection state machine.
 *
 * This is the part of #20 that cannot be exercised in a browser harness: a
 * folder handle only survives a reload through IndexedDB, and the picker needs
 * a native dialog. So the folder layer is faked and the states are driven
 * directly, which is where the one-click reconnect actually lives.
 */

vi.mock('@/fs/folder', () => ({
  isFolderPickerSupported: vi.fn(() => true),
  loadFolderHandle: vi.fn(async () => null),
  saveFolderHandle: vi.fn(async () => undefined),
  forgetFolderHandle: vi.fn(async () => undefined),
  hasFolderAccess: vi.fn(async () => true),
  requestFolderAccess: vi.fn(async () => true),
  pickLibraryFolder: vi.fn(),
  isPickerDismissal: vi.fn(() => false),
}));

vi.mock('@/fs/library', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/fs/library')>();
  return {
    ...actual,
    readLibrary: vi.fn(async () => actual.emptyLibrary()),
    writeLibrary: vi.fn(async (_dir: unknown, lib: unknown) => lib),
    syncLibrary: vi.fn(async (_dir: unknown, library: unknown) => ({
      library,
      files: [],
      adopted: [],
    })),
    copyIntoLibrary: vi.fn(async () => ({ copied: [], skipped: [], failures: [] })),
    clearMasterCache: vi.fn(),
  };
});

const handle = { kind: 'directory', name: 'Client Stickers' } as FileSystemDirectoryHandle;

const pristine = { ...useAppStore.getState() };

beforeEach(() => {
  vi.clearAllMocks();
  useAppStore.setState({
    ...pristine,
    status: 'checking',
    files: [],
    dir: null,
    pendingDir: null,
    library: null,
    error: null,
    notices: [],
    selected: new Set<string>(),
    anchorId: null,
    search: '',
  });
  vi.mocked(folder.isFolderPickerSupported).mockReturnValue(true);
  vi.mocked(folder.loadFolderHandle).mockResolvedValue(null);
  vi.mocked(folder.hasFolderAccess).mockResolvedValue(true);
  vi.mocked(folder.requestFolderAccess).mockResolvedValue(true);
  vi.mocked(library.readLibrary).mockResolvedValue(emptyLibrary());
  vi.mocked(library.syncLibrary).mockImplementation(async (_dir, lib) => ({
    library: lib,
    files: [],
    adopted: [],
  }));
});

describe('init', () => {
  it('reports a browser with no picker rather than offering a dead button', async () => {
    vi.mocked(folder.isFolderPickerSupported).mockReturnValue(false);
    await useAppStore.getState().init();
    expect(useAppStore.getState().status).toBe('unsupported');
  });

  it('shows the gate when no folder has ever been chosen', async () => {
    await useAppStore.getState().init();
    expect(useAppStore.getState().status).toBe('disconnected');
  });

  it('reopens a remembered folder that is still permitted', async () => {
    vi.mocked(folder.loadFolderHandle).mockResolvedValue(handle);
    await useAppStore.getState().init();

    const state = useAppStore.getState();
    expect(state.status).toBe('ready');
    expect(state.dir).toBe(handle);
    expect(state.library).not.toBeNull();
  });

  it('asks for one click when the remembered folder lost permission', async () => {
    vi.mocked(folder.loadFolderHandle).mockResolvedValue(handle);
    vi.mocked(folder.hasFolderAccess).mockResolvedValue(false);

    await useAppStore.getState().init();

    const state = useAppStore.getState();
    expect(state.status).toBe('needs-permission');
    // Named, so the gate can say which folder it means.
    expect(state.pendingDir).toBe(handle);
    expect(state.dir).toBeNull();
  });

  it('does not undo a folder that was opened while it was still reading', async () => {
    // StrictMode runs init twice in dev, and reading IndexedDB is slow enough
    // that a connect() can land in between. A late "nothing was remembered"
    // must not throw away the folder that is now open, or the app drops
    // straight back to the gate for no visible reason.
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.mocked(folder.loadFolderHandle).mockImplementation(async () => {
      await pending;
      return null;
    });

    const slowInit = useAppStore.getState().init();

    vi.mocked(folder.pickLibraryFolder).mockResolvedValue(handle);
    await useAppStore.getState().connect();
    expect(useAppStore.getState().status).toBe('ready');

    release();
    await slowInit;

    expect(useAppStore.getState().status).toBe('ready');
    expect(useAppStore.getState().dir).toBe(handle);
  });

  it('does not open the picker on its own — reconnecting needs a gesture', async () => {
    vi.mocked(folder.loadFolderHandle).mockResolvedValue(handle);
    vi.mocked(folder.hasFolderAccess).mockResolvedValue(false);
    await useAppStore.getState().init();
    expect(folder.pickLibraryFolder).not.toHaveBeenCalled();
    expect(folder.requestFolderAccess).not.toHaveBeenCalled();
  });
});

describe('grantAccess', () => {
  beforeEach(async () => {
    vi.mocked(folder.loadFolderHandle).mockResolvedValue(handle);
    vi.mocked(folder.hasFolderAccess).mockResolvedValue(false);
    await useAppStore.getState().init();
  });

  it('reconnects the remembered folder in one click', async () => {
    await useAppStore.getState().grantAccess();

    const state = useAppStore.getState();
    expect(folder.requestFolderAccess).toHaveBeenCalledWith(handle);
    expect(state.status).toBe('ready');
    expect(state.dir).toBe(handle);
    expect(state.pendingDir).toBeNull();
    // Never re-picked: the whole point is that the folder is remembered.
    expect(folder.pickLibraryFolder).not.toHaveBeenCalled();
  });

  it('stays on the gate and says so when access is refused', async () => {
    vi.mocked(folder.requestFolderAccess).mockResolvedValue(false);
    await useAppStore.getState().grantAccess();

    const state = useAppStore.getState();
    expect(state.status).toBe('needs-permission');
    expect(state.error).toMatch(/not granted/i);
    expect(state.dir).toBeNull();
  });
});

describe('connect', () => {
  it('says something when the picker closes without opening a folder', async () => {
    vi.mocked(folder.pickLibraryFolder).mockRejectedValue(new Error('aborted'));
    vi.mocked(folder.isPickerDismissal).mockReturnValue(true);

    await useAppStore.getState().connect();

    const state = useAppStore.getState();
    // Not an error screen — you are back at the gate, which is where a change
    // of mind should leave you.
    expect(state.status).toBe('disconnected');
    // But not silent: the gate it returns to is pixel-identical to the one it
    // left, so with no message this is indistinguishable from a dead button.
    // Chrome throws the same AbortError when it refuses the chosen folder.
    expect(state.error).toMatch(/Edit files/);
  });

  it('surfaces an unreadable index instead of pretending the folder opened', async () => {
    vi.mocked(folder.pickLibraryFolder).mockResolvedValue(handle);
    vi.mocked(library.readLibrary).mockRejectedValue(new Error('stickers.json is not valid JSON.'));

    await useAppStore.getState().connect();

    const state = useAppStore.getState();
    expect(state.status).toBe('error');
    expect(state.error).toMatch(/not valid JSON/);
    expect(state.dir).toBeNull();
    expect(state.library).toBeNull();
  });
});

describe('selection', () => {
  const ids = ['a', 'b', 'c', 'd'];

  it('toggles one card on a plain click', () => {
    const { clickSticker } = useAppStore.getState();
    clickSticker('b', ids, false);
    expect([...useAppStore.getState().selected]).toEqual(['b']);

    clickSticker('b', ids, false);
    expect([...useAppStore.getState().selected]).toEqual([]);
  });

  it('fills the range from the last plain click on shift-click', () => {
    const { clickSticker } = useAppStore.getState();
    clickSticker('a', ids, false);
    clickSticker('c', ids, true);
    expect([...useAppStore.getState().selected].sort()).toEqual(['a', 'b', 'c']);
  });

  it('fills a backwards range the same way', () => {
    const { clickSticker } = useAppStore.getState();
    clickSticker('d', ids, false);
    clickSticker('b', ids, true);
    expect([...useAppStore.getState().selected].sort()).toEqual(['b', 'c', 'd']);
  });

  it('never deselects through a range', () => {
    const { clickSticker } = useAppStore.getState();
    clickSticker('b', ids, false);
    clickSticker('a', ids, false);
    clickSticker('c', ids, true);
    expect([...useAppStore.getState().selected].sort()).toEqual(['a', 'b', 'c']);
  });

  it('treats shift with no anchor as an ordinary click', () => {
    useAppStore.getState().clickSticker('c', ids, true);
    expect([...useAppStore.getState().selected]).toEqual(['c']);
  });

  it('selects and clears everything currently visible', () => {
    const { selectAll, clearSelection } = useAppStore.getState();
    selectAll(ids);
    expect(useAppStore.getState().selected.size).toBe(4);
    clearSelection();
    expect(useAppStore.getState().selected.size).toBe(0);
  });
});
