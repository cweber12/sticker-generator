# ADR-0001 — The image is the record

Date: 2026-09-09
Status: Accepted

## Context

The predecessor app (`cweber12/sticker-maker`) modelled a sticker as a
spreadsheet row with an image attached. `StickerRow` carried `artName`, `size`,
`type`, `upc` and an `imageFile`, and the rows came from an imported Excel or
CSV file via a column mapper.

Everything expensive in that codebase followed from that one choice:

- A column mapper, to reconcile arbitrary spreadsheet headers to four fields.
- Fuzzy filename-to-art-name matching, plus an "unmatched images" tray for the
  images that failed to match.
- A `needsReview` flag and validation UI, because a row could exist without an
  image, a size or a type.
- A 19KB data table to edit rows, and a manual entry panel to create rows the
  spreadsheet lacked.

Roughly 95KB of component source existed to make two inputs — a sheet and a
folder of images — agree with each other.

Meanwhile the actual usage pattern is: the same artwork is requested repeatedly,
later, in a different size or product type. v1 had no memory of past work, so
each re-request meant reassembling the spreadsheet and re-matching the images.

## Decision

The uploaded image is the record. Size and product type are **axes of a
request**, not properties of a sticker.

- `Sticker` — persistent, one per artwork, holding the master image reference
  and label metadata. It has no size and no type.
- `StickerRequest` — ephemeral `{ stickerId, size, type, barcode, logo }`.

Metadata comes from the filename. Barcodes come from an external
`upc-lookup.csv` joined on art name + size + type. Nothing is rendered
speculatively: a sticker implies all six variants at all times, and PDFs are
produced on demand.

## Consequences

**Good**

- The matching problem disappears entirely — there are no longer two inputs to
  reconcile. Column mapper, fuzzy matcher, unmatched tray, `needsReview` and the
  manual entry path are all deleted rather than ported.
- Re-requesting past work becomes a filter over a saved library instead of a
  re-import.
- Storage is one image per artwork, not one PDF per variant, so a label or
  template change applies retroactively without re-rendering an archive.
- A single ZIP can mix configurations, because a request carries its own axes.

**Costs**

- Art names must be recoverable from filenames. Batches with unhelpful names
  need editing after upload, where v1 could lean on a spreadsheet column.
- UPCs move outside the app into a file someone maintains. Coverage gaps become
  a visible state ("no UPC") rather than a validation error, and the UI has to
  make them obvious.
- Downloads do render work that v1 did once at export time. Mitigated by
  rendering grid previews at display resolution and doing full 300 dpi work in a
  worker at download time only.

**Rejected alternatives**

- *Keep the spreadsheet as an optional input.* Retains every component the
  decision is meant to delete, in order to serve a path that the filename
  convention already covers.
- *Render and store all six variants on upload.* Makes Drive immediately
  browsable, but multiplies storage and upload time by six and leaves stale
  files behind after any label edit.
