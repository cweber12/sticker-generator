# Slice C — Contained artwork and the frame: design

**Status:** design settled, not yet planned task-by-task.

**Goal:** Let a sticker whose master already carries its own title text be
rendered *whole* — nothing cropped, nothing overlaid — sitting on a background
colour drawn from the artwork itself, with the label strip below it.

**Architecture:** A second **Fit**. `cover` is today's behaviour and stays the
default. `contain` shrinks the master to fit above the label strip and fills
the remainder with a **Background**. Both fits are computed by one pure
function so the renderer keeps its single, unbranched drawing path.

---

## Decisions

### 1. Fit is per-sticker, cover stays the default

`LabelTemplate` gains `fit: 'cover' | 'contain'`, defaulting to `'cover'`.
A sticker opts in via `overrides.fit = 'contain'`.

*Rejected:* flipping the global default (most masters are fine full-bleed);
deleting cover (art designed to bleed still needs it); auto-detecting from
aspect ratio (the layout would silently change when a master is re-exported).

### 2. The label keeps a fixed width; the image shrinks to equal gaps

The three vertical gaps — sticker top → image, image → label, label → sticker
bottom — are **equal**, and the value is *derived*, not configured:

```
fp        = template.framePaddingIn            (new, default 0.25″)
labelW    = 4″ − 2·fp                          labelX = fp
maxImageH = 6″ − 3·fp − labelH
imageH    = min(maxImageH, labelW / masterAspect)
g         = (6″ − labelH − imageH) / 3         ← always ≥ fp
imageY    = g          labelY = 6″ − g − labelH
imageX    = (4″ − imageW) / 2                  ← centred
```

The image is never wider than the label. At aspect ≈ 0.75 it is exactly the
label width and the edges align; taller masters come out narrower and centred,
which is accepted.

**Side margins stay at `fp` and are therefore smaller than the gaps.** This is
not an oversight: requiring all four margins to be equal is algebraically
unsolvable at these proportions — solving it for a 10×12 master converges on a
1.05″ margin, which would leave a postage stamp of artwork. `framePaddingIn`
is a new field rather than a reuse of `labelInsetIn` because 0.153″ was tuned
for a strip floating *over* artwork, not for a frame around it.

*Rejected:* anchoring the label to the image's rendered width (the label would
resize per sticker); growing `labelHeightIn` to absorb the slack (the label
must not change size); capping the gap and top-biasing the image (breaks the
equal-gap rule precisely in the cases you cannot foresee).

Masters are all portrait (8×10, 10×12, 16×20), so no special case is written
for landscape. The rule degrades gracefully to aspect ≈ 1.17 regardless.

### 3. Background is `'auto' | '#rrggbb'`, and `'auto'` is never persisted

`LabelTemplate` gains `background: 'auto' | string`, defaulting to `'auto'`.
`'auto'` samples the **median of the master's outermost pixel ring** — the
background is a mat around the image, so continuity with the image's own edge
is what reads as cohesive. The picker writes a hex into `overrides.background`;
clearing it deletes the key and auto returns.

*Rejected:* persisting the sampled hex on first render (a chosen colour would
be indistinguishable from a sampled one, improving the sampler would never
reach existing stickers, and every first render would dirty the file the sync
client watches); a whole-image dominant colour (on a tarot card that is the sky
blue, not the mat); a desaturated average (mud).

### 4. The label strip stays white

bwip-js is called without `backgroundcolor`, so the barcode composites
transparent and takes its quiet zone from the strip beneath it. Both product
types default `barcode: true`. Tinting the strip would require a white plate
behind the barcode — putting the white rectangle back in the one place it looks
accidental.

### 5. Controls live in the detail overlay only

A Cover/Contain toggle and a colour swatch, below the full-size proof, which
updates live. Background controls appear only when fit is `contain`. Arrow keys
already walk the grid, so a run of stickers is toggle → `→` → toggle without
closing. No bulk path.

### 6. Live preview on `input`, write on `change`

`<input type="color">` fires `input` throughout a drag and `change` on release.
`input` → store (proof redraws); `change` → `writeLibrary`. One write per
decision, no debounce timer, and the sync client sees one change per edit.
This is the first override write path in the app.

---

## File structure

**Create**

- `src/render/background.ts` — `pickBackgroundColor(data, w, h): string`, pure.
  Border ring = the 1px outer ring of a 64×64 downscale (252 samples), median
  per channel. Plus `autoBackgroundFor(bitmap)`, memoised in a `WeakMap` keyed
  on the `ImageBitmap` — masters are already cached per filename, so the key is
  stable and the sample runs once per master per session.
- `src/render/background.test.ts`
- `docs/adr/0005-contained-artwork-and-the-frame.md`

**Modify**

- `src/render/slots.ts` — rename `computeLabelGeometry` → `computeStickerGeometry`,
  take `imageW`/`imageH`, return `image: {sx,sy,sw,sh,dx,dy,dw,dh}`. Cover
  yields a cropped src onto the full canvas; contain a full src onto an inset
  dst. `drawCover`'s math moves here and becomes tested for the first time.
- `src/render/renderSticker.ts` — delete `drawCover` and the fit branch. The
  renderer becomes `fillRect(background)` → one `drawImage(...geom.image)` →
  strip → marks → text.
- `src/config/template.ts` — add `fit`, `background`, `framePaddingIn`; add
  `framePaddingIn` to `TEMPLATE_FIELDS` (numeric, so no field-kind discriminant
  is needed — `fit` and `background` are detail-view controls, not editor rows).
- `src/store/useAppStore.ts` — `setOverride(stickerId, patch)` (in-memory merge;
  `undefined` deletes the key) and `persistLibrary()`.
- `src/components/StickerDetail.tsx` — the control strip.
- `src/components/useStickerRender.ts` — pass the master's dimensions through to
  the renamed geometry call it makes for `overflow`.
- `CONTEXT.md` — **Fit** and **Background** in the Language section.

`src/lib/zip.ts` needs **no** change: it already goes `loadMasterImage` →
`renderSticker`, so the export picks up both the fit and the background with no
new plumbing, and preview and PDF cannot disagree.

---

## Notes for implementation

- `geometryOnly()` in `src/types/index.ts` copies everything except `artName`
  and `subtitle`, so `fit` and `background` flow through `resolveTemplate`
  unchanged. Write them to `sticker.overrides`, not `variantOverrides` — they
  are properties of the artwork, not of a size × type pair.
- Integer rounding: compute `g` once and use it for both `imageY` and `labelY`
  so the top and bottom gaps are exact; the middle gap absorbs a ≤2px remainder
  (0.007″, invisible).
- Background is painted in both fits. In cover it is only ever visible behind a
  master with transparency, which is harmless.
- `labelInsetIn` is unused in contain mode; `framePaddingIn` is unused in cover.

## Open, deliberately

The template editor still does not exist — `TEMPLATE_FIELDS` remains unconsumed
after this slice. `framePaddingIn` is tunable only by editing `stickers.json`
until that lands.
