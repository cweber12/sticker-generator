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
