# Sticker Generator — Agent Instructions

## Project overview

A browser-based React + TypeScript app that turns a batch of uploaded artwork
into print-ready 4×6in PDF stickers, and keeps a reusable library of them in
Google Drive.

**Read `docs/v2-plan.md` before making any structural change.** It is the spec.

### The model — get this right or you will rebuild the wrong app

The image **is** the record. An uploaded image becomes a `Sticker`. Size and
type are **not properties of a sticker** — they are axes of a `StickerRequest`.
One image therefore implies all size × type variants at all times, without
storing any of them.

- `Sticker` — persistent, one per artwork, lives in `catalog.json` on Drive.
- `StickerRequest` — ephemeral `{ stickerId, size, type, barcode, logo }`.
  A download is `StickerRequest[] → ZIP`. That is the whole application.

There is **no spreadsheet import**, no column mapping, and no image-to-row
matching. A predecessor repo (`sticker-maker`) worked that way; do not
reintroduce any of it. Barcodes come from `upc-lookup.csv` in Drive, joined on
`lookupKey(artName, size, type)`.

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
- **Storage:** Google Drive via browser OAuth, `drive.file` scope. No backend.

## Folder structure

```
src/
  config/      variants.ts (sizes/types), template.ts (geometry defaults)
  render/      units, slots, fonts, barcode, renderSticker, toPdf
  drive/       auth, client, catalog, upcLookup
  lib/         pure helpers (parseFilename, normalize, zip)
  store/       Zustand store (useAppStore.ts)
  components/  UI components — one file per component (PascalCase)
  routes/      NewBatch.tsx, Library.tsx
  types/       shared types (index.ts)
```

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
  Missing logo → no logo plus a warning. Do not throw.

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
`parseFilename.ts`, `normalize.ts`, override merging, and catalog round-trip.
Do not write pixel-comparison tests — verify visual output against a printed
proof instead.

## Commit convention

Format: `type(scope): short description`

Types: `feat`, `fix`, `refactor`, `style`, `chore`, `docs`, `test`
Scopes: `render`, `drive`, `grid`, `editor`, `store`, `config`, `lib`, `ui`

Examples:
- `feat(render): place barcode and logo as independent slots`
- `feat(drive): load and save catalog.json`
- `fix(render): await font loading before measuring text`
- `test(lib): cover filename parsing edge cases`

Commit after completing a task.
