#!/usr/bin/env bash
#
# Seeds the issue tracker for phases 0-6 of docs/v2-plan.md.
# Run once, from inside a clone with `gh` authenticated:
#
#   bash scripts/create-issues.sh
#
set -euo pipefail

mklabel() { gh label create "$1" --color "$2" --description "$3" 2>/dev/null || true; }

mklabel "needs-triage"    "ededed" "Not yet assessed"
mklabel "needs-info"      "d4c5f9" "Blocked on a question"
mklabel "ready-for-agent" "0e8a16" "Scoped enough for an agent to pick up"
mklabel "ready-for-human" "fbca04" "Needs a human decision or credentials"
mklabel "wontfix"         "ffffff" "Will not be worked on"
mklabel "phase-0"         "b60205" "Blocking spike"
mklabel "phase-2"         "1d76db" "MVP: upload to ZIP"
mklabel "phase-3"         "1d76db" "Drive + catalog"
mklabel "phase-4"         "1d76db" "UPC lookup"
mklabel "phase-5"         "1d76db" "Editor"
mklabel "phase-6"         "1d76db" "Polish"

new() { # new <labels> <title> <body>
  gh issue create --label "$1" --title "$2" --body "$3"
}

# ── Phase 0 — blocking spikes ───────────────────────────────────────────────

new "phase-0,ready-for-human" \
"Decide the label font licensing before building on these faces" \
"$(cat <<'BODY'
The sticker label uses two faces (v1: Baskerville Display PT, Tw Cen MT).
v1 referenced them in \`ctx.font\` with **no \`@font-face\` rule anywhere** —
canvas silently substitutes a missing font, so stickers only rendered correctly
on a machine with the fonts installed locally. With a shared team account that
means two people can export the same batch and get different typography, with
no warning, while the app claims exact font fidelity as its reason for
rasterizing the PDF.

v2 self-hosts them (\`src/styles/fonts.css\`) and verifies by measurement that
the intended face is really in use (\`src/render/fonts.ts\`).

**The open question is licensing, not code.** Desktop font licenses commonly
exclude webfont embedding, which is exactly what \`@font-face\` is.

Decide one of:
1. License a webfont version of each face.
2. Substitute web-embeddable lookalikes and re-approve a printed proof.
3. Move rendering server-side where a desktop license may apply.

**Acceptance:** decision recorded as an ADR in \`docs/adr/\`, and either the
\`.woff2\` files are available to the deploy or a substitute pair is chosen.

See \`public/fonts/README.md\`.
BODY
)"

new "phase-0,ready-for-human" \
"Spike: prove drive.file + Google Picker from the deployed origin" \
"$(cat <<'BODY'
Validate the OAuth approach before any Drive code is written.

Use the **\`drive.file\`** scope, not \`drive\`. The broad scope requires
Google's CASA security assessment (annual, paid) for a verified app.
\`drive.file\` grants access to files the app creates *or* files the user opens
through the Google Picker — sufficient here, since the app creates
\`catalog.json\`, \`masters/\` and \`library/\` itself.

**Acceptance:**
- A throwaway page served from the real GitHub Pages origin signs in, opens the
  Picker, selects a folder, creates a file in it, and reads it back.
- Authorized JavaScript origins are exact-match, so this must be tested from
  the deployed URL, not localhost.
- Client id lands in the repo as the \`GOOGLE_CLIENT_ID\` Actions variable
  (already wired into \`deploy.yml\` as \`VITE_GOOGLE_CLIENT_ID\`).

Blocks all of phase 3.
BODY
)"

new "phase-0,ready-for-human" \
"Share the Drive folder per-user instead of sharing one Google account" \
"$(cat <<'BODY'
The plan records a single owner Google account used by the whole team. That
means shared credentials, shared 2FA, no attribution on edits, and Google's own
suspicious-sign-in blocking when several people authenticate from different
locations.

Cheap mitigation, free to adopt now and painful to retrofit later: keep the
folder **owned** by that account, but **share it with each person's own Google
account** and have each person sign in as themselves. The app resolves the
folder by id and does not care whose token it holds.

**Acceptance:** decision recorded in \`docs/adr/\`, and the folder is shared
with the intended accounts before anyone else starts using the app.
BODY
)"

# ── Phase 2 — the honest MVP: upload → grid → ZIP ───────────────────────────

new "phase-2,ready-for-agent" \
"Upload dropzone: files in, stickers out" \
"$(cat <<'BODY'
Drag-and-drop plus a file picker plus paste. Each accepted image becomes an
in-memory \`Sticker\` via \`parseFilename\` (already implemented and tested).

- Accept image/*; reject and report anything else without failing the batch.
- Decode once into an \`ImageBitmap\` and keep a downscaled copy for the grid —
  see the memory note in \`docs/v2-plan.md\` §8.
- No Drive yet; nothing is persisted.

**Acceptance:** dropping 40 images produces 40 stickers with correct art names
and no visible stall.
BODY
)"

new "phase-2,ready-for-agent" \
"Filter bar: size, type, barcode, logo" \
"$(cat <<'BODY'
One bar above the grid, driving \`useAppStore.filters\`. Size and type are
single-select and read from \`src/config/variants.ts\`. Barcode and logo are
independent checkboxes.

Changing a filter re-renders every card. It does **not** mutate any sticker —
filters describe the request, not the record.

**Acceptance:** toggling any control updates every card; adding a size to
\`variants.ts\` makes it appear with no other change.
BODY
)"

new "phase-2,ready-for-agent" \
"Sticker grid: two rows fill the viewport" \
"$(cat <<'BODY'
Card per image showing the currently filtered configuration. The \`.sticker-grid\`
class in \`index.css\` already implements the sizing: card height derives from
viewport height so exactly two rows fit including margins, and the column count
falls out of the 2:3 aspect ratio.

- Selection (click, shift-click range, select-all) feeding the download set.
- Badge states: no UPC, overflowing label, duplicate of a library entry.
- Empty state and per-card render error state.

**Acceptance:** at any window size the first two rows fill the viewport exactly
and the page never scrolls horizontally.
BODY
)"

new "phase-2,ready-for-agent" \
"Render pipeline: low-res grid previews, full-res on download" \
"$(cat <<'BODY'
\`renderSticker\` already takes a \`scale\` and serves both resolutions from one
code path. Wire it up:

- Grid cards render at roughly display size (~0.2 scale), debounced and
  cancellable, so a filter toggle across 40 cards feels instant.
- Full 300 dpi renders happen only at download, one at a time, in a worker.

**Acceptance:** toggling a filter with 40 stickers loaded does not block the
main thread perceptibly.
BODY
)"

new "phase-2,ready-for-agent" \
"Download: selected requests to one flat ZIP" \
"$(cat <<'BODY'
\`StickerRequest[] → ZIP\`. Flat inside, named \`ArtName_DAK_16x20.pdf\` using
the type \`code\` and size \`id\` from \`src/config/variants.ts\`, archive named
\`stickers_<yyyy-mm-dd>.zip\`.

- Full-res render → \`canvasToStickerPdf\` → JSZip → browser download.
- Progress dialog with a per-file error list; one bad file must not abort the
  archive.
- Name collisions get a numeric suffix rather than overwriting.

**Acceptance:** a mixed selection downloads as one ZIP whose PDFs are 4×6in at
300 dpi and open correctly in a PDF reader.

This issue completes the MVP. Stop and use it for a week before phase 3.
BODY
)"

# ── Phase 3 — Drive + catalog ───────────────────────────────────────────────

new "phase-3,ready-for-agent" \
"Drive auth and folder selection" \
"$(cat <<'BODY'
Implement \`src/drive/auth.ts\` and \`src/drive/client.ts\` following the phase-0
spike: Google Identity Services token client, \`drive.file\` scope, Picker-based
one-time folder selection, folder id persisted in localStorage.

Thin client only: list, upload, download, ensureFolder. Handle token expiry by
re-requesting silently, and surface a clear signed-out state.

Blocked by the phase-0 OAuth spike.
BODY
)"

new "phase-3,ready-for-agent" \
"catalog.json load and save" \
"$(cat <<'BODY'
\`src/drive/catalog.ts\`. Load on open, save on change.

- Schema is in \`src/types/index.ts\` (\`Catalog\`), \`version: 1\`.
- Round-trip test: written then read produces an identical store.
- Unknown fields on read are preserved, not dropped, so an older client cannot
  silently delete a newer client's data.
- Last-write-wins is accepted for now (see \`docs/v2-plan.md\` §8); note Drive
  revision history as the recovery path in the UI copy.
BODY
)"

new "phase-3,ready-for-agent" \
"Upload masters and save a batch to the library" \
"$(cat <<'BODY'
\"Save to Library\" uploads each master image into \`masters/\` and appends its
\`Sticker\` to \`catalog.json\`.

Save and Download stay independent: either can happen without the other.

**Acceptance:** after a save and a page reload, the library shows the batch.
BODY
)"

new "phase-3,ready-for-agent" \
"Library route: saved stickers in the same grid" \
"$(cat <<'BODY'
Second mode sharing the grid, filter bar, editor and download flow with New
Batch — only the data source differs. Adds a search field over art names.

**Acceptance:** a sticker saved in one session can be found, filtered and
downloaded in a later one.
BODY
)"

# ── Phase 4 — UPC lookup ────────────────────────────────────────────────────

new "phase-4,ready-for-agent" \
"Parse upc-lookup.csv and attach barcodes" \
"$(cat <<'BODY'
\`src/drive/upcLookup.ts\`. Columns: \`art_name, size, type, upc\`. Key with
\`lookupKey()\` from \`src/lib/normalize.ts\` (implemented and tested) so casing
and punctuation drift cannot split a key.

- Re-read on every app load; updating UPCs means editing one file in Drive.
- Malformed rows are skipped, not fatal. Report the count.
- A miss renders no barcode and badges the card. It must never block a download.

**Acceptance:** malformed CSV produces a warning and a working app; sizes and
types spelled differently in the CSV still match.
BODY
)"

# ── Phase 5 — editor ────────────────────────────────────────────────────────

new "phase-5,ready-for-agent" \
"Editor panel with sparse overrides and per-field revert" \
"$(cat <<'BODY'
Side panel beside a full-resolution live preview of the focused sticker.

- Content fields (art name, subtitle, marks) always visible; layout collapsed.
- Layout fields render from \`TEMPLATE_FIELDS\` in \`src/config/template.ts\` —
  real units with steppers and clamps, **never raw pixels**.
- Overrides are **sparse**: an untouched field is absent and inherits the
  template. Per-field revert is \`delete overrides[key]\`; \"Reset all\" clears
  the map.
- Preview debounced ~150ms.

**Acceptance:** overriding then reverting a field leaves \`overrides\` byte-identical
to before; the resolved template matches the global one.
BODY
)"

new "phase-5,ready-for-agent" \
"Apply to all: promote a sticker's overrides into the template" \
"$(cat <<'BODY'
\"Apply to all\" writes the focused sticker's geometry overrides into the global
template and **clears that key from every sticker's override map** — so it means
\"this is the new default\", not \"copy this blob onto 40 records\".

**Acceptance:** after applying, no sticker holds an override for the applied
keys, and every sticker renders with the new value.
BODY
)"

# ── Phase 6 — polish ────────────────────────────────────────────────────────

new "phase-6,ready-for-agent" \
"Duplicate detection on upload" \
"$(cat <<'BODY'
Match an incoming image's slug against the library **before** anything is saved.
Flag on the card and offer:

- **Update** — replace the master image, keep every label edit and override.
- **Keep both** — append a suffix to the art name.

**Acceptance:** re-uploading an edited sticker's artwork never silently discards
its overrides.
BODY
)"

new "phase-6,ready-for-agent" \
"Per-card filter pinning in the Library" \
"$(cat <<'BODY'
The top bar sets the configuration for all cards; a card can be pinned to its
own size/type/marks so one ZIP can mix configurations. This is the
\"select from all saved images setting the filters for each\" requirement, and
it is why \`StickerRequest\` is a separate type from \`Sticker\`.

**Acceptance:** a download containing two different sizes of the same artwork
produces two correctly named, correctly rendered PDFs.
BODY
)"

new "phase-6,ready-for-agent" \
"Mirror downloads into library/<Type>/<Size>/ on Drive" \
"$(cat <<'BODY'
Every download also writes its PDFs into \`library/<Type>/<Size>/\` using the
\`folder\` and \`id\` fields from \`src/config/variants.ts\`, so the organized
repository accumulates as a byproduct of real use and is browsable in Drive
without the app.

**Acceptance:** after a download, the tree exists in Drive with the same files
that are in the ZIP.
BODY
)"

new "phase-6,ready-for-agent" \
"Code-split the bundle" \
"$(cat <<'BODY'
The phase-1 build is already ~1.1MB minified (323KB gzipped), almost entirely
bwip-js and jsPDF. Neither is needed until a render happens.

Dynamic-import both from the render and download paths so the initial load
carries only the shell and the grid.

**Acceptance:** initial JS is comfortably under the 500KB warning threshold.
BODY
)"

echo "Done. Review with: gh issue list"
