# ADR-0002 — A synced folder, not the Drive API

Date: 2026-09-09
Status: Accepted
Supersedes the storage decision in ADR-0001's plan (`docs/v2-plan.md` §2)

## Context

The first plan specified Google Drive as the store, reached through the Drive
REST API with browser OAuth: a `drive.file` scope, the Google Picker for folder
selection, a client id managed as a repo secret, token refresh handling, and
last-write-wins conflict handling on a shared `catalog.json`. Three of the
nineteen planned issues were blocking spikes for it, one of which was a paid
annual security assessment risk.

That was designed for a product with unknown users on unknown machines.

The actual situation: **two people**, both on Windows, both already running the
Google Drive desktop client, generating stickers to send to one client. The tool
runs locally and may sit on GitHub Pages for convenience.

## Decision

Store the library in an ordinary folder on disk that both machines already sync.
The app picks it once via `showDirectoryPicker()`, persists the
`FileSystemDirectoryHandle` in IndexedDB, and re-requests permission with one
click on later visits. It never calls a Google API.

```
<synced folder>/
├── stickers.json
├── masters/
├── upc-lookup.csv
└── out/
```

## Consequences

**Good**

- Deletes OAuth, the Drive client, the Picker, token handling, the consent
  screen, the CASA assessment question, and the shared-account problem —
  roughly a third of the planned work and all three blocking spikes.
- No credentials exist, so there are none to share, rotate, or leak.
- Sync is handled by software both machines already run and neither of us has
  to maintain.
- The folder is directly inspectable: when something looks wrong, you open it.

**Costs**

- `showDirectoryPicker` is Chrome and Edge only. Acceptable for two known users;
  the app must say so plainly rather than fail obscurely in Firefox or Safari.
- Simultaneous edits to `stickers.json` can conflict, with no merge logic. At
  two users, the mitigation is not coordinating but the sync client's version
  history.
- If the tool is ever deployed on GitHub Pages, the *hosted* copy still needs a
  local folder on whoever opens it — it does not carry the library with it.

**Rejected alternatives**

- *Keep the Drive API.* Buys network access to a folder from any device, which
  neither of two people on their own laptops needs.
- *Downloads only, no persistent library.* Would drop the requirement that
  motivated the rebuild: re-requesting an old artwork in a different size later.

## Note

ADR-0001 (the image is the record) is unaffected and still stands. This changes
only where the bytes live.
