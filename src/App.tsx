import { useEffect, useMemo, useRef, useState } from 'react';
import FolderGate from '@/components/FolderGate';
import FilterBar from '@/components/FilterBar';
import StickerGrid from '@/components/StickerGrid';
import { ensureFontsLoaded, type FontStatus } from '@/render/fonts';
import { matchesSearch, useAppStore } from '@/store/useAppStore';

/**
 * One screen.
 *
 * The library folder gates everything, and once it is open there is no
 * navigation: a filter bar describing the request, and every sticker drawn as
 * that request. Importing adds to the same grid and selects what arrived.
 */
export default function App() {
  const status = useAppStore((s) => s.status);
  const init = useAppStore((s) => s.init);

  useEffect(() => {
    void init();
  }, [init]);

  if (status !== 'ready') return <FolderGate />;
  return <LibraryScreen />;
}

function LibraryScreen() {
  const dir = useAppStore((s) => s.dir);
  const stickers = useAppStore((s) => s.library?.stickers);
  const search = useAppStore((s) => s.search);
  const notices = useAppStore((s) => s.notices);
  const clearNotices = useAppStore((s) => s.clearNotices);

  const visible = useMemo(
    () => (stickers ?? []).filter((sticker) => matchesSearch(sticker, search)),
    [stickers, search],
  );
  const visibleIds = useMemo(() => visible.map((sticker) => sticker.id), [visible]);

  return (
    <div className="flex h-[100svh] flex-col">
      <header className="flex items-center gap-3 border-b border-[var(--color-rule)] bg-[var(--color-surface)] px-4 py-2">
        <h1 className="text-base font-semibold">Sticker Generator</h1>
        <span
          className="ml-auto truncate font-mono text-xs text-[var(--color-ink-3)]"
          title={dir?.name}
        >
          📁 {dir?.name}
        </span>
        <ChangeFolderButton />
        <ImportButton />
      </header>

      <FilterBar visibleIds={visibleIds} />

      <FontWarning />

      {notices.length > 0 && (
        <div className="flex items-start gap-3 border-b border-[var(--color-amber)] bg-amber-50 px-4 py-2 text-sm text-[var(--color-ink-2)]">
          <ul className="flex-1 space-y-0.5">
            {notices.map((notice) => (
              <li key={notice}>{notice}</li>
            ))}
          </ul>
          <button
            type="button"
            onClick={clearNotices}
            className="text-xs text-[var(--color-ink-3)] underline underline-offset-2"
          >
            Dismiss
          </button>
        </div>
      )}

      <StickerGrid
        visible={visible}
        visibleIds={visibleIds}
        empty={(stickers?.length ?? 0) === 0}
      />
    </div>
  );
}

/**
 * Canvas does not error on a missing font, it silently substitutes one — which
 * is how v1 produced different typography on each machine without anyone
 * noticing. Every render here still goes ahead; it just says so first.
 */
function FontWarning() {
  const [fonts, setFonts] = useState<FontStatus | null>(null);

  useEffect(() => {
    void ensureFontsLoaded().then(setFonts);
  }, []);

  if (!fonts || fonts.ok) return null;

  return (
    <div className="border-b border-[var(--color-amber)] bg-amber-50 px-4 py-2 text-sm text-[var(--color-ink-2)]">
      <strong>Label fonts are not loaded.</strong>{' '}
      {!fonts.name && <>The art-name face is missing. </>}
      {!fonts.subtitle && <>The subtitle face is missing. </>}
      Everything below — and anything you download — uses substitute typefaces
      and will not match a print proof. See{' '}
      <code className="font-mono text-xs">public/fonts/README.md</code>.
    </div>
  );
}

function ImportButton() {
  const importFiles = useAppStore((s) => s.importFiles);
  const busy = useAppStore((s) => s.busy);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          // Clearing lets the same file be chosen again after a failed import.
          event.target.value = '';
          void importFiles(files);
        }}
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-white hover:bg-[var(--color-brand-600)] disabled:opacity-50"
      >
        {busy ? 'Importing…' : 'Import'}
      </button>
    </>
  );
}

function ChangeFolderButton() {
  const disconnect = useAppStore((s) => s.disconnect);
  return (
    <button
      type="button"
      onClick={() => void disconnect()}
      className="text-xs text-[var(--color-ink-3)] underline underline-offset-2 hover:text-[var(--color-ink)]"
    >
      Change
    </button>
  );
}
