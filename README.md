# Sticker Generator

Turns a batch of artwork into print-ready 4×6in PDF stickers, and keeps a
reusable library of them in Google Drive.

Upload images → preview every size and product type → edit labels → download a
ZIP, or save to the library and re-request any of it later with filters.

## How it works

The image is the record. An uploaded image becomes a **sticker**; size and
product type are **axes of a request**, not properties of the sticker. One
image therefore implies every size × type variant at all times, and nothing is
rendered until someone asks for it.

Storage is Google Drive and nothing else — `catalog.json` is the index,
`masters/` holds the source images, and `library/<Type>/<Size>/` accumulates
rendered PDFs as downloads happen. There is no backend.

See `docs/v2-plan.md` for the full design and `docs/adr/0001-image-centric-model.md`
for why it is shaped this way.

## Getting started

```sh
npm install
npm run dev
```

The dev server opens a **phase 1 proof page**, not the product UI: it renders
one sticker in all four mark combinations so the renderer can be verified
before the app is built on top of it.

### Fonts

The two label typefaces are not committed — see `public/fonts/README.md`.
Without them the app still runs and warns that output will not match a print
proof. **Confirm the webfont licensing before building further on these
faces.**

### Google Drive

Not wired up yet — phase 3. It will use the `drive.file` OAuth scope with the
Google Picker for folder selection, deliberately avoiding the broad `drive`
scope and its annual security assessment.

## Scripts

| Command | Does |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | Typecheck and build |
| `npm run test` | Vitest, watch mode |
| `npm run test:run` | Vitest, once (what CI runs) |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc -b` |
| `npm run typecheck:test` | Typecheck including test files |

## Status

Phase 1 — renderer, slot math, unit system, filename parsing, key normalization.
Phases 2–6 are open issues. Build order is in `docs/v2-plan.md` §9.
