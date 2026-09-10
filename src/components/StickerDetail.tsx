import { useEffect, useMemo, useRef, useState } from 'react';
import { AUTO_BACKGROUND, type Fit } from '@/config/template';
import { getSize, getType, variantKey } from '@/config/variants';
import { loadMasterImage } from '@/fs/library';
import { resolveBackground } from '@/render/background';
import { presentStickers, useAppStore } from '@/store/useAppStore';
import type { LabelOverride } from '@/types';
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
 * The fit and background controls live here rather than on the card or in a
 * global panel because finding a problem in a proof and fixing it are the same
 * moment — and because a colour is only judgeable against the artwork it sits
 * behind, at a size you can actually see.
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
  const setOverride = useAppStore((s) => s.setOverride);
  const persistLibrary = useAppStore((s) => s.persistLibrary);

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

  const masterFile = sticker?.masterFile;
  const background = inputs?.template.background;

  /**
   * The colour actually on the canvas right now, so the picker opens on it
   * rather than on white. Resolved through the same function the renderer
   * uses, against the same cached bitmap, so the swatch cannot lie.
   */
  const [shown, setShown] = useState<string | null>(null);

  useEffect(() => {
    if (!dir || !masterFile || background === undefined) return;
    let cancelled = false;

    void loadMasterImage(dir, masterFile)
      .then((master) => {
        if (!cancelled) setShown(resolveBackground(background, master.source));
      })
      .catch(() => {
        // A master that is mid-sync is a state, not an error (ADR-0003). The
        // canvas below says so already; the swatch just stays put.
        if (!cancelled) setShown(null);
      });

    return () => {
      cancelled = true;
    };
  }, [dir, masterFile, background]);

  /** `commit` is what separates dragging a picker from deciding on a colour. */
  const patch = (change: LabelOverride, commit: boolean) => {
    if (!sticker) return;
    setOverride(sticker.id, change);
    if (commit) void persistLibrary();
  };

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

        {inputs && sticker && (
          <Controls
            fit={inputs.template.fit}
            background={inputs.template.background}
            shown={shown}
            onFit={(fit) => patch({ fit }, true)}
            onColourMove={(hex) => patch({ background: hex }, false)}
            onColourSettled={(hex) => patch({ background: hex }, true)}
            onAuto={() => patch({ background: undefined }, true)}
          />
        )}

        <p className="text-center text-xs text-white/60">
          {detail.from === 'basket' ? 'Walking the basket' : 'Walking the grid'} · ← → to move ·
          Esc to close
        </p>
      </div>
    </div>
  );
}

interface ControlsProps {
  fit: Fit;
  /** The resolved setting: AUTO_BACKGROUND, or the hex someone chose. */
  background: string;
  /** The colour on the canvas, once the master has been sampled. */
  shown: string | null;
  onFit: (fit: Fit) => void;
  onColourMove: (hex: string) => void;
  onColourSettled: (hex: string) => void;
  onAuto: () => void;
}

function Controls(props: ControlsProps) {
  const { fit, background, shown, onFit, onColourMove, onColourSettled, onAuto } = props;
  const isAuto = background === AUTO_BACKGROUND;

  return (
    <div className="mx-auto flex flex-wrap items-center justify-center gap-x-5 gap-y-2 rounded-lg bg-white/5 px-4 py-2 text-xs text-white/80">
      <div className="flex items-center gap-2">
        <span className="text-white/50">Fit</span>
        <div className="flex overflow-hidden rounded border border-white/20">
          {(['cover', 'contain'] as const).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={fit === option}
              onClick={() => fit !== option && onFit(option)}
              className={
                fit === option
                  ? 'bg-white px-3 py-1 font-medium text-black'
                  : 'px-3 py-1 hover:bg-white/10'
              }
            >
              {option === 'cover' ? 'Cover' : 'Contain'}
            </button>
          ))}
        </div>
      </div>

      {/* Hidden under cover, where the artwork bleeds over every pixel of it. */}
      {fit === 'contain' && (
        <div className="flex items-center gap-2">
          <span className="text-white/50">Background</span>
          <ColourInput value={shown} onMove={onColourMove} onSettle={onColourSettled} />
          <span className="font-mono text-white/60">{isAuto ? 'Auto' : (shown ?? background)}</span>
          {!isAuto && (
            <button
              type="button"
              onClick={onAuto}
              className="rounded border border-white/20 px-2 py-1 hover:bg-white/10"
            >
              Reset to auto
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * The colour picker, split across two events on purpose.
 *
 * React's `onChange` on an input is the native `input` event, which a colour
 * picker fires continuously while it is dragged — that is the live proof. The
 * native `change` event fires once, when the picker is dismissed, and that is
 * the decision worth writing to a folder a sync client is watching. React does
 * not surface the latter, hence the listener.
 */
function ColourInput(props: {
  value: string | null;
  onMove: (hex: string) => void;
  onSettle: (hex: string) => void;
}) {
  const { value, onMove, onSettle } = props;
  const ref = useRef<HTMLInputElement>(null);

  // Through a ref so the listener is attached once rather than on every drag.
  const settle = useRef(onSettle);
  useEffect(() => {
    settle.current = onSettle;
  }, [onSettle]);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const onChange = () => settle.current(element.value);
    element.addEventListener('change', onChange);
    return () => element.removeEventListener('change', onChange);
  }, []);

  return (
    <input
      ref={ref}
      type="color"
      aria-label="Background colour"
      disabled={value === null}
      value={value ?? '#ffffff'}
      onChange={(event) => onMove(event.target.value)}
      className="h-7 w-10 cursor-pointer rounded border border-white/20 bg-transparent p-0.5 disabled:cursor-not-allowed disabled:opacity-40"
    />
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
