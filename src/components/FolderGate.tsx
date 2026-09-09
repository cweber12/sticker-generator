import type { ReactNode } from 'react';
import { useAppStore } from '@/store/useAppStore';

/**
 * The screen shown until the app can read and write the library folder.
 *
 * Four things can be wrong, and each says which one it is. A browser without
 * the File System Access API is told so plainly rather than being offered a
 * button that cannot work (ADR-0002).
 */
export default function FolderGate() {
  const status = useAppStore((s) => s.status);
  const error = useAppStore((s) => s.error);
  const pendingDir = useAppStore((s) => s.pendingDir);
  const connect = useAppStore((s) => s.connect);
  const grantAccess = useAppStore((s) => s.grantAccess);

  if (status === 'checking' || status === 'connecting') {
    return (
      <Panel title="Sticker Generator">
        <p className="text-sm text-[var(--color-ink-3)]">
          {status === 'checking' ? 'Looking for your library folder…' : 'Opening the library…'}
        </p>
      </Panel>
    );
  }

  if (status === 'unsupported') {
    return (
      <Panel title="This browser will not work">
        <p className="text-sm text-[var(--color-ink-2)]">
          Sticker Generator reads and writes a folder on disk directly, which
          only <strong>Chrome</strong> and <strong>Edge</strong> support. Firefox
          and Safari have no way to do it.
        </p>
        <p className="text-sm text-[var(--color-ink-3)]">
          Open this page in Chrome or Edge and it will work.
        </p>
      </Panel>
    );
  }

  if (status === 'needs-permission') {
    return (
      <Panel title="Reconnect to your library">
        <p className="text-sm text-[var(--color-ink-2)]">
          Browsers drop folder access when the tab closes.
          {pendingDir ? <> Your library is <Folder name={pendingDir.name} />.</> : null}
        </p>
        {error && <Notice>{error}</Notice>}
        <Button onClick={grantAccess}>Reconnect</Button>
        <Secondary onClick={connect}>Choose a different folder</Secondary>
      </Panel>
    );
  }

  if (status === 'error') {
    return (
      <Panel title="Could not open that library">
        {error && <Notice>{error}</Notice>}
        <p className="text-sm text-[var(--color-ink-3)]">
          Nothing in the folder has been changed.
        </p>
        <Button onClick={connect}>Choose a folder</Button>
      </Panel>
    );
  }

  return (
    <Panel title="Choose your library folder">
      <p className="text-sm text-[var(--color-ink-2)]">
        Pick the folder your artwork lives in — the one Google Drive already
        syncs between both machines. Sticker Generator keeps{' '}
        <code className="font-mono text-xs">stickers.json</code> and a{' '}
        <code className="font-mono text-xs">masters/</code> folder inside it, so
        every image you import stays available to render again later at any size.
      </p>
      <p className="text-sm text-[var(--color-ink-3)]">
        Nothing is uploaded anywhere. The app only ever touches this one folder.
      </p>
      <Button onClick={connect}>Choose folder</Button>
    </Panel>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="grid min-h-[100svh] place-items-center p-6">
      <div className="card w-full max-w-xl space-y-4 p-8">
        <h1 className="text-xl font-semibold text-[var(--color-ink)]">{title}</h1>
        {children}
      </div>
    </div>
  );
}

function Folder({ name }: { name: string }) {
  return <strong className="font-mono text-xs">📁 {name}</strong>;
}

function Notice({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-md border border-[var(--color-amber)] bg-amber-50 p-3 text-sm text-[var(--color-ink-2)]">
      {children}
    </p>
  );
}

function Button({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-md bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-brand-600)]"
    >
      {children}
    </button>
  );
}

function Secondary({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="ml-3 text-sm text-[var(--color-ink-3)] underline underline-offset-2 hover:text-[var(--color-ink)]"
    >
      {children}
    </button>
  );
}
