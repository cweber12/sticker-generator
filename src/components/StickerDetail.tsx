import { useEffect, useMemo } from 'react';
import { getSize, getType, variantKey } from '@/config/variants';
import { presentStickers, useAppStore } from '@/store/useAppStore';
import { resolveLabelText, resolveTemplate, upcFor } from '@/types';
import { useStickerRender } from './useStickerRender';

/**
 * One sticker, full size, at one specific variant.
 *
 * It carries the variant it was opened with rather than reading the request
 * bar, because a basket row opens at the variant that row is for and the grid
 * must not follow it there. The arrows walk whichever list it came from — the
 * basket entries, or the visible grid — so proofing an order is one open and
 * a run of arrow presses.
 *
 * Read-only for now. The label editor is the next slice and lands as a toggle
 * in this same surface, because finding a problem in a proof and fixing it are
 * the same moment.
 */

/** 600x900px at 300 dpi. Crisp on a retina display without a 1200px canvas. */
const DETAIL_SCALE = 0.5;

const CANVAS_CLASS = 'block h-full w-auto max-w-full rounded shadow-lg';

export default function StickerDetail() {
  const detail = useAppStore((s) => s.detail);
  const closeDetail = useAppStore((s) => s.closeDetail);
  const stepDetail = useAppStore((s) => s.stepDetail);

  useEffect(() => {
    if (!detail) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeDetail();
      else if (event.key === 'ArrowRight') stepDetail(1);
      else if (event.key === 'ArrowLeft') stepDetail(-1);
      else return;
      event.preventDefault();
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [detail, closeDetail, stepDetail]);

  if (!detail) return null;
  return <Overlay />;
}

function Overlay() {
  const detail = useAppStore((s) => s.detail)!;
  const dir = useAppStore((s) => s.dir);
  const library = useAppStore((s) => s.library);
  const template = useAppStore((s) => s.library?.template);
  const files = useAppStore((s) => s.files);
  const marks = useAppStore((s) => s.marks);
  const upcs = useAppStore((s) => s.upcs);
  const closeDetail = useAppStore((s) => s.closeDetail);
  const stepDetail = useAppStore((s) => s.stepDetail);

  const sticker = useMemo(
    () => presentStickers(library, files).find((s) => s.id === detail.stickerId) ?? null,
    [library, files, detail.stickerId],
  );

  const inputs = useMemo(() => {
    if (!template || !sticker) return null;
    return {
      template: resolveTemplate(template, sticker, variantKey(detail.size, detail.type)),
      ...resolveLabelText(sticker, detail.size, detail.type),
      upc: upcFor(upcs, sticker, detail.size, detail.type),
    };
  }, [template, sticker, detail.size, detail.type, upcs]);

  const variantLabel = `${getSize(detail.size)?.id ?? detail.size} ${
    getType(detail.type)?.label ?? detail.type
  }`;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${inputs?.artName ?? detail.stickerId} — ${variantLabel}`}
      // Clicking the surround closes, which is what everyone tries first.
      onClick={closeDetail}
      className="fixed inset-0 z-50 flex flex-col bg-black/70 p-4 backdrop-blur-sm"
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="mx-auto flex min-h-0 w-full max-w-4xl flex-1 flex-col gap-3"
      >
        <header className="flex items-center gap-3 text-white">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold">
              {inputs?.artName ?? detail.stickerId}
            </h2>
            <p className="text-xs text-white/70">{variantLabel}</p>
          </div>
          <button
            type="button"
            onClick={closeDetail}
            aria-label="Close"
            className="ml-auto rounded px-2 py-1 text-sm text-white/80 hover:bg-white/10 hover:text-white"
          >
            Close ✕
          </button>
        </header>

        <div className="flex min-h-0 flex-1 items-center gap-3">
          <Arrow direction={-1} onClick={() => stepDetail(-1)} />
          <div className="flex h-full min-w-0 flex-1 items-center justify-center">
            {dir && inputs && sticker ? (
              <Canvas
                dir={dir}
                masterFile={sticker.masterFile}
                template={inputs.template}
                artName={inputs.artName}
                subtitle={inputs.subtitle}
                upc={inputs.upc}
                marks={marks}
              />
            ) : (
              <p className="rounded bg-white/10 px-4 py-3 text-sm text-white/80">
                {/* ADR-0003: a file can be briefly missing while the sync
                    client writes it, so this is a state, not an error. */}
                This artwork is not in the folder right now.
              </p>
            )}
          </div>
          <Arrow direction={1} onClick={() => stepDetail(1)} />
        </div>

        <p className="text-center text-xs text-white/60">
          {detail.from === 'basket' ? 'Walking the basket' : 'Walking the grid'} · ← → to move ·
          Esc to close
        </p>
      </div>
    </div>
  );
}

function Canvas(props: {
  dir: FileSystemDirectoryHandle;
  masterFile: string;
  template: ReturnType<typeof resolveTemplate>;
  artName: string;
  subtitle: string;
  upc: string | null;
  marks: { barcode: boolean; logo: boolean };
}) {
  const { hostRef, phase } = useStickerRender({
    dir: props.dir,
    masterFile: props.masterFile,
    template: props.template,
    artName: props.artName,
    subtitle: props.subtitle,
    marks: props.marks,
    upc: props.upc,
    scale: DETAIL_SCALE,
    canvasClassName: CANVAS_CLASS,
  });

  return (
    <div className="relative flex h-full items-center justify-center">
      <div ref={hostRef} className="flex h-full items-center justify-center" />
      {phase === 'blank' && (
        <span className="absolute text-sm text-white/70">Rendering…</span>
      )}
      {phase === 'failed' && (
        <span className="absolute rounded bg-red-900/80 px-3 py-2 text-sm text-white">
          This one could not be rendered.
        </span>
      )}
    </div>
  );
}

function Arrow({ direction, onClick }: { direction: 1 | -1; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={direction === 1 ? 'Next' : 'Previous'}
      className="shrink-0 rounded-full bg-white/10 px-3 py-6 text-xl leading-none text-white/80 hover:bg-white/20 hover:text-white"
    >
      {direction === 1 ? '›' : '‹'}
    </button>
  );
}
