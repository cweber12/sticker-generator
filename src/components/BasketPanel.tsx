import { useEffect, useMemo, useRef } from 'react';
import { getSize, getType } from '@/config/variants';
import { loadMasterImage } from '@/fs/library';
import { groupBasket, type BasketGroup } from '@/lib/basket';
import { presentStickers, useAppStore } from '@/store/useAppStore';

/**
 * The basket, read before it ships.
 *
 * Download lives here and nowhere else, so opening the basket IS reviewing it.
 * Rows are grouped by sticker: one thumbnail answers "is this the right
 * artwork?", and the variant lines answer "is this the right size and type?" —
 * which a preview cannot, since every variant draws the same 4x6 label and
 * only the subtitle differs.
 */
export default function BasketPanel() {
  const open = useAppStore((s) => s.basketOpen);
  const basket = useAppStore((s) => s.basket);
  const library = useAppStore((s) => s.library);
  const files = useAppStore((s) => s.files);
  const busy = useAppStore((s) => s.busy);
  const removeFromBasket = useAppStore((s) => s.removeFromBasket);
  const emptyBasket = useAppStore((s) => s.emptyBasket);
  const downloadBasket = useAppStore((s) => s.downloadBasket);
  const toggleBasket = useAppStore((s) => s.toggleBasket);

  const groups = useMemo(
    () => groupBasket(basket, presentStickers(library, files)),
    [basket, library, files],
  );

  if (!open) return null;

  return (
    <aside
      aria-label="Basket"
      className="flex w-80 shrink-0 flex-col border-l border-[var(--color-rule)] bg-[var(--color-surface)]"
    >
      <header className="flex items-center gap-2 border-b border-[var(--color-rule)] px-3 py-2">
        <h2 className="text-sm font-semibold">Basket</h2>
        <span className="text-xs text-[var(--color-ink-3)]">
          {groups.length} sticker{groups.length === 1 ? '' : 's'} · {basket.size} PDF
          {basket.size === 1 ? '' : 's'}
        </span>
        <button
          type="button"
          onClick={toggleBasket}
          aria-label="Close the basket"
          className="ml-auto text-sm text-[var(--color-ink-3)] hover:text-[var(--color-ink)]"
        >
          ✕
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-3 py-2">
        {groups.length === 0 ? (
          <p className="py-8 text-center text-sm text-[var(--color-ink-3)]">
            Nothing here yet. Tick some stickers, choose a size and type, and press{' '}
            <strong>Add to basket</strong>.
          </p>
        ) : (
          <ul className="space-y-3">
            {groups.map((group) => (
              <Row key={group.stickerId} group={group} onRemove={removeFromBasket} />
            ))}
          </ul>
        )}
      </div>

      <footer className="flex items-center gap-3 border-t border-[var(--color-rule)] px-3 py-2">
        <button
          type="button"
          onClick={emptyBasket}
          disabled={basket.size === 0}
          className="text-xs text-[var(--color-ink-3)] underline underline-offset-2 hover:text-[var(--color-ink)] disabled:opacity-40"
        >
          Empty basket
        </button>
        <button
          type="button"
          onClick={() => void downloadBasket()}
          disabled={busy || basket.size === 0}
          className="ml-auto rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-white hover:bg-[var(--color-brand-600)] disabled:opacity-40"
        >
          {busy ? 'Working…' : 'Download'}
        </button>
      </footer>
    </aside>
  );
}

function Row({ group, onRemove }: { group: BasketGroup; onRemove: (key: string) => void }) {
  const missing = group.sticker === null;

  return (
    <li className={missing ? 'opacity-50' : undefined}>
      <div className="flex items-center gap-2">
        <Thumb masterFile={group.sticker?.masterFile ?? null} />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium" title={group.stickerId}>
            {group.sticker?.artName ?? group.stickerId}
          </p>
          {/* ADR-0003: absence may be the sync client mid-write, so the entry
              stays. Download skips it and it is still here to retry. */}
          {missing && (
            <p className="text-[11px] text-[var(--color-ink-3)]">not in the folder right now</p>
          )}
        </div>
      </div>

      <ul className="mt-1 ml-10 space-y-0.5">
        {group.entries.map((entry) => (
          <li key={entry.key} className="flex items-center gap-2 text-xs text-[var(--color-ink-2)]">
            <span className="flex-1 truncate">
              {getSize(entry.size)?.id ?? entry.size} {getType(entry.type)?.label ?? entry.type}
            </span>
            <button
              type="button"
              onClick={() => onRemove(entry.key)}
              aria-label={`Remove ${entry.size} ${entry.type}`}
              className="text-[var(--color-ink-4)] hover:text-[var(--color-ink)]"
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
    </li>
  );
}

/**
 * The master, not a rendered sticker: the question a thumbnail answers is
 * "which artwork is this?". `loadMasterImage` caches its bitmaps, so this
 * costs no extra disk read.
 */
function Thumb({ masterFile }: { masterFile: string | null }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const dir = useAppStore((s) => s.dir);

  useEffect(() => {
    if (!dir || !masterFile) return;
    let cancelled = false;

    void (async () => {
      try {
        const master = await loadMasterImage(dir, masterFile);
        const canvas = ref.current;
        if (cancelled || !canvas) return;

        const context = canvas.getContext('2d');
        if (!context) return;

        // Cover, so mixed aspect ratios still line up down the column.
        const scale = Math.max(canvas.width / master.width, canvas.height / master.height);
        const w = master.width * scale;
        const h = master.height * scale;
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.drawImage(master.source, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
      } catch {
        // A thumbnail is never worth a broken row.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [dir, masterFile]);

  return (
    <canvas
      ref={ref}
      width={32}
      height={32}
      aria-hidden
      className="h-8 w-8 shrink-0 rounded border border-[var(--color-rule)] bg-[var(--color-paper-2)]"
    />
  );
}
