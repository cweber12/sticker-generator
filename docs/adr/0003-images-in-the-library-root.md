# ADR-0003 — The folder is the library

Date: 2026-09-09
Status: Accepted
Supersedes the `masters/` layout in ADR-0002 and `docs/v2-plan.md` §2

## Context

ADR-0002 put the library in a synced folder laid out like this:

```
<synced folder>/
├── stickers.json
├── masters/        ← every source image, copied in by an Import step
└── upc-lookup.csv
```

Images entered only through an Import button, which copied each file into
`masters/` under a slugified, collision-suffixed name.

Using it for the first time exposed the cost. Pointing the app at a folder
holding thirty-seven images showed an empty grid and the words "Nothing in this
library yet", because none of them had been imported. The obvious repair —
import them — produced a second copy of all thirty-seven inside `masters/`,
in the same synced folder, under different names.

The defence offered for `masters/` was that the library must own its bytes, so
that an artwork stays renderable after the original is moved or deleted; that
filenames need normalising; and that collisions need resolving. All three are
arguments for **copying on import**, and none of them is an argument for the
subfolder. Only "keep artwork separate from `upc-lookup.csv`" was actually about
nesting, and that is worth very little.

## Decision

Masters live directly in the library folder. Every image in it is a sticker.

```
<synced folder>/
├── stickers.json
├── Sunset Beach.png
├── Harbour Lights.jpg
└── upc-lookup.csv
```

`stickers.json` stops being a registry of what exists and becomes a **metadata
overlay** — art names, marks, template overrides — keyed by filename. The
folder listing is the list of stickers.

- **Adopt on sight.** Any image without a record gets one when the folder is
  read. There is no import gate. Dropping a file in with Explorer, or letting
  the sync client deliver one from the other machine, is how artwork arrives.
- **The filename is the id.** It is already unique within a folder, and it is
  deterministic, so both machines independently adopting the same synced image
  agree on what to call it. `stickers.json` stays readable and diffable in the
  sync client's version history.
- **A record whose file is absent is not deleted.** It is skipped when
  building the grid, and re-links if the file reappears. A sync client can make
  a file briefly missing, and discarding someone's overrides over a transient
  miss is not recoverable. Stale records are inert and cost bytes.
- **Import survives as a convenience**, copying files chosen from elsewhere
  into the folder. It no longer renames anything, and a name already taken is
  skipped rather than overwritten or silently suffixed — the folder is the
  user's to manage now.

## Consequences

**Good**

- The confusing case disappears: point at a folder of artwork and it is the
  library, immediately.
- Sync works in the direction people expect. The other machine drops a file in
  the shared folder and it is a sticker for both of you, with no ceremony.
- Deletes collision handling, name normalisation, `freeName`, and the copy step
  from the ingest path. Meaningfully less code, in line with AGENTS.md: prefer
  the smaller option, do not build infrastructure for users who do not exist.
- The folder is inspectable with the names you gave the files, not slugs.
- One copy of each image, not two.

**Costs**

- Any image dropped in becomes a sticker, including one put there by mistake.
  With two people and one folder, the mitigation is not putting it there.
- The filename is the join key as typed, so renaming a file on disk orphans its
  overrides and adopts the new name as a fresh sticker. Under `masters/` the
  app owned the name and you could not break it by accident.
- Adopting writes `stickers.json`, so opening the app can save. It writes only
  when something was actually adopted, which keeps two idle tabs from
  overwriting each other, but the last-write-wins exposure of ADR-0002 is
  unchanged.
- Nothing notifies an open tab that the folder changed, so there is a Rescan
  button.

**Rejected alternatives**

- *Keep `masters/`, add root scanning.* The app would offer to import loose
  images in one click. Fixes the symptom while keeping the duplication and the
  folder that caused the confusion.
- *Delete records whose file is missing.* Truer to "the folder is the list",
  but it makes a sync hiccup destroy overrides.

## Note

ADR-0001 (the image is the record) is not merely unaffected — this is a more
literal reading of it. The image was previously the record only after being
copied into a place the app controlled. Now the file itself is the record.
