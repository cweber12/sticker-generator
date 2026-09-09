# Sticker fonts

Two faces are used on the sticker label itself:

| Role | File expected here | v1 used |
|---|---|---|
| Art name | `sticker-name.woff2` | Baskerville Display PT |
| Subtitle | `sticker-subtitle.woff2` | Tw Cen MT |

These files are **not committed** — see `.gitignore`. Drop them in here for
local development, and add them to the deploy artifact for production.

## Why this exists

v1 referenced these families directly in `ctx.font` with no `@font-face` rule.
Canvas does not error on a missing font; it silently substitutes. Stickers
rendered correctly only on a machine with the fonts installed locally, so a
second person exporting the same batch would get different typography with no
warning — while the app claimed exact font fidelity as the reason for
rasterizing the PDF.

`src/render/fonts.ts` now verifies by measurement that the intended face is
actually in use, and the UI warns when it is not.

## Before you commit to this approach

Check the license. Desktop font licenses frequently **exclude** webfont
embedding, which is what `@font-face` is. If these faces cannot be served,
the options are:

1. License a webfont version of each.
2. Substitute visually similar faces that permit web embedding
   (e.g. Libre Baskerville, Josefin Sans) and re-approve a printed proof.
3. Move rendering server-side, where a desktop license may apply.

This is a licensing decision, not a technical one — resolve it before building
further on the assumption that these two families are available.

## Converting

```sh
npx woff2_compress BaskervilleDisplayPT.ttf   # → .woff2
mv BaskervilleDisplayPT.woff2 public/fonts/sticker-name.woff2
```

## A note on the build warning

While these files are absent, `vite build` prints:

```
/fonts/sticker-name.woff2 ... didn't resolve at build time
```

That is expected and harmless. Once the files are present Vite resolves them
and rewrites the URL with the deploy base
(`/sticker-generator/fonts/sticker-name.woff2`) — verified.
