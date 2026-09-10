import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import StickerCard from './StickerCard';
import type { LabelTemplate } from '@/config/template';
import type { Marks } from '@/render/slots';
import { SIZES, TYPES, variantKey } from '@/config/variants';
import { requestKey } from '@/lib/basket';
import { useAppStore } from '@/store/useAppStore';
import type { Sticker } from '@/types';
import { resolveLabelText, resolveTemplate, upcFor } from '@/types';

/**
 * Every sticker in the library, drawn as the current request.
 *
 * There is no separate batch view. What you imported five minutes ago and what
 * you imported last month are the same grid, filtered.
 */

/** Long enough that clicking through the size buttons renders once, not thrice. */
const FILTER_SETTLE_MS = 120;

export interface StickerGridProps {
  /** Library order, already narrowed by the search box. */
  visible: readonly Sticker[];
  visibleIds: readonly string[];
  /** True when the library itself is empty, as opposed to the search missing. */
  empty: boolean;
}

export default function StickerGrid({ visible, visibleIds, empty }: StickerGridProps) {
  const dir = useAppStore((s) => s.dir);
  const stickers = useAppStore((s) => s.library?.stickers);
  const template = useAppStore((s) => s.library?.template);
  const variant = useAppStore((s) => s.variant);
  const marks = useAppStore((s) => s.marks);
  const basket = useAppStore((s) => s.basket);
  const search = useAppStore((s) => s.search);
  const selected = useAppStore((s) => s.selected);
  const upcs = useAppStore((s) => s.upcs);
  const clickSticker = useAppStore((s) => s.clickSticker);
  const openDetail = useAppStore((s) => s.openDetail);

  // Renders are the expensive part, so they follow the settled request rather
  // than every intermediate one. The buttons themselves stay instant.
  //
  // Memoised, and it MUST be: `useDebounced` keys its timer on the identity of
  // what it is given, so a fresh object each render makes it re-arm on every
  // render and set new state 120ms later — which renders again. That loop
  // replaced every canvas in the grid twice a second, and a click whose
  // mousedown and mouseup straddled a replacement never fired.
  const request = useMemo(() => ({ ...variant, ...marks }), [variant, marks]);
  const settled = useDebounced(request, FILTER_SETTLE_MS);

  /**
   * Render inputs for every sticker, keyed by id.
   *
   * Deliberately built from the whole library rather than from `visible`:
   * these objects are a card's effect dependencies, so deriving them from the
   * search results would hand each card a new template on every keystroke and
   * re-render forty canvases per character typed. What a card draws does not
   * depend on what the search box says.
   */
  const inputsById = useMemo(() => {
    const byId = new Map<string, CardInputs>();
    if (!template || !stickers) return byId;

    const key = variantKey(settled.size, settled.type);
    // One object shared by every card, so a card only re-renders when the
    // marks actually change rather than on every paint.
    const marks = { barcode: settled.barcode, logo: settled.logo };

    for (const sticker of stickers) {
      byId.set(sticker.id, {
        template: resolveTemplate(template, sticker, key),
        marks,
        ...resolveLabelText(sticker, settled.size, settled.type),
        upc: upcFor(upcs, sticker, settled.size, settled.type),
      });
    }
    return byId;
  }, [stickers, template, settled, upcs]);

  /**
   * How many variants of each sticker sit in the basket. Built once for the
   * whole grid rather than scanned per card, so a forty-card grid does not do
   * forty passes over the basket on every paint.
   */
  const basketCounts = useMemo(() => {
    const counts = new Map<string, number>();
    if (!stickers) return counts;
    for (const sticker of stickers) {
      let n = 0;
      for (const size of SIZES) {
        for (const type of TYPES) {
          if (basket.has(requestKey(sticker.id, size.id, type.id))) n += 1;
        }
      }
      if (n > 0) counts.set(sticker.id, n);
    }
    return counts;
  }, [stickers, basket]);

  if (!dir) return null;

  if (empty) {
    return (
      <Empty>
        No artwork in this folder yet. Drop images straight into it — or use{' '}
        <strong>Import</strong> — and they become stickers you can render at any
        size or type, whenever they are asked for.
      </Empty>
    );
  }

  if (visible.length === 0) {
    return <Empty>No art names match “{search.trim()}”.</Empty>;
  }

  return (
    <div className="sticker-grid flex-1 overflow-y-auto">
      {visible.map((sticker) => {
        const inputs = inputsById.get(sticker.id);
        if (!inputs) return null;
        return (
          <StickerCard
            key={sticker.id}
            sticker={sticker}
            dir={dir}
            template={inputs.template}
            artName={inputs.artName}
            subtitle={inputs.subtitle}
            marks={inputs.marks}
            upc={inputs.upc}
            selected={selected.has(sticker.id)}
            basketCount={basketCounts.get(sticker.id) ?? 0}
            onSelect={(id, shift) => clickSticker(id, visibleIds, shift)}
            onOpen={(id) =>
              openDetail({ stickerId: id, size: settled.size, type: settled.type, from: 'grid' })
            }
          />
        );
      })}
    </div>
  );
}

interface CardInputs {
  template: LabelTemplate;
  marks: Marks;
  artName: string;
  subtitle: string;
  upc: string | null;
}

function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="grid flex-1 place-items-center p-10 text-center text-sm text-[var(--color-ink-3)]">
      <p className="max-w-sm">{children}</p>
    </div>
  );
}

/**
 * The value, `ms` after it last changed.
 *
 * Compares by IDENTITY. Anything passed here has to be stable between renders
 * — a store object, or something memoised — or it re-arms forever.
 */
function useDebounced<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return settled;
}
