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

**Basket**:
The **Sticker Requests** a download will render, gathered one group at a time.
Ephemeral like the requests in it; a request leaves the basket only by being
downloaded or removed.
_Avoid_: cart, order, queue, batch (v1 used "batch" for a screen, not a list)

**Selection**:
The stickers currently ticked in the grid. Staging only — it says what the next
**Add** will put in the **Basket**, and survives that Add so the same stickers
can be added again at another **Variant**.
_Avoid_: basket (the selection is stickers; the basket is requests)

**Variant**:
One size × type pair, e.g. `16x20|DAK`. Every sticker implies every variant at
all times; variants are enumerated, never stored.
_Avoid_: version, SKU (a SKU is the retail product, which is what the UPC
lookup file is keyed on), filter (the size and type controls never removed a
card from the grid — they choose the variant everything is drawn as)

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
The source image, sitting directly in the library folder. Never modified; every
rendering derives from it. Its filename is the sticker's identity (ADR-0003).
_Avoid_: original, source file

**Library folder**:
The folder on disk holding every **Master**, `stickers.json`, and optionally
`upc-lookup.csv`. Synced between machines by a desktop sync client; the app
treats it as an ordinary folder and never calls a cloud API. The folder listing
IS the library: every image in it is a **Sticker** (ADR-0003).
_Avoid_: Drive, the cloud, the repository

## Relationships

- Every image in the **Library folder** is a **Sticker**; putting one there is
  how a sticker comes to exist.
- A **Sticker** implies every **Variant**; none are stored.
- A **Sticker Request** = a **Sticker** + a **Variant** + **Marks**.
- A **Basket** holds **Sticker Requests**; two requests for the same sticker at
  different **Variants** are different requests.
- **Add** turns the **Selection** × the current **Variant** into requests in the
  **Basket**. The **Selection** is not the **Basket**.
- **Marks** are independent of product type; type supplies only a default.
- An **Override** patches the **Template** for one **Sticker**.
- A **UPC** is looked up from `upc-lookup.csv` by art name + size + type; a
  miss renders no barcode and is never fatal.
- The **Library folder** holds every **Master** and one `stickers.json`, which
  is a metadata overlay keyed by **Master** filename, not a list of what exists.

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
