/**
 * The library folder.
 *
 * ADR-0002: the library is an ordinary folder that both machines already sync
 * with the Google Drive desktop client. The app never calls a Drive API. It
 * picks the folder once, keeps the handle in IndexedDB so a reload does not
 * mean re-picking, and re-requests permission with one click after that.
 *
 * A browser without `showDirectoryPicker` is not degraded into something
 * half-working — it is told plainly that it will not work here.
 */

const DB_NAME = 'sticker-generator';
const DB_VERSION = 1;
const STORE = 'handles';
const HANDLE_KEY = 'library-folder';

/** Chrome and Edge ship the picker; Firefox and Safari do not. */
export function isFolderPickerSupported(): boolean {
  return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const request = run(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

/**
 * The handle survives a reload because IndexedDB structured-clones it. It does
 * NOT survive with its permission intact — that is what `requestFolderAccess`
 * is for.
 */
export async function saveFolderHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  await withStore('readwrite', (store) => store.put(handle, HANDLE_KEY));
}

/** Returns null when nothing is stored, or when IndexedDB is unavailable. */
export async function loadFolderHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const stored = await withStore<unknown>('readonly', (store) => store.get(HANDLE_KEY));
    return isDirectoryHandle(stored) ? stored : null;
  } catch {
    // Private browsing, blocked storage, a corrupt database: all mean "no
    // remembered folder", which the gate screen already knows how to show.
    return null;
  }
}

export async function forgetFolderHandle(): Promise<void> {
  try {
    await withStore('readwrite', (store) => store.delete(HANDLE_KEY));
  } catch {
    // Nothing to forget if the database will not open.
  }
}

function isDirectoryHandle(value: unknown): value is FileSystemDirectoryHandle {
  return (
    typeof value === 'object' &&
    value !== null &&
    'kind' in value &&
    (value as FileSystemHandle).kind === 'directory'
  );
}

/** Raised when the user dismisses the picker. Not an error worth showing. */
export function isPickerDismissal(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

/**
 * Opens the picker. Must be called from a user gesture.
 * Asks for readwrite up front so that saving stickers.json later does not
 * trigger a second prompt.
 */
export async function pickLibraryFolder(): Promise<FileSystemDirectoryHandle> {
  const picker = window.showDirectoryPicker;
  if (!picker) throw new Error('This browser cannot open a folder picker.');
  const handle = await picker({ id: 'sticker-library', mode: 'readwrite' });
  await saveFolderHandle(handle);
  return handle;
}

/** Whether the app can already read and write the folder without prompting. */
export async function hasFolderAccess(handle: FileSystemDirectoryHandle): Promise<boolean> {
  try {
    return (await handle.queryPermission({ mode: 'readwrite' })) === 'granted';
  } catch {
    return false;
  }
}

/**
 * Re-requests access to a remembered folder. Must be called from a user
 * gesture — that is the "one click" in issue #20's acceptance criterion.
 */
export async function requestFolderAccess(handle: FileSystemDirectoryHandle): Promise<boolean> {
  try {
    return (await handle.requestPermission({ mode: 'readwrite' })) === 'granted';
  } catch {
    return false;
  }
}
