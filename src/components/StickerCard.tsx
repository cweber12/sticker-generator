import type { LabelTemplate } from '@/config/template';
import type { Marks } from '@/render/slots';
import type { Sticker } from '@/types';
import { useStickerRender } from './useStickerRender';

/**
 * One card in the grid: a miniature of exactly what would be exported.
 *
 * Two targets, because the card carries two different actions. The checkbox
 * ticks the sticker into the Selection; the image opens it full size. The card
 * is 2:3 and a sticker is 4x6 — also 2:3 — so the preview fills the card and
 * there is no third region to click. That is why the checkbox has to be its
 * own control rather than "anywhere else on the card".
 */

/** Roughly card-sized at 300 dpi, so the browser scales down rather than up. */
const PREVIEW_SCALE = 0.2;

const CANVAS_CLASS = 'block h-full w-auto max-w-full rounded';

export interface StickerCardProps {
  sticker: Sticker;
  dir: FileSystemDirectoryHandle;
  template: LabelTemplate;
  artName: string;
  subtitle: string;
  marks: Marks;
  upc: string | null;
  selected: boolean;
  /** How many variants of this sticker are in the basket. 0 hides the chip. */
  basketCount: number;
  onSelect: (id: string, shift: boolean) => void;
  onOpen: (id: string) => void;
}

export default function StickerCard(props: StickerCardProps) {
  const {
    sticker,
    dir,
    template,
    artName,
    subtitle,
    marks,
    upc,
    selected,
    basketCount,
    onSelect,
    onOpen,
  } = props;

  const { hostRef, phase, overflow } = useStickerRender({
    dir,
    masterFile: sticker.masterFile,
    template,
    artName,
    subtitle,
    marks,
    upc,
    scale: PREVIEW_SCALE,
    canvasClassName: CANVAS_CLASS,
  });

  return (
    <div
      className={`card group relative h-full w-full overflow-hidden ${
        selected ? 'ring-2 ring-[var(--color-accent)] ring-inset' : 'hover:border-[var(--color-ink-4)]'
      }`}
    >
      <button
        type="button"
        onClick={() => onOpen(sticker.id)}
        title={`${artName} — click to view full size`}
        className="flex h-full w-full cursor-zoom-in items-center justify-center p-2"
      >
        <span ref={hostRef} className="flex h-full items-center justify-center" />
      </button>

      {phase === 'blank' && (
        <span className="pointer-events-none absolute inset-0 grid place-items-center text-xs text-[var(--color-ink-4)]">
          Rendering…
        </span>
      )}

      {/* Generous hit area around a small box, so ticking is easy without the
          control covering the art it sits on. */}
      <label
        title={selected ? 'Ticked — shift-click to fill a range' : 'Tick this sticker'}
        className="absolute top-0 left-0 grid h-8 w-8 cursor-pointer place-items-center"
      >
        <input
          type="checkbox"
          checked={selected}
          onClick={(event) => onSelect(sticker.id, event.shiftKey)}
          onChange={() => undefined}
          aria-label={`Select ${artName || sticker.masterFile}`}
          className="h-[18px] w-[18px] accent-[var(--color-accent)]"
        />
      </label>

      <span className="pointer-events-none absolute top-8 left-1.5 flex flex-col items-start gap-1">
        {phase === 'failed' && <Badge tone="bad">Render failed</Badge>}
        {/* A missing UPC is a fact about the lookup, not about this render. */}
        {phase !== 'failed' && marks.barcode && !upc && <Badge tone="warn">No UPC</Badge>}
        {phase === 'ready' && overflow && <Badge tone="warn">Label overflows</Badge>}
      </span>

      {/* Answers "have I dealt with this one?" while scanning the grid. Which
          variants is the basket panel's question, not the card's. */}
      {basketCount > 0 && (
        <span
          title={`In the basket at ${basketCount} variant${basketCount === 1 ? '' : 's'}`}
          className="pointer-events-none absolute top-1.5 right-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-[var(--color-ink-2)] px-1 text-[11px] leading-none font-bold text-white"
        >
          {basketCount}
        </span>
      )}

      {/* On hover only: at rest this sits exactly over the sticker's own label
          strip, which is the part of the preview worth looking at. */}
      <span className="pointer-events-none absolute right-0 bottom-0 left-0 truncate bg-white/90 px-2 py-1 text-[11px] text-[var(--color-ink-2)] opacity-0 transition-opacity group-hover:opacity-100">
        {artName || sticker.masterFile}
      </span>
    </div>
  );
}

function Badge({ tone, children }: { tone: 'warn' | 'bad'; children: string }) {
  const palette =
    tone === 'bad'
      ? 'border-red-300 bg-red-50 text-red-900'
      : 'border-[var(--color-amber)] bg-amber-50 text-[var(--color-ink-2)]';
  return (
    <span className={`rounded border px-1.5 py-0.5 text-[10px] leading-none ${palette}`}>
      {children}
    </span>
  );
}
