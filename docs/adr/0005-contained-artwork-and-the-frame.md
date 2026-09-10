# ADR-0005 — Contained artwork and the frame

Date: 2026-09-10
Status: Accepted
Amends nothing; `docs/v2-plan.md` assumed one way of filling the sticker

## Context

Every sticker was drawn one way: the master cover-cropped to fill all 4×6, with
the white label strip floating on top of the artwork, inset from all four edges.

That is correct for art designed to bleed. It is wrong for a master that
carries its own title text — a tarot card, say — in two compounding ways:

- **Cropping eats the text.** A 10×12-shaped master (aspect 0.833) cropped to
  4×6 (0.667) loses ~20% off the sides, which is exactly where a card's border
  and title sit.
- **The label lands on the artwork.** Even uncropped, a strip inset from the
  bottom edge covers the bottom of the image.

The workaround was to pre-pad the master in an image editor so that its baked-in
margin happened to survive the crop — which makes the sticker's layout a
property of a PNG nobody can adjust afterwards.

## Decision

### 1. A second Fit, chosen per sticker

`LabelTemplate.fit` is `'cover' | 'contain'`, defaulting to `'cover'`. A sticker
opts in with `overrides.fit = 'contain'`. Nothing already proofed changes.

Under `contain` the whole master shows, the label sits below it, and a
**Background** fills the rest.

### 2. The three vertical gaps are equal, and derived

The label keeps a fixed width. The image shrinks until the space above it, the
space between it and the label, and the space below the label are all equal:

```
fp        = framePaddingIn                     (new field, default 0.25″)
labelW    = 4″ − 2·fp                          labelX = fp
imageH    = min(6″ − 3·fp − labelH,  labelW / masterAspect)
gap       = (6″ − labelH − imageH) / 3         ← always ≥ fp
imageY    = gap        labelY = 6″ − gap − labelH
```

`framePaddingIn` is therefore the **side margin and the gap's floor, never the
gap itself**. It is a new field rather than a reuse of `labelInsetIn` because
0.153″ was tuned for a strip floating over artwork, not for a frame around it.

**The side margins are deliberately smaller than the vertical gaps.** This looks
like an oversight and is not. Requiring all four to be equal is not merely
unattractive — it is unsolvable at these proportions. Setting the sides equal to
the gap and solving for a 10×12 master:

```
imageW = 4 − 2g,  imageH = (4 − 2g)/0.833 = 4.802 − 2.401g
6 = 3g + imageH + 0.57
6 = 0.599g + 5.372   →   g = 1.048″
```

A 1.05″ margin on a 4″ sticker leaves a postage stamp of artwork. The rule
below is the closest thing that exists.

At aspect ≈ 0.75 the image comes out exactly the label's width and their edges
align. Taller masters come out narrower than the label and are centred, which is
accepted rather than corrected. Every master here is portrait (8×10, 10×12,
16×20), so no case is written for landscape; the rule degrades gracefully to
aspect ≈ 1.17 regardless.

Flooring the gap keeps the top and bottom exact and lets the middle absorb a
remainder of at most 2px — 0.007″, below what any press holds.

### 3. Background is `'auto' | '#rrggbb'`, and `'auto'` is never persisted

`LabelTemplate.background` defaults to the literal string `'auto'`, which means
*sample it*. The sampler takes the **median of the master's outermost pixel
ring**, read off a 64×64 downscale.

The background is a mat around the artwork, so what reads as cohesive is
continuity with the artwork's own edge. A tarot card is mostly sky and gold; its
mat is the tan border it already has. Median rather than mean so a signature in
a corner cannot drag the whole mat off-colour.

The picker writes a hex into `overrides.background`; clearing it deletes the key
and auto returns.

### 4. The label strip stays white under both fits

bwip-js is called without `backgroundcolor`, so the barcode composites
transparent and takes its quiet zone from the strip beneath it. Both product
types default `barcode: true`.

### 5. Artwork placement moves into `slots.ts`

Under `contain` the image and the label are coupled — the gap depends on the
fitted image height, and the label's Y depends on the gap. Both fits now return
one source rect and one destination rect, so `renderSticker` makes a single
`drawImage` call and contains no branch on fit at all.

## Considered options

**Anchor the label to the image's rendered width.** Edges would always align,
including for tall masters. Rejected: the label would then resize per sticker,
and a narrow master would squeeze the text beside a fixed-width barcode.

**Grow `labelHeightIn` to absorb the slack so the gap stays at `fp`.** For a
10×12 master that means a 1.106″ label. Rejected: the label must not change size
between stickers in one order, and every font and mark position is laid out
against `labelHeightIn`.

**Cap the gap and top-bias the image past the cap.** Rejected: it breaks the
equal-gap rule precisely in the cases you cannot foresee, and adds a constant
nobody can justify later.

**Auto-detect the fit from the master's aspect.** Zero clicks for a whole deck.
Rejected: the layout would silently change when a master is re-exported at a
different aspect, and the change would be unexplainable from the UI.

**Persist the sampled hex on first render.** Rejected on three counts: a chosen
colour becomes indistinguishable from a sampled one; improving the sampler would
never reach existing stickers; and every first render would dirty the file the
sync client watches.

**A whole-image dominant colour, or a desaturated average.** Rejected: on a
tarot card the dominant colour is the sky blue behind the sun, and the average
is mud. Neither is the mat.

**Tint the label strip to match the background.** Rejected: the barcode would
need a white plate behind it, which puts the white rectangle back in the one
place it looks accidental rather than designed.

## Consequences

- `labelInsetIn` is unused under `contain`; `framePaddingIn` is unused under
  `cover`. A template editor will need to say so.
- The gap is not directly settable. Someone who wants more air sets
  `framePaddingIn`, which only raises the floor — under a width-limited master
  the gap stays derived.
- `mergeTemplate` had to stop assuming every template key is a number, or it
  would have discarded `fit` and `background` on every read.
- The cover-crop maths is unit-tested for the first time, as a side effect of
  moving it into the pure module.
