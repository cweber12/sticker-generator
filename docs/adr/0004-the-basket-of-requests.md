# ADR-0004 — The basket of requests

Date: 2026-09-09
Status: Accepted
Amends `docs/v2-plan.md` §8, which listed per-card filter pinning as a non-goal

## Context

`docs/v2-plan.md` §5 drew one global filter bar over a grid of stickers, and §8
ruled out "per-card filter pinning" as scope that two users would not need.

Using it exposed the cost. The bar describes one variant, and selection was a
`Set<stickerId>`, so a download could only ever be **N stickers × one variant**:

```ts
const requests = chosen.map((sticker) => ({
  stickerId: sticker.id, size: filters.size, type: filters.type, ...
}));
```

Two things follow that the actual work needs and that shape cannot express:

- One order asks for different stickers at different sizes and types.
- One order asks for the same artwork at more than one size or type.

The second is the same defect as the first — it is just the case where two
requests happen to share a sticker. Both were worked around by downloading
once per variant and merging the ZIPs by hand.

Note that `CONTEXT.md` had described the right model all along: "**Sticker
Request** — a sticker plus a size, a type, and the mark toggles. A download is
a list of these." The domain language was correct; the selection state had
collapsed it into a cross product.

## Decision

Selection splits into two collections, and the download reads the second:

- **Selection** — the stickers ticked in the grid. Staging only.
- **Basket** — a set of `Sticker × Variant`, keyed `file|size|type`.

**Add** turns Selection × the bar's current Variant into basket entries, and
does not clear the Selection, so adding the same stickers at a second variant
is one more click. Add is a union: adding an entry already present is a no-op.

**Marks belong to the download, not to a request.** The bar's barcode and logo
toggles apply to everything in the basket when it is rendered.

## Considered options

**Per-card filter pinning** — one pinned variant per card. Solves different
stickers at different variants, but not the same sticker at two variants, since
a card holds one pin. It is also a new concept; the basket is one the glossary
already had.

**A multi-select variant matrix in the bar** — tick several variants, add them
all at once. Saves a click, but the bar also decides what every card is drawn
as, and with two variants ticked a card has no single preview. It would need a
second "preview as" control duplicating the first.

**Marks on the request** (key `file|size|type|barcode|logo`) — rejected because
`stickerFilename()` is `ArtName_DAK_16x20.pdf`: size and type are in the name,
marks are not. Two requests differing only by marks produce the same filename,
and `uniqueFilename` would append `-2` to a distinction the client cannot see.

**Marks on the sticker** — would have given `Sticker.defaultMarks` a purpose.
Rejected because it makes "no barcodes for this client" twenty edits instead of
one toggle, and no order has ever needed two stickers in one batch to differ.

## Consequences

- `Sticker.defaultMarks` is deleted. It was written on adoption and persisted,
  and no render path ever read it — the model promised per-sticker marks that
  nothing delivered. Keeping the field while deciding against the feature would
  leave the same lie in place.
- Two requests at the same variant are byte-identical PDFs, so the basket being
  a set is not a convenience — a duplicate has no meaning in this domain and
  the model should not be able to express one.
- Counts stop being one number. "7 stickers · 9 PDFs" — the second is what
  lands in the ZIP.
- Download moves into the basket panel, so opening the basket is how you review
  it. The grid no longer shows the order and cannot be the review surface.
- After a download, entries that rendered leave the basket and entries that
  failed stay, so a missing master costs one more Download press rather than a
  re-assembled order. This requires the archive to report which *requests*
  succeeded rather than a display label.
- Widening `Variant` to include marks was rejected partly because `VariantKey`
  is persisted — `variantOverrides` in `stickers.json` is keyed `"16x20|DAK"`,
  and folding marks in would 4x that keyspace and change the meaning of data
  already on disk.
