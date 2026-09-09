# Sticker Generator

Turns artwork into print-ready 4×6in PDF stickers, and keeps a reusable library
of them in a folder on disk.

Import images → preview every size and product type → edit labels → download a
ZIP. The library persists, so re-requesting an old artwork in a different size
later is a filter, not a re-import.

An internal tool for two people. It runs in the browser with no server and no
accounts.

## How it works

The image is the record. An uploaded image becomes a **sticker**; size and
product type are **axes of a request**, not properties of the sticker. One
image therefore implies every size × type variant at all times, and nothing is
rendered until someone asks for it.

Storage is one folder on disk: `stickers.json` is the index and `masters/`
holds the source images. The app picks the folder once and remembers it. It
never calls a Google API — the folder is synced between machines by the Google
Drive desktop client, which is not the app's problem.

Requires Chrome or Edge for `showDirectoryPicker`.

See `docs/v2-plan.md` for the design, `docs/adr/0001-image-centric-model.md` for
why the image is the record, and `docs/adr/0002-local-folder-storage.md` for why
there is no Drive integration.

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

### The library folder

Not wired up yet — first build step. Point it at a Drive- or Dropbox-synced
folder and both machines share the library with no integration work.

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

Renderer, slot math, unit system, filename parsing and key normalization are
done and tested. The remaining work is open issues; build order is in
`docs/v2-plan.md` §7.
