# Sticker Generator Context

Defines canonical domain language so UI labels, file names, Drive folders and
code all use the same terms.

## Language

**Sticker**:
One uploaded artwork, plus the label metadata attached to it. Persistent; one
record per artwork in `catalog.json`. A sticker has no size and no product type.
_Avoid_: row, item, product

**Sticker Request**:
An ask for one specific rendering — a sticker plus a size, a type, and the mark
toggles. Ephemeral; never persisted. A download is a list of these.
_Avoid_: job, export row

**Variant**:
One size × type pair, e.g. `16x20|DAK`. Every sticker implies every variant at
all times; variants are enumerated, never stored.
_Avoid_: version, SKU (a SKU is the retail product, which is what the UPC
lookup file is keyed on)

**Mark**:
Either of the two optional elements in the right of the label strip — the
**barcode** or the **diamond logo**. The two are independent booleans and both
are valid on any product type.
_Avoid_: mark mode, diamond art mark mode (v1 modelled these as one mutually
exclusive setting scoped to Diamond Art; v2 does not)

**Template**:
The global label geometry — insets, heights, padding, font sizes. Stored in
inches and points. One template per catalog.
_Avoid_: layout config, design units

**Override**:
A sparse patch on top of the template, held per sticker (and rarely per
variant). An absent key inherits. Reverting a field deletes the key.
_Avoid_: per-sticker layout, custom layout

**Master**:
The source image as imported, stored once in `masters/` inside the library
folder. Never modified; every rendering derives from it.
_Avoid_: original, source file

**Library folder**:
The folder on disk holding `stickers.json`, `masters/` and optionally
`upc-lookup.csv`. Synced between machines by the Google Drive desktop client;
the app treats it as an ordinary folder and never calls a Drive API.
_Avoid_: Drive, the cloud, the repository

## Relationships

- A **Sticker** implies every **Variant**; none are stored.
- A **Sticker Request** = a **Sticker** + a **Variant** + **Marks**.
- **Marks** are independent of product type; type supplies only a default.
- An **Override** patches the **Template** for one **Sticker**.
- A **UPC** is looked up from `upc-lookup.csv` by art name + size + type; a
  miss renders no barcode and is never fatal.
- The **Library folder** holds every **Master** and one `stickers.json`.

## Example dialogue

> **Dev:** "Where do I store the 16×20 Diamond Art version of this image?"
> **Domain expert:** "You don't. That's a **variant** — it's implied. You store
> one **master** and render it when someone requests it."

## Flagged ambiguities

- "Diamond Art mark mode" (v1) collapsed two independent ideas — which mark is
  shown, and which product type it applies to — into one global setting.
  Resolved: **Marks** are independent booleans, valid on any type.
- "Version" was used for both a size/type combination and an edit history.
  Resolved canonical term for the former: **Variant**.
