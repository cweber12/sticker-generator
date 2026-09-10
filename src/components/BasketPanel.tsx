import { useMemo, useState } from 'react';
import { getSize, getType, variantKey } from '@/config/variants';
import type { SizeId, TypeId } from '@/config/variants';
import { groupBasket, type BasketGroup } from '@/lib/basket';
import { DEFAULT_TEMPLATE } from '@/config/template';
import { presentStickers, useAppStore } from '@/store/useAppStore';
import type { Sticker } from '@/types';
import { resolveLabelText, resolveTemplate, upcFor } from '@/types';
import { useStickerRender } from './useStickerRender';

/**
 * The basket, read before it ships.
 *
 * Download lives here and nowhere else, so opening the basket IS reviewing it.
 * One image per sticker, drawn as whichever of its variants is currently
 * chosen beneath it — because the size and type are printed INSIDE the label,
 * so the render is what proves the variant, not a caption next to it.
 *
 * Two different clicks on a variant line: the line itself chooses what the
 * image shows, and the ✕ takes it out of the order. Keeping those apart is
 * what stops someone deleting a request while trying to look at it.
 */

/**
 * Enough smaller than a grid card that four fit on screen. A grid card is
 * ~448px tall on a 1080px display; at grid size two basket entries would fill
 * the panel and the surface meant for checking an order at a glance would need
 * scrolling to see half of it.
 */
const BASKET_CARD_H = 'h-[clamp(150px,27dvh,290px)]';

const CANVAS_CLASS = 'block h-full w-auto max-w-full rounded';

/** Same 300 dpi render as a grid card; CSS decides how big it lands. */
const PREVIEW_SCALE = 0.2;

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

  const present = useMemo(() => presentStickers(library, files), [library, files]);
  const groups = useMemo(() => groupBasket(basket, present), [basket, present]);

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

      <div className="flex-1 overflow-y-auto px-3 py-3">
        {groups.length === 0 ? (
          <p className="py-8 text-center text-sm text-[var(--color-ink-3)]">
            Nothing here yet. Tick some stickers, choose a size and type, and press{' '}
            <strong>Add to basket</strong>.
          </p>
        ) : (
          <ul className="space-y-4">
            {groups.map((group) => (
              <Entry key={group.stickerId} group={group} onRemove={removeFromBasket} />
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

function Entry({ group, onRemove }: { group: BasketGroup; onRemove: (key: string) => void }) {
  // Which of this sticker's variants the image is showing. Display only — it
  // never touches the order.
  const [shown, setShown] = useState(0);
  const entry = group.entries[Math.min(shown, group.entries.length - 1)];

  return (
    <li className={group.sticker === null ? 'opacity-50' : undefined}>
      {group.sticker === null ? (
        <div
          className={`grid ${BASKET_CARD_H} w-full place-items-center rounded border border-dashed border-[var(--color-rule)] px-3 text-center text-xs text-[var(--color-ink-3)]`}
        >
          {/* ADR-0003: absence may be the sync client mid-write, so the entry
              stays. Download skips it and it is still here to retry. */}
          <span>
            <strong className="block truncate">{group.stickerId}</strong>
            not in the folder right now
          </span>
        </div>
      ) : (
        <Preview sticker={group.sticker} size={entry.size} type={entry.type} />
      )}

      <ul className="mt-1.5 space-y-0.5">
        {group.entries.map((e, index) => {
          const chosen = index === Math.min(shown, group.entries.length - 1);
          return (
            <li key={e.key} className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setShown(index)}
                aria-pressed={chosen}
                title="Show this variant in the preview above"
                className={`flex-1 truncate rounded px-1.5 py-0.5 text-left text-xs ${
                  chosen
                    ? 'bg-[var(--color-paper-2)] font-medium text-[var(--color-ink)]'
                    : 'text-[var(--color-ink-3)] hover:bg-[var(--color-paper-2)]'
                }`}
              >
                {getSize(e.size)?.id ?? e.size} {getType(e.type)?.label ?? e.type}
              </button>
              <button
                type="button"
                onClick={() => onRemove(e.key)}
                aria-label={`Remove ${e.size} ${e.type} from the basket`}
                title="Remove from the basket"
                className="px-1 text-[var(--color-ink-4)] hover:text-[var(--color-ink)]"
              >
                ✕
              </button>
            </li>
          );
        })}
      </ul>
    </li>
  );
}

/**
 * The chosen variant, drawn through the same path as the grid and the PDF, and
 * a click away from being full size.
 */
function Preview({
  sticker,
  size,
  type,
}: {
  sticker: Sticker;
  size: SizeId;
  type: TypeId;
}) {
  const dir = useAppStore((s) => s.dir);
  const template = useAppStore((s) => s.library?.template);
  const marks = useAppStore((s) => s.marks);
  const upcs = useAppStore((s) => s.upcs);
  const openDetail = useAppStore((s) => s.openDetail);

  const inputs = useMemo(() => {
    const base = template ?? DEFAULT_TEMPLATE;
    return {
      template: resolveTemplate(base, sticker, variantKey(size, type)),
      ...resolveLabelText(sticker, size, type),
      upc: upcFor(upcs, sticker, size, type),
    };
  }, [template, sticker, size, type, upcs]);

  const { hostRef, phase } = useStickerRender({
    dir,
    masterFile: sticker.masterFile,
    template: inputs.template,
    artName: inputs.artName,
    subtitle: inputs.subtitle,
    marks,
    upc: inputs.upc,
    scale: PREVIEW_SCALE,
    canvasClassName: CANVAS_CLASS,
  });

  return (
    <button
      type="button"
      onClick={() => openDetail({ stickerId: sticker.id, size, type, from: 'basket' })}
      title={`${inputs.artName} — click to view full size`}
      className={`card relative grid ${BASKET_CARD_H} w-full cursor-zoom-in place-items-center overflow-hidden p-1.5`}
    >
      <span ref={hostRef} className="flex h-full items-center justify-center" />
      {phase === 'blank' && (
        <span className="absolute inset-0 grid place-items-center text-xs text-[var(--color-ink-4)]">
          Rendering…
        </span>
      )}
    </button>
  );
}
