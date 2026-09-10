# Slice B — Maximize and the basket column: retrospective

**Not a plan.** This shipped in PR #28 alongside Slice A. It is recorded here
because `docs/plans/` had `slice-a-basket.md` and nothing for the work that
followed it, and Slice A's plan repeatedly deferred decisions "until Slice B".

**Shipped:** `ca25c0f` maximize · `ddf54f2` basket column · `0bc7cc3` grid
re-render fix.

## What it added

- **`components/StickerDetail.tsx`** — one sticker, full size, at **one
  specific variant**. Read-only.
- **`components/useStickerRender.ts`** — the render effect the card, the basket
  column and the maximized view all share.
- **`components/BasketPanel.tsx`** — the order beside the grid, with a preview
  per row, and the download.
- The card's **two click targets**: image maximizes, checkbox ticks.

## The decisions worth remembering

**The detail view carries its variant; it does not read the request bar.**
A basket row is a `Sticker × Variant`, so opening one has to show *that*
variant. Had the overlay read the bar instead, opening a basket row would
either show the wrong proof or drag the whole grid to a new variant behind it.
So `DetailTarget` holds `{ stickerId, size, type, from }` and the bar is not
consulted. This is the same reasoning as ADR-0004: the request is the unit, not
the sticker.

**`from` decides what ← → walk.** From the basket, the arrows walk the entries
in the order the ZIP will hold them, so one pass proofs the whole order — which
is the actual reason the view exists. From the grid, they walk what the search
box currently admits, at the bar's variant. One overlay, two lists, no modes.

**Three surfaces, still one render path.** The rule in
`.github/copilot-instructions.md` was already "one render path, `scale` is the
only difference". A third consumer is what forced the effect out of
`StickerCard` and into a hook — extracted at two consumers, not anticipated at
one. It stays in `components/` because it is a React effect over
`renderSticker`, and nothing outside `components/` calls it.

**Selection had to become a real checkbox.** Slice A deliberately left the card
as a `<button>` that selects, with only a *visual* tick inside it, and said the
move to an `<input>` happens "in Slice B, when image-click has something to
open". That is exactly how it went: two actions need two targets.

## The bug worth remembering

`useDebounced` keys its timer on **identity**, and `StickerGrid` handed it a
fresh `{ ...variant, ...marks }` every render. Any re-render — ticking one card
was enough — started a loop: new object → effect re-arms → 120ms later it sets
state → renders → new object. Every canvas in the grid was torn down and
redrawn twice a second.

It surfaced as *"clicking an image to zoom only works about half the time"* —
a click whose mousedown and mouseup straddled a canvas replacement never fired.
Worth remembering because the symptom pointed at the new feature and the cause
was a pre-existing latent bug in the grid that only became reachable once
something depended on the canvas surviving a click.

Fix: memoise the value. The regression test asserts the grid **settles** —
after a re-render and five turns of the debounce a card must have been handed
exactly one template. It had been handed six.

## Left undone

The **editor**. The maximized view proves a variant; it does not change one.
The editor lands as a toggle inside this same surface — see `docs/v2-plan.md`
§5 and step 4 of the build order.
