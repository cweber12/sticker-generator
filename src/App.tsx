import { useEffect } from 'react';
import FolderGate from '@/components/FolderGate';
import { useAppStore } from '@/store/useAppStore';

export default function App() {
  const status = useAppStore((s) => s.status);
  const init = useAppStore((s) => s.init);

  useEffect(() => {
    void init();
  }, [init]);

  if (status !== 'ready') return <FolderGate />;
  return <Library />;
}

function Library() {
  const dir = useAppStore((s) => s.dir);
  const disconnect = useAppStore((s) => s.disconnect);

  return (
    <div className="flex min-h-[100svh] flex-col">
      <header className="flex items-center gap-3 border-b border-[var(--color-rule)] bg-[var(--color-surface)] px-4 py-3">
        <h1 className="text-base font-semibold">Sticker Generator</h1>
        <span className="ml-auto font-mono text-xs text-[var(--color-ink-3)]">
          📁 {dir?.name}
        </span>
        <button
          type="button"
          onClick={() => void disconnect()}
          className="text-xs text-[var(--color-ink-3)] underline underline-offset-2 hover:text-[var(--color-ink)]"
        >
          Change
        </button>
      </header>
    </div>
  );
}
