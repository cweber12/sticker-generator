# Sticker Generator — Agent Instructions

## Project overview

A browser-based React + TypeScript app that turns a batch of uploaded artwork
into print-ready 4×6in PDF stickers, and keeps a reusable library of them in an
ordinary folder on disk that both machines already sync.

**Read `docs/v2-plan.md` before making any structural change.** It is the spec.

### The model — get this right or you will rebuild the wrong app

The image **is** the record. An uploaded image becomes a `Sticker`. Size and
type are **not properties of a sticker** — they are axes of a `StickerRequest`.
One image therefore implies all size × type variants at all times, without
storing any of them.

- `Sticker` — persistent, one per artwork, lives in `stickers.json` in the
  library folder.
- `StickerRequest` — ephemeral `{ stickerId, size, type, barcode, logo }`.
  A download is `StickerRequest[] → ZIP`. That is the whole application.
- The requests come from the **basket**: a set of `Sticker × Variant` keyed
  `file|size|type`. Selection is two things — `selected` stages the ticks in
  the grid, `basket` holds the order — and **Add** unions one into the other
  without clearing the ticks. Marks are a property of the *download*, not of a
  request, because the filename encodes size and type only. See
  `docs/adr/0004-the-basket-of-requests.md`.

There is **no spreadsheet import**, no column mapping, and no image-to-row
matching. A predecessor repo (`sticker-maker`) worked that way; do not
reintroduce any of it. Barcodes come from `upc-lookup.csv` in the library
folder, joined on `lookupKey(artName, size, type)`.

Marks (barcode, diamond logo) are **independent booleans valid on any product
type**. There is no type-dependent branching in the render path — product type
only supplies a *default* in `src/config/variants.ts`.

## Stack

- **Framework:** Vite + React 19 + TypeScript (strict)
- **Styling:** Tailwind CSS v4 (no config file — CSS-based via `@import "tailwindcss"`)
- **State:** Zustand
- **Barcodes:** bwip-js (client-side UPC-A canvas rendering)
- **PDF:** jsPDF, rasterized only
- **Packaging:** JSZip
- **Storage:** a local folder picked with `showDirectoryPicker()`, its handle
  persisted in IndexedDB. No backend, no API, no OAuth — see
  `docs/adr/0002-local-folder-storage.md`. Chrome and Edge only.

## Folder structure

```
src/
  config/      variants.ts (sizes/types), template.ts (geometry defaults)
  render/      units, slots, fonts, barcode, renderSticker, toPdf
  fs/          folder (pick + remember), library (stickers.json + the images), upcLookup
  lib/         helpers (parseFilename, normalize, zip)
  store/       Zustand store (useAppStore.ts)
  components/  FolderGate, RequestBar, StickerGrid, StickerCard, BasketPanel
  types/       shared types (index.ts)
```

There is no `routes/`. The app is one screen: a request bar over a grid of every
sticker in the library, with a basket panel that opens beside it. Importing adds
to that library and selects the new items; there is no separate batch mode.

The size and type controls are **not** filters — they never remove a card. They
choose the Variant everything is drawn as and that Add will use. The search box
is the only filter.

## Rules that matter

- **Units.** Geometry is stored in **inches**, type in **points**. Pixels exist
  only inside `src/render/`, derived via `units.ts`. Never store or surface a
  canvas pixel value; never reintroduce a "design unit" conversion factor.
- **Slot math lives in `render/slots.ts`** and nowhere else. If you need to know
  where something sits inside the label, call `computeLabelGeometry`. Do not
  recompute label positions in a component, in the PDF writer, or in a test.
- **One render path.** `renderSticker` serves both the grid preview and the
  print export; `scale` is the only difference. Do not add a second
  implementation of the layout for any output format.
- **Fonts must be awaited.** Canvas silently substitutes a missing font. Always
  `await ensureFontsLoaded()` before drawing text, and surface `!ok` to the user.
- **Overrides are sparse.** An absent key inherits the template. Revert is
  `delete overrides[key]`. Never write a full template blob onto a sticker.
- **Missing data never blocks an export.** No UPC → no barcode plus a badge.
  Missing logo → no logo plus a warning. Do not throw. One sticker that fails
  to render must not abort a whole download — collect it and report it.
- **The folder is the library.** Every image sitting in the library folder is
  a sticker, adopted on sight — there is no import gate, and no `masters/`
  subfolder (ADR-0003). `stickers.json` is a metadata overlay keyed by
  filename, not a registry of what exists; it is read on connect, written only
  when something was adopted, and preserves fields it does not recognise so a
  newer version's data is not silently dropped. A record whose file is absent
  is skipped, never deleted: a sync client can make a file briefly missing.
- **The filename is the sticker's id.** It is unique within a folder and
  deterministic, so both machines agree. Masters are never modified or renamed
  by the app.

## Code style

- TypeScript strict — explicit types on function signatures, no implicit `any`.
- `verbatimModuleSyntax` is on: use `import type` for type-only imports.
- `erasableSyntaxOnly` is on: no enums, no parameter properties.
- Named exports for utilities and types; default exports only for React components.
- No inline styles — Tailwind utilities, or a class in `index.css` for anything
  that needs a CSS custom property.
- `const` arrow functions for utilities; the `function` keyword for components
  and hooks.
- Extract logic to `lib/` or a hook once a component passes ~80 lines.
- Always handle loading, error and empty states.

## Testing

Pure logic is tested; canvas pixels are not. Required coverage:
`slots.ts` (all four mark combinations plus degenerate templates),
`parseFilename.ts`, `normalize.ts`, override merging, and a `stickers.json`
round-trip.
Do not write pixel-comparison tests — verify visual output against a printed
proof instead.

## Commit convention

Format: `type(scope): short description`

Types: `feat`, `fix`, `refactor`, `style`, `chore`, `docs`, `test`
Scopes: `render`, `fs`, `grid`, `editor`, `store`, `config`, `lib`, `ui`

Examples:
- `feat(render): place barcode and logo as independent slots`
- `feat(fs): read and write stickers.json`
- `fix(render): await font loading before measuring text`
- `test(lib): cover filename parsing edge cases`

Commit after completing a task.
