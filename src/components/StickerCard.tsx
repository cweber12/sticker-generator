import { useEffect, useRef, useState } from 'react';
import type { LabelTemplate } from '@/config/template';
import { loadMasterImage } from '@/fs/library';
import { computeLabelGeometry, type Marks } from '@/render/slots';
import { loadDiamondLogo, renderSticker } from '@/render/renderSticker';
import type { Sticker } from '@/types';

/**
 * One card in the grid: a miniature of exactly what would be exported.
 *
 * The preview goes through `renderSticker` at a small `scale` rather than
 * through any separate drawing code, so what you see here is the PDF at
 * 1/5 size and cannot drift away from it.
 */

/** Roughly card-sized at 300 dpi, so the browser scales down rather than up. */
const PREVIEW_SCALE = 0.2;

export interface StickerCardProps {
  sticker: Sticker;
  dir: FileSystemDirectoryHandle;
  template: LabelTemplate;
  artName: string;
  subtitle: string;
  marks: Marks;
  upc: string | null;
  selected: boolean;
  onSelect: (id: string, shift: boolean) => void;
}

/**
 * 'blank' only until the first canvas lands. A re-render on a filter change
 * keeps the previous one on screen instead of flashing every card back to a
 * placeholder, so toggling a filter reads as an update rather than a reload.
 */
type Phase = 'blank' | 'ready' | 'failed';

export default function StickerCard(props: StickerCardProps) {
  const { sticker, dir, template, artName, subtitle, marks, upc, selected, onSelect } = props;

  const hostRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<Phase>('blank');
  const [overflow, setOverflow] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const master = await loadMasterImage(dir, sticker.masterFile);
        const logo = marks.logo ? await loadDiamondLogo() : null;
        if (cancelled) return;

        const canvas = await renderSticker({
          image: master.source,
          imageW: master.width,
          imageH: master.height,
          artName,
          subtitle,
          upc,
          marks,
          template,
          logo,
          scale: PREVIEW_SCALE,
        });
        if (cancelled || !hostRef.current) return;

        // Asking slots.ts rather than measuring the canvas: the mark layout has
        // exactly one implementation and this is not a second one.
        const aspect = logo && logo.height > 0 ? logo.width / logo.height : 1;
        setOverflow(computeLabelGeometry(template, marks, aspect).overflow);

        canvas.className = 'block h-full w-auto max-w-full rounded';
        hostRef.current.replaceChildren(canvas);
        setPhase('ready');
      } catch {
        if (!cancelled) setPhase('failed');
      }
    })();

    // Filters change faster than renders finish. Without this, a late render
    // from a previous filter can land on top of the current one.
    return () => {
      cancelled = true;
    };
  }, [dir, sticker.masterFile, template, artName, subtitle, marks, upc]);

  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={(event) => onSelect(sticker.id, event.shiftKey)}
      title={artName}
      className={`card group relative flex h-full w-full items-center justify-center overflow-hidden p-2 text-left ${
        selected
          ? 'ring-2 ring-[var(--color-accent)] ring-inset'
          : 'hover:border-[var(--color-ink-4)]'
      }`}
    >
      <div ref={hostRef} className="flex h-full items-center justify-center" />

      {phase === 'blank' && (
        <span className="absolute inset-0 grid place-items-center text-xs text-[var(--color-ink-4)]">
          Rendering…
        </span>
      )}

      <span className="absolute top-1.5 left-1.5 flex flex-col items-start gap-1">
        {phase === 'failed' && <Badge tone="bad">Render failed</Badge>}
        {/* A missing UPC is a fact about the lookup, not about this render. */}
        {phase !== 'failed' && marks.barcode && !upc && <Badge tone="warn">No UPC</Badge>}
        {phase === 'ready' && overflow && <Badge tone="warn">Label overflows</Badge>}
      </span>

      {selected && (
        <span className="absolute top-1.5 right-1.5 grid h-5 w-5 place-items-center rounded-full bg-[var(--color-accent)] text-[11px] leading-none font-bold text-white">
          ✓
        </span>
      )}

      {/* On hover only: at rest this sits exactly over the sticker's own label
          strip, which is the part of the preview worth looking at. */}
      <span className="absolute right-0 bottom-0 left-0 truncate bg-white/90 px-2 py-1 text-[11px] text-[var(--color-ink-2)] opacity-0 transition-opacity group-hover:opacity-100">
        {artName || sticker.masterFile}
      </span>
    </button>
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
