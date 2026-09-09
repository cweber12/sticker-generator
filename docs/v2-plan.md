# Sticker Maker v2 — Rebuild Plan

Decisions from the grill session on 2026-09-09. This document is the spec for a new
repository. The existing `sticker-maker` repo is not migrated; it is mined for four
utility modules and otherwise abandoned.

---

## 1. The core inversion

**v1 is row-centric.** A `StickerRow` is a spreadsheet record that happens to have an
image attached. Everything follows from that: column mapping, fuzzy name matching, an
unmatched-images tray, `needsReview` flags, per-row size/type dropdowns. Nine components
and six utility modules exist to get a spreadsheet and a folder of images to agree with
each other.

**v2 is image-centric.** The image *is* the record. An uploaded image is a `Sticker`;
its size and type are not properties of it but **axes of a request**. One image implies
six variants (3 sizes × 2 types) at all times, without storing six of anything.

This single change deletes the entire matching problem.

### The two nouns

```ts
// Persistent. One per uploaded artwork. Lives in catalog.json.
interface Sticker {
  id: string;
  artName: string;          // parsed from filename, user-editable
  slug: string;             // normalized key for UPC lookup + filenames
  masterFileId: string;     // Drive file ID of the source image
  masterFileName: string;
  createdAt: string;
  updatedAt: string;
  defaultMarks: { barcode: boolean; logo: boolean };
  overrides: Partial<LabelTemplate & { artName: string }>;  // SPARSE
  variantOverrides: Record<VariantKey, Partial<LabelOverride>>; // SPARSE, rare
}

// Ephemeral. What the user is asking for right now. Never persisted.
interface StickerRequest {
  stickerId: string;
  size: Size;
  type: Type;
  barcode: boolean;
  logo: boolean;
}
```

A download is `StickerRequest[] → ZIP`. That's the whole application.

`VariantKey` is `` `${size}|${typeCode}` `` — e.g. `"16x20|DAK"`.

---

## 2. Decisions

| Area | Decision |
|---|---|
| Metadata source | Filename convention. `Sunset Beach.png` → art name "Sunset Beach". |
| Barcodes | Never typed in the app. `upc-lookup.csv` in Drive, keyed on art name + size + type. |
| Storage | Google Drive only. No database, no backend. |
| Catalog | Single `catalog.json` at the Drive folder root. |
| Rendering | On demand. Masters + metadata are stored; PDFs are generated at download time. |
| Drive layout | Flat `masters/`, plus `library/<Type>/<Size>/` that accumulates as you download. |
| App shape | Static React site, browser-side Google OAuth. No server. |
| Account | Single owner Google account, shared by the team. (See §8 — this needs a mitigation.) |
| Marks | Barcode and diamond logo are independent toggles, valid on any type. |
| Grid unit | One card per image, showing the currently filtered configuration. |
| Editing | Per-sticker sparse overrides on a global template, plus "apply to all". |
| Editor UI | Side panel + live preview, real-world units (inches / points). |
| Output | PDF only, fully rasterized, 4×6in @ 300dpi. |
| Download | One flat ZIP. |
| Duplicates | Detected on upload; user chooses update-in-place or keep-both. |
| Variants config | `src/config/variants.ts`. Adding a size is a one-line change. |
| Preview perf | Low-res grid renders (~400px). Full 300dpi only at download, in a worker. |

---

## 3. Drive layout

```
/Sticker Library/                  ← one folder, shared with the team
├── catalog.json                   ← the entire index
├── upc-lookup.csv                 ← art_name, size, type, upc
├── masters/
│   ├── sunset-beach.png
│   └── mountain-dawn.png
└── library/                       ← grows only as downloads happen
    ├── DiamondArtKit/
    │   ├── 8x10/
    │   ├── 10x12/
    │   └── 16x20/
    │       └── SunsetBeach_DAK_16x20.pdf
    └── PaintByNumbersKit/
        └── ...
```

`library/` is a **byproduct of use**, not a speculative render of everything. It exists
so a human can open Drive and browse "16×20 Diamond Art" without the app. Every download
writes there in the same pass that builds the ZIP.

### catalog.json

```json
{
  "version": 1,
  "updatedAt": "2026-09-09T18:04:00Z",
  "template": {
    "labelInsetIn": 0.153,
    "labelHeightIn": 0.570,
    "labelPaddingIn": 0.127,
    "barcodeWidthIn": 1.273,
    "logoHeightIn": 0.316,
    "nameFontPt": 12.5,
    "nameTrackingPt": 2.9,
    "subtitleFontPt": 9.1
  },
  "stickers": [ /* Sticker[] */ ]
}
```

Written back on every save. Drive keeps revision history, so a bad write is recoverable.

---

## 4. Units — kill the design-unit system

v1 stores layout in canvas pixels and documents a `DESIGN_UNIT_PX = 3.82` conversion in
a 6KB markdown file. The layout editor exposes those raw pixels to the user.

v2 stores **inches for geometry, points for type**, and derives pixels at render time:

```ts
const DPI = 300;
const inToPx = (inches: number) => Math.round(inches * DPI);
const ptToPx = (pt: number) => Math.round((pt * DPI) / 72);
```

Carried over from v1's defaults:

| v1 (px @300dpi) | v2 |
|---|---|
| `labelInset: 46` | `labelInsetIn: 0.153` |
| `labelHeight: 171` | `labelHeightIn: 0.570` |
| `labelPadding: 38` | `labelPaddingIn: 0.127` |
| `barcodeZoneWidth: 382` | `barcodeWidthIn: 1.273` |
| `nameFontSize: 52` | `nameFontPt: 12.5` |
| `sizeFontSize: 38` | `subtitleFontPt: 9.1` |

`textAreaWidth` is **deleted as a stored value** — it was always derivable. It becomes
computed: label width minus padding minus whatever marks are enabled. This removes a
class of bug where the text area and the mark zone disagreed.

`docs/unit-conversions.md` does not carry forward.

---

## 5. The label, with independent marks

Slots are laid out right-to-left inside the label strip:

```
┌──────────────────────────────────────────────────┐
│  ART NAME                    [logo]  [ barcode ] │
│  16x20 Diamond Art                               │
└──────────────────────────────────────────────────┘
   ← text area (computed)  →  ← marks (measured) →
```

```ts
function computeSlots(t: LabelTemplate, marks: Marks) {
  const labelW = inToPx(STICKER_W_IN - t.labelInsetIn * 2);
  const pad = inToPx(t.labelPaddingIn);
  let right = labelW - pad;
  const slots: Slot[] = [];
  if (marks.barcode) { const w = inToPx(t.barcodeWidthIn); right -= w; slots.push({kind:'barcode', x:right, w}); right -= pad; }
  if (marks.logo)    { const w = logoWidthFor(t.logoHeightIn); right -= w; slots.push({kind:'logo', x:right, w}); right -= pad; }
  return { slots, textAreaW: right - pad };
}
```

Four valid states: neither (name + subtitle only, full-width text), barcode only
(v1 default), logo only, both. No type-dependent branching anywhere in the renderer —
that rule moves entirely into the UI's *defaults*, not the render path.

**Barcode with no UPC** renders nothing and the card shows a "no UPC" badge. It never
blocks a download. Same for a missing logo asset — v1's fallback-to-barcode behavior is
dropped as surprising; a missing logo simply renders no logo and warns.

---

## 6. Screens

### Shell

```
┌────────────────────────────────────────────────────────────┐
│  Sticker            [ New Batch │ Library ]      ● Signed in│
├────────────────────────────────────────────────────────────┤
│  Size: [8x10][10x12][16x20]   Type: [DAK][PBN]             │
│  ☑ Barcode  ☐ Diamond logo          12 selected  [Download]│
├────────────────────────────────────────────────────────────┤
│                                                            │
│   ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐        │
│   │      │  │      │  │      │  │      │  │      │        │
│   └──────┘  └──────┘  └──────┘  └──────┘  └──────┘        │
│   ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐        │
│   │      │  │      │  │      │  │      │  │      │        │
│   └──────┘  └──────┘  └──────┘  └──────┘  └──────┘        │
└────────────────────────────────────────────────────────────┘
```

One filter bar, one grid, two modes. The grid, the filter bar, the editor panel and the
download flow are **the same components** in both modes — only the data source differs.

### Grid sizing

"Two rows fill the screen including margins." Cards are 2:3 (4×6in).

```css
.grid {
  --rows: 2;
  --gap: 1rem;
  --card-h: calc((100dvh - var(--chrome-h) - var(--gap) * (var(--rows) + 1)) / var(--rows));
  grid-template-columns: repeat(auto-fill, minmax(calc(var(--card-h) * 2 / 3), 1fr));
  grid-auto-rows: var(--card-h);
}
```

Card height is driven by viewport height; column count falls out of the aspect ratio.
More images scroll; the first two rows always fill the screen exactly.

### New Batch

1. Drop images (or paste, or file picker).
2. Filenames parse to art names; UPC lookup runs; duplicates flagged inline.
3. Grid renders immediately at the current filter. Toggling filters re-renders in place.
4. Click a card → editor panel. Edit → sparse override saved to local state.
5. **Save to Library** uploads masters + writes catalog.json.
6. **Download** builds the ZIP (and mirrors into `library/`).

Save and Download are independent. You can download without saving, or save without
downloading.

### Library

Same grid over everything in `catalog.json`. Adds a search field and per-sticker filter
pinning: the top bar sets the configuration for all, but a card can be pinned to its own
size/type/marks so a single ZIP can mix configurations. This is the "select from all
saved images setting the filters for each" requirement, and it's why `StickerRequest`
exists as a separate type from `Sticker`.

### Editor panel

```
┌─────────────────────┬──────────────────────┐
│                     │  Art name            │
│                     │  [Sunset Beach    ]↺ │
│    live preview     │                      │
│    (full res)       │  Subtitle            │
│                     │  [16x20 Diamond A ]↺ │
│                     │                      │
│                     │  Marks               │
│                     │  ☑ Barcode           │
│                     │  ☐ Diamond logo      │
│                     │                      │
│                     │  ▸ Label layout      │
│                     │    Inset   0.15 in ↺ │
│                     │    Height  0.57 in ↺ │
│                     │    Name    12.5 pt ↺ │
│                     │                      │
│  [Apply to all]  [Reset all]  [Done]       │
└─────────────────────┴──────────────────────┘
```

Best-practice details that v1 lacks:

- **Sparse overrides.** A field the user hasn't touched is absent from `overrides` and
  inherits the template. Revert is `delete overrides[key]` — exact, not "restore a
  remembered value".
- **Per-field revert (↺)** appears only on overridden fields, so the panel shows at a
  glance what diverges.
- **Layout collapsed by default.** Content editing is the common case; geometry is rare.
- **Real units with steppers**, min/max clamps, and no raw pixels.
- **Debounced live preview** (~150ms) at full resolution for the one sticker in focus.
- **Apply to all** writes the current sticker's overrides into the global template and
  clears them from every sticker's override map — so "apply to all" genuinely means
  "this is the new default", not "copy this blob 40 times".

---

## 7. Modules

```
src/
├── config/
│   ├── variants.ts          Size/Type/code tables. The only place they're listed.
│   └── template.ts          DEFAULT_TEMPLATE in inches/points.
├── drive/
│   ├── auth.ts              GIS token client, drive.file scope.
│   ├── client.ts            Thin fetch wrapper: list, upload, download, ensureFolder.
│   ├── catalog.ts           load/save catalog.json.
│   └── upcLookup.ts         Parse upc-lookup.csv → Map<key, upc>.
├── render/
│   ├── slots.ts             computeSlots — mark layout math.
│   ├── renderSticker.ts     Canvas composite. One function, both resolutions.
│   ├── barcode.ts           bwip-js wrapper.          ← port from v1
│   └── toPdf.ts             Canvas → 4×6in jsPDF.     ← port from v1 (raster path only)
├── store/
│   └── useAppStore.ts       Zustand. stickers, template, filters, selection, requests.
├── lib/
│   ├── parseFilename.ts     Filename → art name + slug.
│   ├── normalize.ts         Slug/lookup-key normalization. ← port aliases from v1
│   └── zip.ts               Build the download ZIP.
├── components/
│   ├── FilterBar.tsx
│   ├── StickerGrid.tsx      + StickerCard.tsx
│   ├── EditorPanel.tsx
│   ├── UploadDropzone.tsx
│   └── DownloadDialog.tsx   Progress + per-file errors.
└── routes/
    ├── NewBatch.tsx
    └── Library.tsx
```

**Ported from v1** (four files, lightly edited): `render-sticker.ts`'s canvas compositing
and `fitFontSize`, `renderBarcode`, the jsPDF page setup from `export-stickers.ts`, and
the size/type alias tables from `sticker-fields.ts`.

**Deleted outright:** `SpreadsheetImporter`, `ColumnMapper`, `parse-spreadsheet.ts`,
`fuzzy-match.ts`, `ManualEntryPanel`, `DataTable` (19KB), `LayoutEditor` (15KB),
`pdf-fonts.ts`, the selectable-text export path, the unmatched-images tray, `needsReview`,
`ColumnMap`, `RawRow`. Dependencies dropped: `exceljs`. Added: `jszip`.

Rough count: ~95KB of component source in v1 becomes ~35KB in v2, and the store loses
roughly half its actions.

---

## 8. Risks and open items

**Google OAuth scope — decide before writing auth code.** The broad `drive` scope
requires Google's CASA security assessment (annual, paid) for a verified app. Use
`drive.file` instead: it grants access only to files the app creates *or* files the user
explicitly opens through the Google Picker. That's sufficient here — the app creates
`catalog.json`, `masters/` and `library/` itself, and the one-time folder selection goes
through the Picker. This is the difference between shipping and a months-long
verification process, so it's the first thing to build and test.

**The shared owner account is the weak point in this plan.** A single Google account used
by the whole team means shared credentials, 2FA that has to be shared, no attribution on
edits, and Google's own suspicious-sign-in blocking when several people authenticate from
different locations. The cheap mitigation, which costs nothing to adopt now: keep the
folder owned by that account, but **share the Drive folder with each person's real Google
account** and have each person sign in as themselves. The app resolves the folder by ID
either way — it does not care whose token it holds. Worth doing before anyone else starts
using it.

**catalog.json write conflicts.** Two people saving simultaneously — last write wins and
one loses their edit. For a small team this is acceptable; the recovery path is Drive's
revision history. If it bites, the fix is to re-read the catalog immediately before every
write and merge by sticker `id`.

**UPC coverage.** With the lookup file external to the app, some stickers will have no
UPC. The grid must make that visible (badge on the card, count in the filter bar) rather
than silently producing barcode-less PDFs.

**Memory with large batches.** 40 masters at full resolution held as `HTMLImageElement`
will be hundreds of MB. Grid cards should render from downscaled bitmaps
(`createImageBitmap` with `resizeHeight`), keeping full-resolution decoding to the
download worker, one file at a time.

---

## 9. Build order

Each phase ends somewhere shippable.

1. **Skeleton + render core.** Vite/React/TS/Tailwind, `variants.ts`, `template.ts`,
   `slots.ts`, ported renderer. Prove all four mark combinations render correctly at
   300dpi against a hardcoded fixture. No Drive, no UI.
2. **Upload → grid → ZIP.** Dropzone, filename parsing, filter bar, grid with the
   two-row sizing, download worker, JSZip. **This alone replaces v1's daily use** and is
   worth stopping to actually use for a week before continuing.
3. **Drive auth + catalog.** `drive.file` scope, Picker-based folder selection, save and
   load `catalog.json`, upload masters. Library mode becomes real.
4. **UPC lookup.** Parse `upc-lookup.csv`, key normalization, missing-UPC badges.
5. **Editor panel.** Sparse overrides, per-field revert, apply-to-all, live preview.
6. **Polish.** Duplicate detection on upload, per-card filter pinning in Library,
   `library/` mirroring on download, download progress and error surfacing.

Phase 2 is the honest MVP. Phases 3–4 make it a repository. Phases 5–6 make it pleasant.

---

## 10. Tests worth writing

v1's test suite largely tests the machinery being deleted. The tests that earn their keep
in v2:

- `slots.ts` — all four mark combinations, plus text-area width never going negative when
  both marks are on at a small label height.
- `parseFilename.ts` — underscores, hyphens, double extensions, unicode, leading numbers.
- `normalize.ts` — the lookup key matches across casing and punctuation drift.
- `upcLookup.ts` — malformed CSV rows are skipped, not fatal.
- Override merge — sparse override + template resolves correctly; delete restores default.
- Round-trip — `catalog.json` written then read produces an identical store.

Not worth it: canvas pixel-comparison tests. They break constantly and catch little. One
manual visual check per phase against a printed proof is more valuable.
