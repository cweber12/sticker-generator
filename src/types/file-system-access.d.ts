/**
 * File System Access API pieces TypeScript's DOM lib does not ship.
 *
 * `FileSystemDirectoryHandle`, `FileSystemFileHandle` and
 * `FileSystemWritableFileStream` are all in lib.dom.d.ts already. These three
 * are not, because they are specified outside the core file-system spec:
 * the picker entry point and the permission methods that ADR-0002 depends on
 * to reconnect to the library folder after a reload.
 *
 * Declared globally (no imports in this file) so the interface merging lands
 * on the real DOM types rather than creating parallel ones.
 */

type FileSystemPermissionMode = 'read' | 'readwrite';

interface FileSystemHandlePermissionDescriptor {
  mode?: FileSystemPermissionMode;
}

interface DirectoryPickerOptions {
  /** Chrome remembers the last directory chosen under a given id. */
  id?: string;
  mode?: FileSystemPermissionMode;
  startIn?: FileSystemHandle | 'desktop' | 'documents' | 'downloads' | 'pictures';
}

interface FileSystemHandle {
  queryPermission(
    descriptor?: FileSystemHandlePermissionDescriptor,
  ): Promise<PermissionState>;
  requestPermission(
    descriptor?: FileSystemHandlePermissionDescriptor,
  ): Promise<PermissionState>;
}

interface Window {
  /** Chrome and Edge only — absent everywhere else, hence optional. */
  showDirectoryPicker?: (
    options?: DirectoryPickerOptions,
  ) => Promise<FileSystemDirectoryHandle>;
}
