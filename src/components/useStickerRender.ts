import { useEffect, useRef, useState } from 'react';
import type { LabelTemplate } from '@/config/template';
import { loadMasterImage } from '@/fs/library';
import { computeLabelGeometry, type Marks } from '@/render/slots';
import { loadDiamondLogo, renderSticker } from '@/render/renderSticker';

/**
 * One render path, three places that show a sticker.
 *
 * The grid card, the basket column and the maximized view all draw through
 * `renderSticker` at different `scale`s rather than through any drawing code
 * of their own, so none of them can drift away from the PDF — or from each
 * other. Extracted the moment there was a second consumer.
 */

/**
 * 'blank' only until the first canvas lands. A re-render on a variant change
 * keeps the previous one on screen instead of flashing back to a placeholder,
 * so changing the variant reads as an update rather than a reload.
 */
export type RenderPhase = 'blank' | 'ready' | 'failed';

export interface StickerRenderInput {
  /** Null while no folder is open. The hook simply does not draw. */
  dir: FileSystemDirectoryHandle | null;
  masterFile: string;
  template: LabelTemplate;
  artName: string;
  subtitle: string;
  marks: Marks;
  upc: string | null;
  /** 0.2 is card-sized at 300 dpi; the maximized view wants more. */
  scale: number;
  /** Tailwind classes put on the canvas element itself. */
  canvasClassName: string;
}

export interface StickerRenderResult {
  /** Attach to the element the canvas should live in. */
  hostRef: React.RefObject<HTMLDivElement | null>;
  phase: RenderPhase;
  /** Whether the label's text and marks do not fit. Worth badging. */
  overflow: boolean;
}

export function useStickerRender(input: StickerRenderInput): StickerRenderResult {
  const { dir, masterFile, template, artName, subtitle, marks, upc, scale, canvasClassName } =
    input;

  const hostRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<RenderPhase>('blank');
  const [overflow, setOverflow] = useState(false);

  useEffect(() => {
    if (!dir) return;
    let cancelled = false;

    void (async () => {
      try {
        const master = await loadMasterImage(dir, masterFile);
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
          scale,
        });
        if (cancelled || !hostRef.current) return;

        // Asking slots.ts rather than measuring the canvas: the mark layout has
        // exactly one implementation and this is not a second one.
        const aspect = logo && logo.height > 0 ? logo.width / logo.height : 1;
        setOverflow(computeLabelGeometry(template, marks, aspect).overflow);

        canvas.className = canvasClassName;
        hostRef.current.replaceChildren(canvas);
        setPhase('ready');
      } catch {
        if (!cancelled) setPhase('failed');
      }
    })();

    // Variants change faster than renders finish. Without this, a late render
    // from a previous variant can land on top of the current one.
    return () => {
      cancelled = true;
    };
  }, [dir, masterFile, template, artName, subtitle, marks, upc, scale, canvasClassName]);

  return { hostRef, phase, overflow };
}
