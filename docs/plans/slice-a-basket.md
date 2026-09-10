# Slice A — The Basket: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a download a set of `Sticker × Variant` requests gathered in a basket, so one order can ask for different stickers at different sizes and types, and the same artwork at more than one.

**Architecture:** Selection splits in two. `selected` stays as it is — the stickers ticked in the grid, staging only. A new `basket: ReadonlySet<RequestKey>` holds `` `${stickerId}|${size}|${type}` `` entries. **Add** unions `selected × the bar's current variant` into the basket and deliberately does **not** clear the ticks. Marks stop being per-request and become a property of the download, applied to the whole basket at render time. All key handling and ordering lives in one pure module, `src/lib/basket.ts`, so the rules are unit-testable without canvas or the filesystem.

**Tech Stack:** React 19 + TypeScript (strict), Zustand, Tailwind v4 (CSS-based, no config file), Vitest + jsdom + @testing-library/react, JSZip.

**Spec:** `docs/adr/0004-the-basket-of-requests.md` (the decision and rejected alternatives), `CONTEXT.md` (the language), `docs/v2-plan.md` (the surrounding app).

## Global Constraints

- **Domain language is binding.** `CONTEXT.md` is the glossary. **Variant** = one size × type pair, nothing more. **Basket** = the Sticker Requests a download will render. **Selection** = the stickers ticked in the grid. Do not call the size/type controls "filters" — they never filtered anything; search is the only filter.
- **Do not widen `VariantKey`.** `variantKey(size, type)` → `"16x20|DAK"` is persisted in `stickers.json` as the key of `variantOverrides`. `RequestKey` is a **new, separate** type and must not be substituted for it.
- **Two requests at the same variant are byte-identical PDFs.** `stickerFilename()` is `ArtName_DAK_16x20.pdf` — size and type only. The basket is therefore a `Set`, and Add is a union. A duplicate has no meaning in this domain.
- **Add must not clear `selected`.** This is the opposite of a shopping cart and it is deliberate: it is what makes "the same five stickers at a second variant" one extra click.
- **Do not change the card's click target in this slice.** Maximize does not exist until Slice B. The card stays a `<button>` that selects; a *visual* checkbox indicator is added inside it. Moving selection onto a real `<input>` happens in Slice B, when image-click has something to open.
- **Nothing throws in the download path.** A sticker whose master has gone missing costs that one PDF and a line in the notices, never the other thirty-nine.
- **Internal tool for two people** (`AGENTS.md`). Prefer the smaller option every time. No new dependencies.
- **Commit convention** (`.github/copilot-instructions.md`): `type(scope): short description`. Types `feat|fix|refactor|style|chore|docs|test`; scopes `render|fs|grid|editor|store|config|lib|ui`.
- **Verification command for every task:** `npm run test:run && npm run typecheck && npm run typecheck:test && npm run lint`.

---

## File Structure

**Create**

| File | Responsibility |
|---|---|
| `src/lib/basket.ts` | Pure. `RequestKey` encode/decode, Add as a union, deterministic ordering, grouping for the panel. No React, no I/O. |
| `src/lib/basket.test.ts` | Unit tests for the above. |
| `src/components/BasketPanel.tsx` | The right slide-out: grouped rows, thumbnails, remove, empty, Download. |

**Modify**

| File | Change |
|---|---|
| `src/types/index.ts` | Drop `defaultMarks` from `Sticker`. Replace `Filters` with `Variant`. |
| `src/fs/library.ts` | `stickerFor` and `syncLibrary` lose their `defaultMarks` parameter; `normalizeSticker` stops writing the field. |
| `src/fs/library.test.ts` | Update call sites and the `stickerFor` assertion. |
| `src/lib/zip.ts` | `Archive` gains `succeeded: RequestKey[]`. |
| `src/store/useAppStore.ts` | `filters` → `variant` + `marks`; add `basket`, `basketOpen` and their actions; `downloadSelected` → `downloadBasket`. |
| `src/store/useAppStore.test.ts` | Basket behaviour tests. |
| `src/components/FilterBar.tsx` → `src/components/RequestBar.tsx` | Renamed. Gains **Add to basket** and the basket toggle; loses **Download**. |
| `src/components/StickerCard.tsx` | Visual checkbox indicator; basket count chip. |
| `src/components/StickerGrid.tsx` | Reads `variant`/`marks` instead of `filters`; passes each card its basket count. |
| `src/App.tsx` | Mounts `RequestBar` and `BasketPanel` side by side. |
| `src/index.css` | Layout for the grid-plus-panel row. |
| `.github/copilot-instructions.md`, `docs/v2-plan.md` | Bring the module list and screen sketch up to date. |

---

## Task 1: `lib/basket.ts` — the pure rules

**Files:**
- Create: `src/lib/basket.ts`
- Test: `src/lib/basket.test.ts`

**Interfaces:**
- Consumes: `SizeId`, `TypeId`, `SIZES`, `TYPES` from `@/config/variants`; `Sticker`, `StickerRequest` from `@/types`; `Marks` from `@/render/slots`.
- Produces:
  - `type RequestKey = string`
  - `requestKey(stickerId: string, size: SizeId, type: TypeId): RequestKey`
  - `parseRequestKey(key: RequestKey): { stickerId: string; size: SizeId; type: TypeId } | null`
  - `addVariant(basket: ReadonlySet<RequestKey>, stickerIds: Iterable<string>, size: SizeId, type: TypeId): Set<RequestKey>`
  - `basketRequests(basket: ReadonlySet<RequestKey>, order: readonly Sticker[], marks: Marks): StickerRequest[]`
  - `stickerCount(basket: ReadonlySet<RequestKey>): number`
  - `interface BasketGroup { stickerId: string; sticker: Sticker | null; entries: { key: RequestKey; size: SizeId; type: TypeId }[] }`
  - `groupBasket(basket: ReadonlySet<RequestKey>, order: readonly Sticker[]): BasketGroup[]`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/basket.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  addVariant,
  basketRequests,
  groupBasket,
  parseRequestKey,
  requestKey,
  stickerCount,
} from './basket';
import type { Sticker } from '@/types';

const MARKS = { barcode: true, logo: false };

function sticker(masterFile: string): Sticker {
  const artName = masterFile.replace(/\.\w+$/, '');
  return {
    id: masterFile,
    artName,
    slug: artName.toLowerCase().replace(/\s+/g, '-'),
    masterFile,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    overrides: {},
    variantOverrides: {},
  };
}

describe('requestKey', () => {
  it('joins the sticker id, the size and the type', () => {
    expect(requestKey('Sunset Beach.png', '16x20', 'DAK')).toBe('Sunset Beach.png|16x20|DAK');
  });

  it('round-trips through parseRequestKey', () => {
    const key = requestKey('Sunset Beach.png', '8x10', 'PBN');
    expect(parseRequestKey(key)).toEqual({
      stickerId: 'Sunset Beach.png',
      size: '8x10',
      type: 'PBN',
    });
  });

  it('parses a filename that itself contains a separator', () => {
    // Ids are filenames. Size and type ids never contain "|", so the split
    // has to come from the right or an odd filename loses its tail.
    const key = requestKey('Odd|Name.png', '16x20', 'DAK');
    expect(parseRequestKey(key)?.stickerId).toBe('Odd|Name.png');
  });

  it('rejects a key with an unknown size or type rather than guessing', () => {
    expect(parseRequestKey('Art.png|20x24|DAK')).toBeNull();
    expect(parseRequestKey('Art.png|16x20|XYZ')).toBeNull();
    expect(parseRequestKey('nonsense')).toBeNull();
  });
});

describe('addVariant', () => {
  it('adds one entry per sticker at the given variant', () => {
    const next = addVariant(new Set(), ['a.png', 'b.png'], '16x20', 'DAK');
    expect([...next].sort()).toEqual(['a.png|16x20|DAK', 'b.png|16x20|DAK']);
  });

  it('is idempotent — a second Add at the same variant changes nothing', () => {
    const once = addVariant(new Set(), ['a.png'], '16x20', 'DAK');
    const twice = addVariant(once, ['a.png'], '16x20', 'DAK');
    expect([...twice]).toEqual([...once]);
  });

  it('keeps the same sticker at a second variant as a separate entry', () => {
    const first = addVariant(new Set(), ['a.png'], '16x20', 'DAK');
    const second = addVariant(first, ['a.png'], '8x10', 'PBN');
    expect([...second].sort()).toEqual(['a.png|16x20|DAK', 'a.png|8x10|PBN']);
  });

  it('does not mutate the basket it was given', () => {
    const before = new Set(['a.png|16x20|DAK']);
    addVariant(before, ['b.png'], '8x10', 'PBN');
    expect(before.size).toBe(1);
  });
});

describe('stickerCount', () => {
  it('counts distinct stickers, not entries', () => {
    expect(stickerCount(new Set(['a.png|16x20|DAK', 'a.png|8x10|PBN', 'b.png|8x10|PBN']))).toBe(2);
  });

  it('ignores a key it cannot parse', () => {
    expect(stickerCount(new Set(['nonsense']))).toBe(0);
  });
});

describe('basketRequests', () => {
  const order = [sticker('Aaa.png'), sticker('Bbb.png')];

  it('carries the download marks onto every request', () => {
    const basket = new Set(['Aaa.png|16x20|DAK']);
    expect(basketRequests(basket, order, { barcode: false, logo: true })).toEqual([
      { stickerId: 'Aaa.png', size: '16x20', type: 'DAK', barcode: false, logo: true },
    ]);
  });

  it('comes out in library order, then size order, then type order', () => {
    const basket = new Set(['Bbb.png|8x10|DAK', 'Aaa.png|16x20|PBN', 'Aaa.png|8x10|DAK']);
    expect(
      basketRequests(basket, order, MARKS).map((r) => `${r.stickerId} ${r.size} ${r.type}`),
    ).toEqual(['Aaa.png 8x10 DAK', 'Aaa.png 16x20 PBN', 'Bbb.png 8x10 DAK']);
  });

  it('skips an entry whose sticker is not in the folder right now', () => {
    // ADR-0003: absence may be a sync client mid-write. The entry stays in
    // the basket; it simply is not rendered this time.
    const basket = new Set(['Gone.png|16x20|DAK', 'Aaa.png|16x20|DAK']);
    expect(basketRequests(basket, order, MARKS).map((r) => r.stickerId)).toEqual(['Aaa.png']);
  });
});

describe('groupBasket', () => {
  const order = [sticker('Aaa.png'), sticker('Bbb.png')];

  it('groups a sticker’s variants together, in library order', () => {
    const basket = new Set(['Bbb.png|8x10|DAK', 'Aaa.png|16x20|PBN', 'Aaa.png|8x10|DAK']);
    const groups = groupBasket(basket, order);

    expect(groups.map((g) => g.stickerId)).toEqual(['Aaa.png', 'Bbb.png']);
    expect(groups[0].entries.map((e) => `${e.size} ${e.type}`)).toEqual(['8x10 DAK', '16x20 PBN']);
  });

  it('keeps a missing sticker as a group with no record, listed last', () => {
    const basket = new Set(['Gone.png|16x20|DAK', 'Aaa.png|16x20|DAK']);
    const groups = groupBasket(basket, order);

    expect(groups.map((g) => g.stickerId)).toEqual(['Aaa.png', 'Gone.png']);
    expect(groups[0].sticker).not.toBeNull();
    expect(groups[1].sticker).toBeNull();
  });

  it('drops a key that does not parse rather than rendering a broken row', () => {
    expect(groupBasket(new Set(['nonsense']), order)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/basket.test.ts`
Expected: FAIL — `Failed to resolve import "./basket"`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/basket.ts`:

```ts
import type { SizeId, TypeId } from '@/config/variants';
import { SIZES, TYPES } from '@/config/variants';
import type { Marks } from '@/render/slots';
import type { Sticker, StickerRequest } from '@/types';

/**
 * The basket, as a set of keys.
 *
 * A basket entry is a Sticker + a Variant, and nothing else. Marks are NOT
 * part of it: `stickerFilename()` is `ArtName_DAK_16x20.pdf`, so two entries
 * differing only by marks would produce the same filename and the difference
 * would be invisible to whoever prints them. Marks belong to the download —
 * see docs/adr/0004-the-basket-of-requests.md.
 *
 * Distinct from `VariantKey` in config/variants.ts, which is persisted as the
 * key of `variantOverrides` in stickers.json. These two must not be conflated.
 */
export type RequestKey = string;

const SEP = '|';

export function requestKey(stickerId: string, size: SizeId, type: TypeId): RequestKey {
  return `${stickerId}${SEP}${size}${SEP}${type}`;
}

/**
 * Splits from the RIGHT, because the id is a filename and a filename is not
 * ours to constrain. Size and type ids are enumerated in variants.ts and never
 * contain a separator, so the last two fields are unambiguous.
 *
 * Returns null for a size or type this build does not know, rather than
 * inventing one: a key written by a future version is not a rendering job.
 */
export function parseRequestKey(
  key: RequestKey,
): { stickerId: string; size: SizeId; type: TypeId } | null {
  const parts = key.split(SEP);
  if (parts.length < 3) return null;

  const type = parts[parts.length - 1];
  const size = parts[parts.length - 2];
  const stickerId = parts.slice(0, -2).join(SEP);

  if (!stickerId) return null;
  if (!SIZES.some((s) => s.id === size)) return null;
  if (!TYPES.some((t) => t.id === type)) return null;

  return { stickerId, size, type };
}

/**
 * Add, as a union.
 *
 * Adding a sticker already in the basket at that variant is a no-op — two
 * requests at one variant are byte-identical PDFs, so a duplicate has no
 * meaning and the model should not be able to hold one.
 */
export function addVariant(
  basket: ReadonlySet<RequestKey>,
  stickerIds: Iterable<string>,
  size: SizeId,
  type: TypeId,
): Set<RequestKey> {
  const next = new Set(basket);
  for (const id of stickerIds) next.add(requestKey(id, size, type));
  return next;
}

/** How many distinct stickers the basket touches — the "7 stickers" half of the count. */
export function stickerCount(basket: ReadonlySet<RequestKey>): number {
  const ids = new Set<string>();
  for (const key of basket) {
    const parsed = parseRequestKey(key);
    if (parsed) ids.add(parsed.stickerId);
  }
  return ids.size;
}

/**
 * The basket as a render list.
 *
 * Ordered by the library, then by size, then by type, so the archive comes out
 * in the same order as the grid it was picked from and two runs of the same
 * basket produce the same ZIP.
 *
 * An entry whose sticker is not in `order` is skipped rather than failed: the
 * caller keeps it in the basket, because a file can be briefly missing while
 * the sync client writes it (ADR-0003).
 */
export function basketRequests(
  basket: ReadonlySet<RequestKey>,
  order: readonly Sticker[],
  marks: Marks,
): StickerRequest[] {
  const requests: StickerRequest[] = [];

  for (const sticker of order) {
    for (const size of SIZES) {
      for (const type of TYPES) {
        if (!basket.has(requestKey(sticker.id, size.id, type.id))) continue;
        requests.push({
          stickerId: sticker.id,
          size: size.id,
          type: type.id,
          barcode: marks.barcode,
          logo: marks.logo,
        });
      }
    }
  }

  return requests;
}

/** One sticker's worth of basket entries, for a panel row. */
export interface BasketGroup {
  stickerId: string;
  /** null when the file is not in the folder right now — the row greys out. */
  sticker: Sticker | null;
  entries: { key: RequestKey; size: SizeId; type: TypeId }[];
}

/**
 * The basket as panel rows: present stickers in library order, then whatever
 * is no longer in the folder, so a disappearance is visible rather than
 * silently shrinking the order.
 */
export function groupBasket(
  basket: ReadonlySet<RequestKey>,
  order: readonly Sticker[],
): BasketGroup[] {
  const groups = new Map<string, BasketGroup>();
  const byId = new Map(order.map((sticker) => [sticker.id, sticker]));

  const add = (stickerId: string, entry: BasketGroup['entries'][number]) => {
    const group = groups.get(stickerId);
    if (group) {
      group.entries.push(entry);
      return;
    }
    groups.set(stickerId, {
      stickerId,
      sticker: byId.get(stickerId) ?? null,
      entries: [entry],
    });
  };

  // Present stickers first, in library order and canonical variant order.
  for (const sticker of order) {
    for (const size of SIZES) {
      for (const type of TYPES) {
        const key = requestKey(sticker.id, size.id, type.id);
        if (basket.has(key)) add(sticker.id, { key, size: size.id, type: type.id });
      }
    }
  }

  // Then anything the folder no longer has, in whatever order it was added.
  for (const key of basket) {
    const parsed = parseRequestKey(key);
    if (!parsed || byId.has(parsed.stickerId)) continue;
    add(parsed.stickerId, { key, size: parsed.size, type: parsed.type });
  }

  return [...groups.values()];
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/basket.test.ts`
Expected: PASS, 16 tests.

- [ ] **Step 5: Verify the whole suite and commit**

```bash
npm run test:run && npm run typecheck && npm run typecheck:test && npm run lint
git add src/lib/basket.ts src/lib/basket.test.ts
git commit -m "feat(lib): a basket is a set of sticker x variant keys"
```

---

## Task 2: Remove `defaultMarks` from the model

`Sticker.defaultMarks` is written on adoption, persisted, parsed back — and read by no render path. The model promised per-sticker marks that nothing delivered. ADR-0004 decides marks belong to the download, so the field goes.

`TypeDef.defaultMarks` in `config/variants.ts` **stays**. `CONTEXT.md` says "type supplies only a default", and it keeps exactly one live consumer: the store's initial `marks`.

**Files:**
- Modify: `src/types/index.ts`, `src/fs/library.ts`, `src/fs/library.test.ts`, `src/store/useAppStore.ts`

**Interfaces:**
- Produces: `stickerFor(masterFile: string): Sticker` and `syncLibrary(dir, library): Promise<SyncResult>` — both one parameter shorter. Task 4 relies on these signatures.

- [ ] **Step 1: Update the tests first**

In `src/fs/library.test.ts`, change the `stickerFor` block to drop the argument and the assertion:

```ts
describe('stickerFor', () => {
  it('takes its identity from the filename', async () => {
    const sticker = stickerFor('01 - Sunset Beach_final.png');
    expect(sticker).toMatchObject({
      id: '01 - Sunset Beach_final.png',
      masterFile: '01 - Sunset Beach_final.png',
      artName: 'Sunset Beach',
      slug: 'sunset-beach',
      overrides: {},
    });
  });

  it('gives both machines the same id for the same file', () => {
    // Filenames, not UUIDs, so two people adopting the same synced image
    // independently agree on what to call it.
    expect(stickerFor('Sunset.png').id).toBe(stickerFor('Sunset.png').id);
  });
});
```

Then drop the trailing `MARKS` argument from every `syncLibrary(...)` call in the file (lines 137, 152, 155, 165, 167, 180, 190, 200, 297, 306) and delete the now-unused `MARKS` constant.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/fs/library.test.ts`
Expected: FAIL — `stickerFor` still requires 2 arguments.

- [ ] **Step 3: Change the model**

In `src/types/index.ts`, delete these two lines from `interface Sticker`:

```ts
  /** Marks pre-selected for this sticker. The filter bar can still override. */
  defaultMarks: Marks;
```

In the same file, replace `interface Filters` with:

```ts
/**
 * The Variant everything is currently drawn as, and that Add will use.
 *
 * NOT a filter: changing it removes no card from the grid. Search is the only
 * filter. Marks are deliberately absent — they belong to the download.
 */
export interface Variant {
  size: SizeId;
  type: TypeId;
}
```

Remove the now-unused `Marks` import from `src/types/index.ts` if nothing else in the file uses it.

In `src/fs/library.ts`:

```ts
export async function syncLibrary(
  dir: FileSystemDirectoryHandle,
  library: Library,
): Promise<SyncResult> {
```

and inside it:

```ts
    stickers: [...library.stickers, ...adopted.map((file) => stickerFor(file))],
```

and:

```ts
export function stickerFor(masterFile: string): Sticker {
  const { artName, slug } = parseFilename(masterFile);
  const now = new Date().toISOString();
  return {
    id: masterFile,
    artName,
    slug,
    masterFile,
    createdAt: now,
    updatedAt: now,
    overrides: {},
    variantOverrides: {},
  };
}
```

In `normalizeSticker`, delete the `const marks = ...` line and the whole `defaultMarks: { ... }` block. **Leave the `...raw` spread alone** — records already on disk keep their now-unread `defaultMarks` key, which is deliberate: rewriting every record to strip a dead key would be a pointless write to a synced file, and this file's own rule is that keys it does not recognise are preserved.

Remove the `Marks` import from `src/fs/library.ts` if it becomes unused.

- [ ] **Step 4: Fix the store's call sites so the build passes**

`src/store/useAppStore.ts` calls `syncLibrary` in three places with `marksFor(...)`, and `open()` takes a `marks` argument. Delete the `marksFor` function, drop `marks` from `open()`'s signature and its three call sites, and make the calls `syncLibrary(dir, library)` / `syncLibrary(handle, library)`. Remove `getType` from the `@/config/variants` import if it is now unused. Leave everything else in the store alone — the basket lands in Task 4.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm run test:run && npm run typecheck && npm run typecheck:test && npm run lint`
Expected: PASS, 100 tests, no type or lint errors.

- [ ] **Step 6: Commit**

```bash
git add src/types/index.ts src/fs/library.ts src/fs/library.test.ts src/store/useAppStore.ts
git commit -m "refactor(fs): drop the marks a sticker never used"
```

---

## Task 3: The archive reports which requests survived

Clearing "the ones that downloaded" needs request identity. `ArchiveFailure.label` is a display string and cannot serve.

**Files:**
- Modify: `src/lib/zip.ts`

**Interfaces:**
- Consumes: `requestKey`, `RequestKey` from `@/lib/basket` (Task 1).
- Produces: `Archive.succeeded: RequestKey[]` — Task 4 deletes exactly these keys from the basket.

- [ ] **Step 1: Add the field**

In `src/lib/zip.ts`, add the import:

```ts
import { requestKey, type RequestKey } from '@/lib/basket';
```

Extend the interface:

```ts
export interface Archive {
  blob: Blob | null;
  filename: string;
  /** How many PDFs are actually in the archive. */
  count: number;
  /**
   * The basket entries that really made it in.
   *
   * Identity, not a label: the caller empties exactly these from the basket
   * and leaves the failures behind, so a master that was mid-sync costs one
   * more press of Download rather than a re-assembled order.
   */
  succeeded: RequestKey[];
  failures: ArchiveFailure[];
}
```

- [ ] **Step 2: Populate it**

Declare it beside `failures`:

```ts
  const failures: ArchiveFailure[] = [];
  const succeeded: RequestKey[] = [];
```

Record it immediately after `count += 1;` in the try block:

```ts
      zip.file(filename, pdf);
      count += 1;
      succeeded.push(requestKey(request.stickerId, request.size, request.type));
```

And return it:

```ts
  return {
    blob: count > 0 ? await zip.generateAsync({ type: 'blob' }) : null,
    filename: archiveFilename(),
    count,
    succeeded,
    failures,
  };
```

- [ ] **Step 3: Verify and commit**

Run: `npm run test:run && npm run typecheck && npm run typecheck:test && npm run lint`
Expected: PASS — `zip.test.ts` only covers the pure filename helpers, which are untouched.

```bash
git add src/lib/zip.ts
git commit -m "feat(lib): report which requests made it into the archive"
```

---

## Task 4: The store — variant, marks and the basket

**Files:**
- Modify: `src/store/useAppStore.ts`
- Test: `src/store/useAppStore.test.ts`

**Interfaces:**
- Consumes: `addVariant`, `basketRequests`, `RequestKey` from `@/lib/basket`; `Archive.succeeded` from `@/lib/zip`; `Variant` from `@/types`; `Marks` from `@/render/slots`.
- Produces, on the store: `variant: Variant`, `marks: Marks`, `basket: ReadonlySet<RequestKey>`, `basketOpen: boolean`, `setVariant(patch: Partial<Variant>)`, `setMarks(patch: Partial<Marks>)`, `addToBasket()`, `removeFromBasket(key: RequestKey)`, `emptyBasket()`, `toggleBasket()`, `downloadBasket()`. `filters`, `setFilters` and `downloadSelected` are gone. Tasks 5-7 consume these.

- [ ] **Step 1: Write the failing tests**

In `src/store/useAppStore.test.ts`, add a mock for the zip module alongside the existing `vi.mock` calls:

```ts
vi.mock('@/lib/zip', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/zip')>();
  return {
    ...actual,
    buildStickerArchive: vi.fn(async () => ({
      blob: new Blob(['zip']),
      filename: 'stickers_2026-09-09.zip',
      count: 0,
      succeeded: [] as string[],
      failures: [] as { label: string; message: string }[],
    })),
    saveBlob: vi.fn(),
  };
});
```

Add `import * as zip from '@/lib/zip';` to the imports, and extend the existing `emptyLibrary` import to `import { emptyLibrary, stickerFor } from '@/fs/library';`.

In the existing `beforeEach`, add `basket: new Set<string>(),` and `basketOpen: false,` to the `useAppStore.setState({ ... })` reset.

Then append these suites:

```ts
/** A ready store holding stickers, as the folder would present them. */
function readyWith(...files: string[]) {
  useAppStore.setState({
    status: 'ready',
    dir: handle,
    library: { ...emptyLibrary(), stickers: files.map((file) => stickerFor(file)) },
    files,
  });
}

describe('addToBasket', () => {
  beforeEach(() => readyWith('Aaa.png', 'Bbb.png'));

  it('adds the selection at the current variant', () => {
    useAppStore.setState({
      selected: new Set(['Aaa.png']),
      variant: { size: '16x20', type: 'DAK' },
    });
    useAppStore.getState().addToBasket();
    expect([...useAppStore.getState().basket]).toEqual(['Aaa.png|16x20|DAK']);
  });

  it('leaves the selection ticked, so a second variant is one more click', () => {
    // Deliberately unlike a shopping cart: this is what makes "the same five
    // stickers, also at 8x10 PBN" one press rather than five.
    useAppStore.setState({
      selected: new Set(['Aaa.png']),
      variant: { size: '16x20', type: 'DAK' },
    });
    useAppStore.getState().addToBasket();
    expect([...useAppStore.getState().selected]).toEqual(['Aaa.png']);

    useAppStore.getState().setVariant({ size: '8x10', type: 'PBN' });
    useAppStore.getState().addToBasket();
    expect([...useAppStore.getState().basket].sort()).toEqual([
      'Aaa.png|16x20|DAK',
      'Aaa.png|8x10|PBN',
    ]);
  });

  it('adding twice at one variant changes nothing', () => {
    useAppStore.setState({ selected: new Set(['Aaa.png', 'Bbb.png']) });
    useAppStore.getState().addToBasket();
    useAppStore.getState().addToBasket();
    expect(useAppStore.getState().basket.size).toBe(2);
  });

  it('does nothing at all when nothing is ticked', () => {
    useAppStore.setState({ selected: new Set<string>() });
    useAppStore.getState().addToBasket();
    expect(useAppStore.getState().basket.size).toBe(0);
  });
});

describe('removeFromBasket / emptyBasket', () => {
  beforeEach(() => readyWith('Aaa.png', 'Bbb.png'));

  it('removes exactly one entry', () => {
    useAppStore.setState({ basket: new Set(['Aaa.png|16x20|DAK', 'Aaa.png|8x10|PBN']) });
    useAppStore.getState().removeFromBasket('Aaa.png|16x20|DAK');
    expect([...useAppStore.getState().basket]).toEqual(['Aaa.png|8x10|PBN']);
  });

  it('empties everything', () => {
    useAppStore.setState({ basket: new Set(['Aaa.png|16x20|DAK']) });
    useAppStore.getState().emptyBasket();
    expect(useAppStore.getState().basket.size).toBe(0);
  });
});

describe('downloadBasket', () => {
  beforeEach(() => readyWith('Aaa.png', 'Bbb.png'));

  it('renders the basket, not the selection', async () => {
    useAppStore.setState({
      selected: new Set(['Bbb.png']),
      basket: new Set(['Aaa.png|16x20|DAK']),
      marks: { barcode: false, logo: true },
    });

    await useAppStore.getState().downloadBasket();

    const [requests] = vi.mocked(zip.buildStickerArchive).mock.calls[0];
    expect(requests).toEqual([
      { stickerId: 'Aaa.png', size: '16x20', type: 'DAK', barcode: false, logo: true },
    ]);
  });

  it('empties the entries that downloaded and keeps the ones that did not', async () => {
    vi.mocked(zip.buildStickerArchive).mockResolvedValue({
      blob: new Blob(['zip']),
      filename: 'stickers.zip',
      count: 1,
      succeeded: ['Aaa.png|16x20|DAK'],
      failures: [{ label: 'Bbb (16x20 DAK)', message: 'gone' }],
    });

    useAppStore.setState({ basket: new Set(['Aaa.png|16x20|DAK', 'Bbb.png|16x20|DAK']) });

    await useAppStore.getState().downloadBasket();

    // Once downloaded they live in the ZIP and nowhere else; a failure never
    // downloaded, so it stays and one more press retries it.
    expect([...useAppStore.getState().basket]).toEqual(['Bbb.png|16x20|DAK']);
    expect(useAppStore.getState().notices.join(' ')).toMatch(/gone/);
  });

  it('does nothing when the basket is empty', async () => {
    useAppStore.setState({ basket: new Set<string>() });
    await useAppStore.getState().downloadBasket();
    expect(zip.buildStickerArchive).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/store/useAppStore.test.ts`
Expected: FAIL — `addToBasket is not a function`.

- [ ] **Step 3: Implement the store changes**

Imports — add `import { addVariant, basketRequests, type RequestKey } from '@/lib/basket';`, keep `Marks` from `@/render/slots`, and swap `Filters` for `Variant` in the `@/types` import. `StickerRequest` is no longer built here, so drop it.

State — replace the `filters` field in `interface AppState`:

```ts
  /** The Variant everything is drawn as, and that Add will use. Not a filter. */
  variant: Variant;
  /**
   * Marks for the DOWNLOAD, not for a request. The filename encodes size and
   * type only, so two entries differing by marks would be indistinguishable
   * in the ZIP — see docs/adr/0004-the-basket-of-requests.md.
   */
  marks: Marks;
  /** Sticker x Variant entries the download will render. */
  basket: ReadonlySet<RequestKey>;
  /** Whether the basket panel is open beside the grid. */
  basketOpen: boolean;
```

Declare the actions in `interface AppState` too:

```ts
  setVariant: (patch: Partial<Variant>) => void;
  setMarks: (patch: Partial<Marks>) => void;
  /** Selection x the current Variant, unioned in. Does NOT clear the ticks. */
  addToBasket: () => void;
  removeFromBasket: (key: RequestKey) => void;
  emptyBasket: () => void;
  toggleBasket: () => void;
  /** Renders the basket and saves one ZIP. */
  downloadBasket: () => Promise<void>;
```

Initial values — replace the `filters: { ... }` block:

```ts
  variant: { size: SIZES[0].id, type: TYPES[0].id },
  marks: { ...TYPES[0].defaultMarks },
  basket: new Set<RequestKey>(),
  basketOpen: false,
```

Implementations — replace `setFilters` and `downloadSelected`:

```ts
  setVariant: (patch) => set((s) => ({ variant: { ...s.variant, ...patch } })),
  setMarks: (patch) => set((s) => ({ marks: { ...s.marks, ...patch } })),

  /**
   * Selection x the current Variant, unioned into the basket.
   *
   * Does NOT clear the selection. That is what makes adding the same stickers
   * at a second variant one more press instead of a fresh round of ticking.
   */
  addToBasket: () => {
    const { selected, variant, basket } = get();
    if (selected.size === 0) return;
    set({ basket: addVariant(basket, selected, variant.size, variant.type) });
  },

  removeFromBasket: (key) =>
    set((s) => {
      const next = new Set(s.basket);
      next.delete(key);
      return { basket: next };
    }),

  emptyBasket: () => set({ basket: new Set<RequestKey>() }),
  toggleBasket: () => set((s) => ({ basketOpen: !s.basketOpen })),

  downloadBasket: async () => {
    const { dir, library, files, basket, marks, upcs } = get();
    if (!dir || !library || basket.size === 0) return;

    set({ busy: true, notices: [] });
    try {
      const requests = basketRequests(basket, presentStickers(library, files), marks);

      const archive = await buildStickerArchive(requests, {
        dir,
        template: library.template,
        stickersById: new Map(library.stickers.map((sticker) => [sticker.id, sticker])),
        upcs,
      });

      if (archive.blob) saveBlob(archive.blob, archive.filename);

      // Once downloaded they live in the ZIP and nowhere else. A failure never
      // downloaded, so it stays put and one more press retries it.
      const next = new Set(basket);
      for (const key of archive.succeeded) next.delete(key);

      const notices = archive.failures.map((f) => `${f.label} could not be rendered: ${f.message}`);
      if (!archive.blob) {
        notices.unshift('Nothing could be rendered, so no archive was downloaded.');
      }
      set({ basket: next, busy: false, notices });
    } catch (error) {
      set({ busy: false, notices: [messageOf(error)] });
    }
  },
```

In `disconnect`, add `basket: new Set<RequestKey>(),` and `basketOpen: false,` to the reset — a different folder's basket is meaningless. In `open()`, add `basket: new Set<RequestKey>(),` to the success `set({ ... })` for the same reason.

- [ ] **Step 4: Run the store tests to verify they pass**

Run: `npx vitest run src/store/useAppStore.test.ts`
Expected: PASS. `npm run typecheck` will still fail — `FilterBar` and `StickerGrid` reference `filters`. That is Tasks 5 and 6.

- [ ] **Step 5: Commit**

```bash
git add src/store/useAppStore.ts src/store/useAppStore.test.ts
git commit -m "feat(store): gather sticker x variant requests in a basket"
```

---

## Task 5: `RequestBar` — Add, and the counts

**Files:**
- Rename: `src/components/FilterBar.tsx` → `src/components/RequestBar.tsx`
- Modify: `src/App.tsx` (import + element name)

**Interfaces:**
- Consumes: `variant`, `marks`, `basket`, `basketOpen`, `selected`, `setVariant`, `setMarks`, `addToBasket`, `toggleBasket`, `selectAll`, `clearSelection`, `search`, `setSearch` from the store; `stickerCount` from `@/lib/basket`.
- Produces: `<RequestBar visibleIds={string[]} />`. Download is **not** here any more — it lives in `BasketPanel` (Task 7).

- [ ] **Step 1: Rename the file**

```bash
git mv src/components/FilterBar.tsx src/components/RequestBar.tsx
```

- [ ] **Step 2: Rewrite the component**

Replace the whole of `src/components/RequestBar.tsx` with:

```tsx
import { SIZES, TYPES } from '@/config/variants';
import { stickerCount } from '@/lib/basket';
import { useAppStore } from '@/store/useAppStore';

/**
 * The request being described.
 *
 * Size and type choose the VARIANT everything is drawn as and that Add will
 * use. They are not filters — they remove no card from the grid; the search
 * box is the only filter. The marks apply to the DOWNLOAD, so changing one
 * changes every PDF in the basket.
 */
export default function RequestBar({ visibleIds }: { visibleIds: readonly string[] }) {
  const variant = useAppStore((s) => s.variant);
  const setVariant = useAppStore((s) => s.setVariant);
  const marks = useAppStore((s) => s.marks);
  const setMarks = useAppStore((s) => s.setMarks);
  const search = useAppStore((s) => s.search);
  const setSearch = useAppStore((s) => s.setSearch);
  const selected = useAppStore((s) => s.selected);
  const selectAll = useAppStore((s) => s.selectAll);
  const clearSelection = useAppStore((s) => s.clearSelection);
  const addToBasket = useAppStore((s) => s.addToBasket);
  const basket = useAppStore((s) => s.basket);
  const basketOpen = useAppStore((s) => s.basketOpen);
  const toggleBasket = useAppStore((s) => s.toggleBasket);

  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
  // Two different numbers now: how many stickers are involved, and how many
  // PDFs come out. The second is what lands in the ZIP.
  const stickers = stickerCount(basket);

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-[var(--color-rule)] bg-[var(--color-surface)] px-4 py-2.5">
      <Group label="Size">
        {SIZES.map((size) => (
          <Choice
            key={size.id}
            active={variant.size === size.id}
            onClick={() => setVariant({ size: size.id })}
          >
            {size.label}
          </Choice>
        ))}
      </Group>

      <Group label="Type">
        {TYPES.map((type) => (
          <Choice
            key={type.id}
            active={variant.type === type.id}
            onClick={() => setVariant({ type: type.id })}
          >
            {type.short}
          </Choice>
        ))}
      </Group>

      {/* Independent booleans, valid on any product type — and a property of
          the download, so these apply to everything in the basket. */}
      <Check
        checked={marks.barcode}
        onChange={(barcode) => setMarks({ barcode })}
        label="Barcode"
        title="Applies to every sticker in the basket"
      />
      <Check
        checked={marks.logo}
        onChange={(logo) => setMarks({ logo })}
        label="Diamond logo"
        title="Applies to every sticker in the basket"
      />

      <input
        type="search"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Search art names"
        aria-label="Search art names"
        className="min-w-40 rounded-md border border-[var(--color-rule)] bg-[var(--color-paper)] px-2.5 py-1 text-sm focus:border-[var(--color-accent)] focus:outline-none"
      />

      <div className="ml-auto flex items-center gap-3">
        <span className="text-sm text-[var(--color-ink-3)]">{selected.size} selected</span>
        <button
          type="button"
          onClick={() => (allVisibleSelected ? clearSelection() : selectAll(visibleIds))}
          disabled={visibleIds.length === 0}
          className="text-sm text-[var(--color-ink-3)] underline underline-offset-2 hover:text-[var(--color-ink)] disabled:opacity-40 disabled:hover:text-[var(--color-ink-3)]"
        >
          {allVisibleSelected ? 'Clear' : 'Select all'}
        </button>
        <button
          type="button"
          onClick={addToBasket}
          disabled={selected.size === 0}
          title="Adds the ticked stickers at the current size and type. They stay ticked, so you can add them again at another variant."
          className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-white hover:bg-[var(--color-brand-600)] disabled:opacity-40"
        >
          Add to basket
        </button>
        <button
          type="button"
          onClick={toggleBasket}
          aria-expanded={basketOpen}
          className="rounded-md border border-[var(--color-rule)] px-3 py-1.5 text-sm text-[var(--color-ink-2)] hover:bg-[var(--color-paper-2)]"
        >
          Basket · {stickers} sticker{stickers === 1 ? '' : 's'} · {basket.size} PDF
          {basket.size === 1 ? '' : 's'}
        </button>
      </div>
    </div>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-medium tracking-wide text-[var(--color-ink-4)] uppercase">
        {label}
      </span>
      <div className="flex overflow-hidden rounded-md border border-[var(--color-rule)]">
        {children}
      </div>
    </div>
  );
}

function Choice({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`px-2.5 py-1 text-sm ${
        active
          ? 'bg-[var(--color-accent)] text-white'
          : 'bg-[var(--color-surface)] text-[var(--color-ink-2)] hover:bg-[var(--color-paper-2)]'
      }`}
    >
      {children}
    </button>
  );
}

function Check({
  checked,
  onChange,
  label,
  title,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  title: string;
}) {
  return (
    <label
      title={title}
      className="flex items-center gap-1.5 text-sm text-[var(--color-ink-2)] select-none"
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="accent-[var(--color-accent)]"
      />
      {label}
    </label>
  );
}
```

- [ ] **Step 3: Update `App.tsx`**

Change `import FilterBar from '@/components/FilterBar';` to `import RequestBar from '@/components/RequestBar';`, and `<FilterBar visibleIds={visibleIds} />` to `<RequestBar visibleIds={visibleIds} />`.

- [ ] **Step 4: Verify and commit**

Run: `npm run test:run && npm run typecheck && npm run typecheck:test && npm run lint`
Expected: `typecheck` still fails on `StickerGrid`, which still reads `filters` (Task 6). Everything else passes.

```bash
git add -A src/components src/App.tsx
git commit -m "feat(ui): add the selection to the basket at the current variant"
```

---

## Task 6: The card — a checkbox you can see, and a basket count

The card stays a `<button>` and the whole surface still selects. The checkbox is a **visual indicator**, not an `<input>`: a real one nested inside a button is invalid HTML, and moving selection onto it only makes sense in Slice B, when clicking the image has a detail view to open.

**Files:**
- Modify: `src/components/StickerCard.tsx`, `src/components/StickerGrid.tsx`
- Test: `src/components/StickerCard.test.tsx` (create)

**Interfaces:**
- Consumes: `basket` from the store (via the grid), `requestKey` from `@/lib/basket`.
- Produces: `StickerCardProps` gains `basketCount: number`.

- [ ] **Step 1: Write the failing test**

Create `src/components/StickerCard.test.tsx`:

```tsx
import type { ComponentProps } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import StickerCard from './StickerCard';
import { DEFAULT_TEMPLATE } from '@/config/template';
import { stickerFor } from '@/fs/library';

const dir = { kind: 'directory', name: 'Client Stickers' } as FileSystemDirectoryHandle;

function renderCard(overrides: Partial<ComponentProps<typeof StickerCard>> = {}) {
  const onSelect = vi.fn();
  render(
    <StickerCard
      sticker={stickerFor('Sunset Beach.png')}
      dir={dir}
      template={DEFAULT_TEMPLATE}
      artName="Sunset Beach"
      subtitle="16x20 Diamond Art Kit"
      marks={{ barcode: true, logo: false }}
      upc={null}
      selected={false}
      basketCount={0}
      onSelect={onSelect}
      {...overrides}
    />,
  );
  return { onSelect };
}

describe('StickerCard', () => {
  it('selects when the card is clicked', async () => {
    const { onSelect } = renderCard();
    await userEvent.click(screen.getByRole('button', { name: /Sunset Beach/ }));
    expect(onSelect).toHaveBeenCalledWith('Sunset Beach.png', false);
  });

  it('reports its selected state to assistive technology', () => {
    renderCard({ selected: true });
    expect(screen.getByRole('button', { name: /Sunset Beach/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('says how many variants of it are in the basket', () => {
    renderCard({ basketCount: 2 });
    expect(screen.getByTitle('In the basket at 2 variants')).toHaveTextContent('2');
  });

  it('shows no basket chip when it is not in the basket', () => {
    renderCard({ basketCount: 0 });
    expect(screen.queryByTitle(/In the basket/)).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/components/StickerCard.test.tsx`
Expected: FAIL — `basketCount` is not a valid prop, and no element carries that title.

- [ ] **Step 3: Update the card**

In `src/components/StickerCard.tsx`, add to `StickerCardProps`:

```ts
  /** How many variants of this sticker are in the basket. 0 hides the chip. */
  basketCount: number;
```

Destructure it alongside the rest. Replace the existing `{selected && (<span …>✓</span>)}` block with a checkbox indicator on the left and a basket chip on the right:

```tsx
      {/* A visual checkbox, not an <input> — a real one nested in a button is
          invalid HTML. Slice B splits the targets, when clicking the image has
          a detail view to open. */}
      <span
        aria-hidden
        className={`absolute top-1.5 left-1.5 grid h-[18px] w-[18px] place-items-center rounded border text-[11px] leading-none font-bold ${
          selected
            ? 'border-[var(--color-accent)] bg-[var(--color-accent)] text-white'
            : 'border-[var(--color-ink-4)] bg-white/90 text-transparent'
        }`}
      >
        ✓
      </span>

      {basketCount > 0 && (
        <span
          title={`In the basket at ${basketCount} variant${basketCount === 1 ? '' : 's'}`}
          className="absolute top-1.5 right-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-[var(--color-ink-2)] px-1 text-[11px] leading-none font-bold text-white"
        >
          {basketCount}
        </span>
      )}
```

Move the warning badge stack (`Render failed`, `No UPC`, `Label overflows`) down so it clears the checkbox — change its wrapper class from `absolute top-1.5 left-1.5` to `absolute top-8 left-1.5`.

- [ ] **Step 4: Wire the grid**

In `src/components/StickerGrid.tsx`, add imports:

```ts
import { SIZES, TYPES, variantKey } from '@/config/variants';
import { requestKey } from '@/lib/basket';
```

Replace the `filters` subscription with:

```ts
  const variant = useAppStore((s) => s.variant);
  const marks = useAppStore((s) => s.marks);
  const basket = useAppStore((s) => s.basket);
```

Debounce the pair together, so a run of clicks still renders once:

```ts
  const settled = useDebounced({ ...variant, ...marks }, FILTER_SETTLE_MS);
```

The body of `inputsById` needs no change — it already reads `settled.size`, `settled.type`, `settled.barcode` and `settled.logo`.

Add a count lookup beside it:

```ts
  /**
   * How many variants of each sticker sit in the basket. Built once for the
   * whole grid rather than scanned per card, so a forty-card grid does not do
   * forty passes over the basket on every paint.
   */
  const basketCounts = useMemo(() => {
    const counts = new Map<string, number>();
    if (!stickers) return counts;
    for (const sticker of stickers) {
      let n = 0;
      for (const size of SIZES) {
        for (const type of TYPES) {
          if (basket.has(requestKey(sticker.id, size.id, type.id))) n += 1;
        }
      }
      if (n > 0) counts.set(sticker.id, n);
    }
    return counts;
  }, [stickers, basket]);
```

and pass it to each card: `basketCount={basketCounts.get(sticker.id) ?? 0}`.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm run test:run && npm run typecheck && npm run typecheck:test && npm run lint`
Expected: PASS, all green — the app compiles end to end again.

- [ ] **Step 6: Commit**

```bash
git add src/components/StickerCard.tsx src/components/StickerCard.test.tsx src/components/StickerGrid.tsx
git commit -m "feat(grid): show what is ticked and what is already in the basket"
```

---

## Task 7: `BasketPanel` — the review surface

**Files:**
- Create: `src/components/BasketPanel.tsx`
- Modify: `src/App.tsx`, `src/index.css`

**Interfaces:**
- Consumes: `groupBasket`, `BasketGroup` from `@/lib/basket`; `loadMasterImage` from `@/fs/library`; `getSize`, `getType` from `@/config/variants`; `presentStickers` and the store's `basket`, `basketOpen`, `busy`, `dir`, `library`, `files`, `removeFromBasket`, `emptyBasket`, `downloadBasket`, `toggleBasket`.
- Produces: `<BasketPanel />`, rendered as a sibling of `StickerGrid`.

- [ ] **Step 1: Write the component**

Create `src/components/BasketPanel.tsx`:

```tsx
import { useEffect, useMemo, useRef } from 'react';
import { getSize, getType } from '@/config/variants';
import { loadMasterImage } from '@/fs/library';
import { groupBasket, type BasketGroup } from '@/lib/basket';
import { presentStickers, useAppStore } from '@/store/useAppStore';

/**
 * The basket, read before it ships.
 *
 * Download lives here and nowhere else, so opening the basket IS reviewing it.
 * Rows are grouped by sticker: one thumbnail answers "is this the right
 * artwork?", and the variant lines answer "is this the right size and type?" —
 * which a preview cannot, since every variant draws the same 4x6 label and
 * only the subtitle differs.
 */
export default function BasketPanel() {
  const open = useAppStore((s) => s.basketOpen);
  const basket = useAppStore((s) => s.basket);
  const library = useAppStore((s) => s.library);
  const files = useAppStore((s) => s.files);
  const busy = useAppStore((s) => s.busy);
  const removeFromBasket = useAppStore((s) => s.removeFromBasket);
  const emptyBasket = useAppStore((s) => s.emptyBasket);
  const downloadBasket = useAppStore((s) => s.downloadBasket);
  const toggleBasket = useAppStore((s) => s.toggleBasket);

  const groups = useMemo(
    () => groupBasket(basket, presentStickers(library, files)),
    [basket, library, files],
  );

  if (!open) return null;

  return (
    <aside
      aria-label="Basket"
      className="flex w-80 shrink-0 flex-col border-l border-[var(--color-rule)] bg-[var(--color-surface)]"
    >
      <header className="flex items-center gap-2 border-b border-[var(--color-rule)] px-3 py-2">
        <h2 className="text-sm font-semibold">Basket</h2>
        <span className="text-xs text-[var(--color-ink-3)]">
          {groups.length} sticker{groups.length === 1 ? '' : 's'} · {basket.size} PDF
          {basket.size === 1 ? '' : 's'}
        </span>
        <button
          type="button"
          onClick={toggleBasket}
          aria-label="Close the basket"
          className="ml-auto text-sm text-[var(--color-ink-3)] hover:text-[var(--color-ink)]"
        >
          ✕
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-3 py-2">
        {groups.length === 0 ? (
          <p className="py-8 text-center text-sm text-[var(--color-ink-3)]">
            Nothing here yet. Tick some stickers, choose a size and type, and press{' '}
            <strong>Add to basket</strong>.
          </p>
        ) : (
          <ul className="space-y-3">
            {groups.map((group) => (
              <Row key={group.stickerId} group={group} onRemove={removeFromBasket} />
            ))}
          </ul>
        )}
      </div>

      <footer className="flex items-center gap-3 border-t border-[var(--color-rule)] px-3 py-2">
        <button
          type="button"
          onClick={emptyBasket}
          disabled={basket.size === 0}
          className="text-xs text-[var(--color-ink-3)] underline underline-offset-2 hover:text-[var(--color-ink)] disabled:opacity-40"
        >
          Empty basket
        </button>
        <button
          type="button"
          onClick={() => void downloadBasket()}
          disabled={busy || basket.size === 0}
          className="ml-auto rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-white hover:bg-[var(--color-brand-600)] disabled:opacity-40"
        >
          {busy ? 'Working…' : 'Download'}
        </button>
      </footer>
    </aside>
  );
}

function Row({ group, onRemove }: { group: BasketGroup; onRemove: (key: string) => void }) {
  const missing = group.sticker === null;

  return (
    <li className={missing ? 'opacity-50' : undefined}>
      <div className="flex items-center gap-2">
        <Thumb masterFile={group.sticker?.masterFile ?? null} />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium" title={group.stickerId}>
            {group.sticker?.artName ?? group.stickerId}
          </p>
          {/* ADR-0003: absence may be the sync client mid-write, so the entry
              stays. Download skips it and it is still here to retry. */}
          {missing && (
            <p className="text-[11px] text-[var(--color-ink-3)]">not in the folder right now</p>
          )}
        </div>
      </div>

      <ul className="mt-1 ml-10 space-y-0.5">
        {group.entries.map((entry) => (
          <li key={entry.key} className="flex items-center gap-2 text-xs text-[var(--color-ink-2)]">
            <span className="flex-1 truncate">
              {getSize(entry.size)?.id ?? entry.size} {getType(entry.type)?.label ?? entry.type}
            </span>
            <button
              type="button"
              onClick={() => onRemove(entry.key)}
              aria-label={`Remove ${entry.size} ${entry.type}`}
              className="text-[var(--color-ink-4)] hover:text-[var(--color-ink)]"
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
    </li>
  );
}

/**
 * The master, not a rendered sticker: the question a thumbnail answers is
 * "which artwork is this?". `loadMasterImage` caches its bitmaps, so this
 * costs no extra disk read.
 */
function Thumb({ masterFile }: { masterFile: string | null }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const dir = useAppStore((s) => s.dir);

  useEffect(() => {
    if (!dir || !masterFile) return;
    let cancelled = false;

    void (async () => {
      try {
        const master = await loadMasterImage(dir, masterFile);
        const canvas = ref.current;
        if (cancelled || !canvas) return;

        const context = canvas.getContext('2d');
        if (!context) return;

        // Cover, so mixed aspect ratios still line up down the column.
        const scale = Math.max(canvas.width / master.width, canvas.height / master.height);
        const w = master.width * scale;
        const h = master.height * scale;
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.drawImage(master.source, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
      } catch {
        // A thumbnail is never worth a broken row.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [dir, masterFile]);

  return (
    <canvas
      ref={ref}
      width={32}
      height={32}
      aria-hidden
      className="h-8 w-8 shrink-0 rounded border border-[var(--color-rule)] bg-[var(--color-paper-2)]"
    />
  );
}
```

- [ ] **Step 2: Put it beside the grid**

In `src/App.tsx`, add `import BasketPanel from '@/components/BasketPanel';`, then replace the bare `<StickerGrid … />` element with a row:

```tsx
      <div className="flex min-h-0 flex-1">
        <StickerGrid visible={visible} visibleIds={visibleIds} empty={files.length === 0} />
        <BasketPanel />
      </div>
```

- [ ] **Step 3: Let the grid live in a flex row**

`.sticker-grid` derives card height from `100dvh`, which stays correct — the panel takes width, not height, so cards keep their size and the column count simply drops. It only needs to stop overflowing its new flex parent. In `src/index.css`, add one line to the `.sticker-grid` rule:

```css
  min-width: 0;
```

- [ ] **Step 4: Verify automatically, then by hand**

Run: `npm run test:run && npm run typecheck && npm run typecheck:test && npm run lint`
Expected: PASS, all green.

Then run the app and walk the flow — this is the first point the slice can be seen working:

```bash
npm run dev
```

1. Open a folder with a few images.
2. Tick two stickers, leave the bar on `8 × 10 · Diamond Art`, press **Add to basket**. The bar reads `Basket · 2 stickers · 2 PDFs`, both cards show a `1` chip, and **both stay ticked**.
3. Switch to `16 × 20 · Paint by Numbers` and press **Add** again. `2 stickers · 4 PDFs`; chips read `2`.
4. Press **Add** a third time without changing anything. Nothing moves — Add is a union.
5. Open the basket. Two groups, two variant lines each, full product names (`Diamond Art Kit`, not `DAK`).
6. Remove one line, then **Download**. The ZIP holds three PDFs and the basket empties.
7. Untick everything and confirm **Add to basket** is disabled.

- [ ] **Step 5: Commit**

```bash
git add src/components/BasketPanel.tsx src/App.tsx src/index.css
git commit -m "feat(ui): review the basket beside the grid and download from it"
```

---

## Task 8: Bring the docs level with the code

**Files:**
- Modify: `.github/copilot-instructions.md`, `docs/v2-plan.md`

- [ ] **Step 1: Fix the descriptions that are now wrong**

In `.github/copilot-instructions.md`:

- After the `StickerRequest` bullet, add: *"A download is built from the **basket** — a set of `Sticker × Variant`. Marks come from the request bar and apply to the whole basket, not to one request; see `docs/adr/0004-the-basket-of-requests.md`."*
- The folder-structure section says *"The app is one screen: a filter bar over a grid of every sticker in the library."* Change "filter bar" to "request bar", and add *"with a basket panel that opens beside it."*
- The marks paragraph says product type *"only supplies a default in `src/config/variants.ts`"* — still true, but note that the default now seeds the bar's marks rather than each sticker's.

In `docs/v2-plan.md`:

- §6 module list: add `lib/basket.ts ✅`, flip `lib/zip.ts` and `store/useAppStore.ts` to ✅, and change the components line to `FolderGate ✅, RequestBar ✅, StickerGrid ✅, BasketPanel ✅, EditorPanel ⬜`.
- §5 ASCII sketch: the bar's right-hand side should read `[Add to basket]  [Basket · 7 · 9]` rather than `12 selected  [Download]`.
- §7 build order: mark step 3 done, and note that the basket replaced "selected requests" as the download's input.

- [ ] **Step 2: Commit**

```bash
git add .github/copilot-instructions.md docs/v2-plan.md
git commit -m "docs(config): describe the basket in the spec and agent instructions"
```

---

## Self-Review

**Spec coverage.** Every decision in ADR-0004 maps to a task:

| Decision | Task |
|---|---|
| Selection / Basket split | 1, 4 |
| Add as a non-clearing union | 1, 4 |
| Marks belong to the download | 2, 4, 5 |
| `defaultMarks` deleted | 2 |
| Clear succeeded, keep failed | 3, 4 |
| `7 stickers · 9 PDFs` counts | 1 (`stickerCount`), 5, 7 |
| Download lives in the panel | 5 (removed), 7 (added) |
| Missing masters greyed and kept | 1 (`groupBasket`, `basketRequests`), 7 |
| Card basket chip | 6 |
| `VariantKey` left untouched | Global Constraints; enforced by `RequestKey` being a separate type |

**Deliberately not in this slice.** Maximize, the detail view and the editor are Slices B and C. The card's click target does not move (Global Constraints). `upc-lookup.csv` parsing is issue #25 and untouched, so barcodes still render nothing — a pre-existing gap this slice neither fixes nor worsens.

**Type consistency.** `RequestKey` is used identically in `basket.ts`, `zip.ts` (`Archive.succeeded`) and the store (`basket`). After Task 2, `stickerFor(masterFile)` and `syncLibrary(dir, library)` each have one signature, used by Task 4's test helper. `basketCount` is the prop name in both `StickerCard` and `StickerGrid`. `stickerCount()` is defined once in Task 1 and consumed once in Task 5. `groupBasket` returns `BasketGroup[]`, consumed only in Task 7.

**Ordering note.** Task 5 leaves `typecheck` failing until Task 6 lands, because `StickerGrid` still reads `filters`. That is expected and called out in both tasks; do not "fix" it by patching the grid early — Task 6 rewrites those lines anyway.
