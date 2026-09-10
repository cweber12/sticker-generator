# Sticker Generator — Plan

An internal tool for two people. Runs in the browser, reads and writes a folder
on disk, generates print-ready 4×6in PDF stickers. No server, no accounts, no
API integration.

Revised 2026-09-09 after the first draft over-scoped this as a multi-user
product — see `docs/adr/0002-local-folder-storage.md`.

---

## 1. The core idea

**The image is the record.** An uploaded image is a `Sticker`; size and product
type are not properties of it but **axes of a request**. One image implies six
variants (3 sizes × 2 types) at all times, without storing six of anything.

```ts
// Persistent. One per artwork. Lives in stickers.json.
interface Sticker {
  id: string;                   // the master's filename — see ADR-0003
  artName: string;              // parsed from filename, editable
  slug: string;                 // join key for the UPC lookup
  masterFile: string;           // filename in the library folder
  defaultMarks: { barcode: boolean; logo: boolean };
  overrides: LabelOverride;                        // SPARSE
  variantOverrides: Record<VariantKey, LabelOverride>;  // SPARSE
}

// Ephemeral. What you're asking for right now. Never persisted.
interface StickerRequest {
  stickerId: string;
  size: SizeId;
  type: TypeId;
  barcode: boolean;
  logo: boolean;
}
```

A download is `StickerRequest[] → ZIP`. That is the whole application.

---

## 2. Storage: one folder, no API

The library lives in a folder that both machines already sync — a Google Drive
or Dropbox folder handled by the desktop client. **The app never talks to any
API.** It picks the folder once with `showDirectoryPicker()`, stores the handle
in IndexedDB, and re-requests permission with one click on later visits.

```
<synced folder>/
├── stickers.json        ← metadata overlay: template + one record per image
├── Sunset Beach.png     ← masters sit directly in the folder
├── Harbour Lights.jpg
└── upc-lookup.csv       ← optional: art_name, size, type, upc
```

**The folder listing is the library** (`docs/adr/0003-images-in-the-library-root.md`).
Every image in it is a sticker, adopted the moment the folder is read, so
dropping a file in — from Explorer, or from the other machine via the sync
client — is all it takes. `stickers.json` holds art names, marks and overrides
keyed by filename; it does not decide what exists. A record whose file is
absent is skipped, never deleted, because a sync client can make a file briefly
missing and overrides must survive that.

Sync is the other person's problem to have already solved, which they have, by
installing the Drive desktop app. Two people editing `stickers.json` at the same
moment could conflict; at this scale, don't coordinate — just don't do it, and
recover from the sync client's version history if it happens.

`showDirectoryPicker` is Chrome and Edge only. That is fine for two known users
on Windows, and the app should say so plainly rather than fail obscurely
elsewhere.

### stickers.json

```json
{
  "version": 1,
  "updatedAt": "2026-09-09T18:04:00Z",
  "template": { "labelInsetIn": 0.153, "labelHeightIn": 0.57, "...": "..." },
  "stickers": [ /* Sticker[] */ ]
}
```

---

## 3. Units

Geometry in **inches**, type in **points**, pixels derived at render time.
v1 stored canvas pixels and documented a `DESIGN_UNIT_PX = 3.82` conversion in
a separate file; that is gone. `src/render/units.ts` is the only place DPI
appears.

`textAreaWidth` is **not stored** — it is computed from the label width minus
padding minus whatever marks are enabled. Storing it separately is what let v1's
text area and mark zone disagree.

---

## 4. The label

Barcode and diamond logo are **independent booleans on any product type**. Four
valid states, no type-dependent branching in the render path — product type only
supplies a default in `src/config/variants.ts`.

```
┌──────────────────────────────────────────────────┐
│  ART NAME                    [logo]  [ barcode ] │
│  16 × 20 Diamond Art                             │
└──────────────────────────────────────────────────┘
   ← text area (computed)  →  ← marks (measured) →
```

Slots fill from the right edge inward. All of this lives in `render/slots.ts`
and nowhere else. **Done and tested.**

Missing data never blocks an export: no UPC → no barcode plus a badge; missing
logo → no logo plus a warning.

---

## 5. Screens

One screen.

```
┌────────────────────────────────────────────────────────────┐
│  Sticker Generator          📁 Client Stickers   [Import]  │
├────────────────────────────────────────────────────────────┤
│  Size: [8x10][10x12][16x20]   Type: [DAK][PBN]             │
│  ☑ Barcode  ☐ Diamond logo          12 selected  [Download]│
├────────────────────────────────────────────────────────────┤
│   ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐        │
│   └──────┘  └──────┘  └──────┘  └──────┘  └──────┘        │
│   ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐        │
│   └──────┘  └──────┘  └──────┘  └──────┘  └──────┘        │
└────────────────────────────────────────────────────────────┘
```

There is no "new batch" versus "library" split. Importing images adds them to
the library and selects them; everything you have is always in the grid, with a
search box when it gets long. One card per image, showing the current filter.

**Grid sizing.** Cards are 2:3. Card height derives from viewport height so two
rows fill the screen including margins; column count falls out of the aspect
ratio. Implemented in `.sticker-grid` in `index.css`.

**Editor.** Click a card's image → a maximized detail view; the editor is a
toggle inside it, beside the live preview. The two are one surface because
finding a problem in a proof and fixing it are the same moment. Art name and subtitle as
text fields, mark toggles, and label geometry in inches/points with steppers —
never raw pixels. Overrides are **sparse**: an untouched field is absent and
inherits the template, so reverting is `delete overrides[key]`, which is exact
rather than "restore a remembered value". A revert arrow appears only on fields
that diverge.

---

## 6. Modules

```
src/
├── config/
│   ├── variants.ts       ✅ sizes, types, codes — the only enumeration point
│   └── template.ts       ✅ defaults in inches/points + editor field specs
├── render/
│   ├── units.ts          ✅ in→px, pt→px
│   ├── slots.ts          ✅ mark layout math (tested)
│   ├── fonts.ts          ✅ awaited load + measurement verification
│   ├── barcode.ts        ✅ bwip-js wrapper
│   ├── renderSticker.ts  ✅ one path, preview and print, via `scale`
│   └── toPdf.ts          ✅ canvas → 4×6in PDF
├── fs/
│   ├── folder.ts         ✅ pick folder, persist handle, re-permission
│   ├── library.ts        ✅ read/write stickers.json, scan + adopt images
│   └── upcLookup.ts      ⬜ parse upc-lookup.csv
├── lib/
│   ├── parseFilename.ts  ✅ filename → art name (tested)
│   ├── normalize.ts      ✅ slug + lookup key (tested)
│   └── zip.ts            ⬜ build the download archive
├── store/useAppStore.ts  ⬜ stickers, filters, selection, template
└── components/           ⬜ FolderGate, FilterBar, StickerGrid, EditorPanel
```

✅ = phase 1, done and passing CI.

---

## 7. Build order

1. **Folder + library.** `fs/folder.ts`, `fs/library.ts`, a gate screen that
   asks for the folder. Read and write `stickers.json`; adopt every image in
   the folder.
2. **Grid + filters.** Filter bar, grid at two-row sizing, low-res previews,
   selection.
3. **Download.** Selected requests → full-res render → ZIP. **This is the point
   the tool becomes useful — stop and use it before continuing.**
4. **Editor.** Text fields, mark toggles, sparse geometry overrides, revert.
5. **UPC lookup.** Parse the CSV, badge the misses.

---

## 8. What this deliberately is not

- No Google Drive API, no OAuth, no accounts. The folder is synced by software
  that already exists on both machines.
- No conflict resolution. Two people, last write wins, sync history recovers it.
- No `library/<Type>/<Size>/` mirror tree. Filters replace folder browsing.
- No duplicate-detection dialog, progress dialog, or code splitting.
- ~~No per-card filter pinning.~~ Amended by
  `docs/adr/0004-the-basket-of-requests.md`: a download is a **basket** of
  `Sticker × Variant`, not N stickers × one variant. Pinning itself is still
  rejected — a card holds one pin, which cannot express the same artwork at
  two variants.
- No selectable-text PDF path. Rasterized only, which is what prints correctly.
- No spreadsheet import, column mapper, fuzzy image matching, or manual row
  entry — all of v1's machinery for reconciling two inputs.

## 9. The one real risk

**Fonts.** The label uses two faces that v1 referenced by name with no
`@font-face`, so canvas silently substituted when they were missing. Running
locally on a machine that has them installed, that works — which is why v1
worked for you. `render/fonts.ts` now verifies by measurement and warns loudly
when a face did not resolve, so the second machine can't quietly produce
different typography.

If you ever deploy this publicly on GH Pages, self-hosting those faces means
serving them to anyone, which most desktop font licenses forbid. Keep it local
and the question doesn't arise.

## 10. Tests worth keeping

`slots.ts` (all four mark combinations, degenerate templates), `parseFilename`,
`normalize`, override merge, and a `stickers.json` round-trip. Not worth it:
canvas pixel comparison — check a printed proof instead.
