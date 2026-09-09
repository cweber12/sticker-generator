import { useEffect, useRef, useState } from 'react';
import { DEFAULT_TEMPLATE } from '@/config/template';
import { renderSticker } from '@/render/renderSticker';
import type { Marks } from '@/render/slots';
import { ensureFontsLoaded, type FontStatus } from '@/render/fonts';
import { defaultSubtitle } from '@/config/variants';

/**
 * PHASE 1 PROOF PAGE.
 *
 * Not the product UI — this exists so the renderer can be verified before any
 * of the app is built. It draws the same artwork in all four mark combinations
 * and reports whether the label fonts actually resolved.
 *
 * Replaced by routes/NewBatch.tsx in phase 2. See docs/v2-plan.md §9.
 */

const COMBINATIONS: { label: string; marks: Marks }[] = [
  { label: 'No marks', marks: { barcode: false, logo: false } },
  { label: 'Barcode', marks: { barcode: true, logo: false } },
  { label: 'Diamond logo', marks: { barcode: false, logo: true } },
  { label: 'Both', marks: { barcode: true, logo: true } },
];

const SAMPLE_UPC = '012345678905';

export default function App() {
  const [fonts, setFonts] = useState<FontStatus | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  useEffect(() => {
    ensureFontsLoaded().then(setFonts);
  }, []);

  return (
    <div className="mx-auto max-w-[1200px] p-8">
      <header className="mb-6 border-b border-[var(--color-rule)] pb-4">
        <h1 className="text-2xl font-semibold">Sticker Generator</h1>
        <p className="text-sm text-[var(--color-ink-3)]">
          Phase 1 proof — renderer, slot math, four mark combinations.
        </p>
      </header>

      {fonts && !fonts.ok && (
        <div className="mb-6 rounded-md border border-[var(--color-amber)] bg-amber-50 p-3 text-sm">
          <strong>Label fonts are not loaded.</strong>{' '}
          {!fonts.name && <>Art-name face missing. </>}
          {!fonts.subtitle && <>Subtitle face missing. </>}
          These renders use substitute typefaces and will not match a print
          proof. See <code>public/fonts/README.md</code>.
        </div>
      )}

      <div className="grid grid-cols-2 gap-6 lg:grid-cols-4">
        {COMBINATIONS.map((c) => (
          <figure key={c.label} className="m-0">
            <ProofCanvas marks={c.marks} onWarning={(w) =>
              setWarnings((prev) => (prev.includes(w) ? prev : [...prev, w]))
            } />
            <figcaption className="mt-2 text-center text-xs text-[var(--color-ink-3)]">
              {c.label}
            </figcaption>
          </figure>
        ))}
      </div>

      {warnings.length > 0 && (
        <ul className="mt-6 space-y-1 text-xs text-[var(--color-ink-3)]">
          {warnings.map((w) => <li key={w}>· {w}</li>)}
        </ul>
      )}
    </div>
  );
}

function ProofCanvas({ marks, onWarning }: { marks: Marks; onWarning: (m: string) => void }) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const artwork = makePlaceholderArtwork();
      const logo = marks.logo ? await loadLogo() : null;

      const canvas = await renderSticker({
        image: artwork,
        imageW: artwork.width,
        imageH: artwork.height,
        artName: 'Sunset Beach',
        subtitle: defaultSubtitle('16x20', 'DAK'),
        upc: SAMPLE_UPC,
        marks,
        template: DEFAULT_TEMPLATE,
        logo,
        scale: 0.22,
        onWarning,
      });

      if (cancelled || !hostRef.current) return;
      canvas.className = 'w-full h-auto rounded border border-[var(--color-rule)]';
      hostRef.current.replaceChildren(canvas);
    })();

    return () => { cancelled = true; };
  }, [marks, onWarning]);

  return <div ref={hostRef} className="aspect-[2/3] w-full bg-white" />;
}

/** A stand-in artwork so the proof page needs no fixture file. */
function makePlaceholderArtwork(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 1200;
  c.height = 1800;
  const ctx = c.getContext('2d');
  if (!ctx) return c;
  const g = ctx.createLinearGradient(0, 0, 0, 1800);
  g.addColorStop(0, '#3a6489');
  g.addColorStop(1, '#cedeed');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1200, 1800);
  return c;
}

async function loadLogo() {
  const src = `${import.meta.env.BASE_URL}diamond-logo.png`;
  return new Promise<{ source: HTMLImageElement; width: number; height: number } | null>(
    (resolve) => {
      const img = new Image();
      img.onload = () => resolve({ source: img, width: img.width, height: img.height });
      img.onerror = () => resolve(null);
      img.src = src;
    },
  );
}
