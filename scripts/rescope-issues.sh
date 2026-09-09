#!/usr/bin/env bash
#
# Replaces the original 19 issues with the reduced set for a two-person
# internal tool. Closes everything currently open (none of it was started) and
# creates the smaller list.
#
# Run from inside the clone with `gh` authenticated:
#   & "C:\Program Files\Git\bin\bash.exe" scripts/rescope-issues.sh
#
set -euo pipefail

echo "Closing superseded issues..."
for n in $(gh issue list --state open --limit 100 --json number --jq '.[].number'); do
  gh issue close "$n" --reason "not planned" \
    --comment "Superseded by the rescope in docs/adr/0002-local-folder-storage.md — this was scoped for a multi-user product, not a two-person internal tool." >/dev/null
  echo "  closed #$n"
done

mklabel() { gh label create "$1" --color "$2" --description "$3" 2>/dev/null || true; }
mklabel "ready-for-agent" "0e8a16" "Scoped enough for an agent to pick up"
mklabel "ready-for-human" "fbca04" "Needs a human decision"
mklabel "needs-triage"    "ededed" "Not yet assessed"
mklabel "wontfix"         "ffffff" "Will not be worked on"

new() { gh issue create --label "$1" --title "$2" --body "$3"; }

new "ready-for-agent" \
"1. Pick the library folder and remember it" \
"$(cat <<'BODY'
\`src/fs/folder.ts\`.

- \`showDirectoryPicker()\` once; persist the \`FileSystemDirectoryHandle\` in
  IndexedDB so it survives a reload.
- On load, \`queryPermission\`; if not granted, one button to \`requestPermission\`.
  Never silently fail.
- A gate screen when no folder is chosen, explaining what the folder is for.
- Firefox/Safari: detect the missing API and say so plainly. Do not fall back
  to something half-working.

**Acceptance:** choose a folder, reload, and the app reconnects with a single
click.
BODY
)"

new "ready-for-agent" \
"2. Read and write stickers.json and masters/" \
"$(cat <<'BODY'
\`src/fs/library.ts\`. The \`Library\` type is already in \`src/types/index.ts\`.

- Read \`stickers.json\` on connect; create it with the default template if absent.
- Write it on change. Preserve unknown fields on read so a newer version's data
  is not silently dropped.
- Import images: copy into \`masters/\`, name from \`parseFilename\` (already
  implemented and tested), append a \`Sticker\`.
- If a master filename already exists, suffix rather than overwrite.

**Acceptance:** round-trip test — written then read produces an identical store.
Importing twice does not lose the first copy.
BODY
)"

new "ready-for-agent" \
"3. Filter bar and grid" \
"$(cat <<'BODY'
One screen. Import adds to the library and selects the new items; there is no
separate batch mode.

- Filter bar driving \`useAppStore.filters\`: size and type single-select from
  \`src/config/variants.ts\`, barcode and logo as independent checkboxes.
- One card per image showing the current filter. Grid sizing is already
  implemented as \`.sticker-grid\` in \`index.css\` — two rows fill the viewport.
- Selection: click, shift-click range, select all.
- Card badges: no UPC, overflowing label, render error.
- Search box over art names.
- Card previews render at roughly display size (~0.2 scale) via
  \`renderSticker\`'s \`scale\`, debounced and cancellable.

Changing a filter must never mutate a sticker — filters describe the request.

**Acceptance:** toggling a filter with 40 stickers loaded does not visibly stall.
BODY
)"

new "ready-for-agent" \
"4. Download selected stickers as a ZIP" \
"$(cat <<'BODY'
\`StickerRequest[] → ZIP\`. Flat inside, \`ArtName_DAK_16x20.pdf\` from the type
\`code\` and size \`id\` in \`src/config/variants.ts\`; archive named
\`stickers_<yyyy-mm-dd>.zip\`.

- Full-resolution render → \`canvasToStickerPdf\` → JSZip → browser download.
- One failing sticker must not abort the archive; collect and report.
- Name collisions get a numeric suffix.
- Optionally also write the PDFs into \`out/\` in the library folder.

**Acceptance:** a mixed selection downloads as one ZIP whose PDFs are 4×6in at
300 dpi and open correctly.

**This issue makes the tool useful. Stop here and actually use it before
starting #5.**
BODY
)"

new "ready-for-agent" \
"5. Editor panel with sparse overrides" \
"$(cat <<'BODY'
Click a card → side panel beside a full-resolution live preview.

- Art name and subtitle as text fields; mark toggles.
- Label geometry from \`TEMPLATE_FIELDS\` in \`src/config/template.ts\` — real
  units with steppers and clamps, **never raw pixels**. Collapsed by default.
- Overrides are **sparse**: an untouched field is absent and inherits the
  template. Per-field revert is \`delete overrides[key]\`; "Reset all" clears the
  map. A revert control appears only on fields that diverge.
- Preview debounced ~150ms.

**Acceptance:** overriding then reverting a field leaves \`overrides\` identical
to before, and the resolved template matches the global one.
BODY
)"

new "ready-for-agent" \
"6. UPC lookup from upc-lookup.csv" \
"$(cat <<'BODY'
\`src/fs/upcLookup.ts\`. Columns: \`art_name, size, type, upc\`. Key with
\`lookupKey()\` from \`src/lib/normalize.ts\` (implemented and tested) so casing
and punctuation drift cannot split a key.

- Read from the library folder on connect and on demand.
- Malformed rows are skipped, not fatal — report the count.
- A miss renders no barcode and badges the card. It must never block a download.
- Optional file: absent means no barcodes, not an error.

**Acceptance:** a malformed CSV yields a warning and a working app; sizes and
types spelled differently in the CSV still match.
BODY
)"

new "ready-for-human" \
"Confirm both machines have the label fonts installed" \
"$(cat <<'BODY'
The label uses two faces (v1: Baskerville Display PT, Tw Cen MT). Canvas
silently substitutes a missing font — v1 had no \`@font-face\` at all, so it
rendered correctly only on a machine with them installed locally.

\`src/render/fonts.ts\` now verifies by measurement and warns when a face did not
resolve, so this cannot happen silently any more. But the warning is only useful
if someone acts on it.

**Action:** open the app on both machines and confirm no font warning appears.
If the second machine lacks them, install the fonts there.

Note: self-hosting these as webfonts would mean serving them publicly if this is
ever deployed to GitHub Pages, which most desktop font licenses forbid. Running
locally with installed fonts avoids the question entirely.
BODY
)"

echo
echo "Done. Review with: gh issue list"
