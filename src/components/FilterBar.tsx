import { SIZES, TYPES } from '@/config/variants';
import { useAppStore } from '@/store/useAppStore';

/**
 * The request being described.
 *
 * Nothing here touches a sticker. Size, type and the two marks are axes of a
 * StickerRequest, so changing one re-renders the grid and changes what a
 * download would contain — it never writes to stickers.json.
 */
export default function FilterBar({ visibleIds }: { visibleIds: readonly string[] }) {
  const filters = useAppStore((s) => s.filters);
  const setFilters = useAppStore((s) => s.setFilters);
  const search = useAppStore((s) => s.search);
  const setSearch = useAppStore((s) => s.setSearch);
  const selected = useAppStore((s) => s.selected);
  const selectAll = useAppStore((s) => s.selectAll);
  const clearSelection = useAppStore((s) => s.clearSelection);
  const downloadSelected = useAppStore((s) => s.downloadSelected);
  const busy = useAppStore((s) => s.busy);

  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-[var(--color-rule)] bg-[var(--color-surface)] px-4 py-2.5">
      <Group label="Size">
        {SIZES.map((size) => (
          <Choice
            key={size.id}
            active={filters.size === size.id}
            onClick={() => setFilters({ size: size.id })}
          >
            {size.label}
          </Choice>
        ))}
      </Group>

      <Group label="Type">
        {TYPES.map((type) => (
          <Choice
            key={type.id}
            active={filters.type === type.id}
            onClick={() => setFilters({ type: type.id })}
          >
            {type.short}
          </Choice>
        ))}
      </Group>

      {/* Independent booleans, valid on any product type. */}
      <Check
        checked={filters.barcode}
        onChange={(barcode) => setFilters({ barcode })}
        label="Barcode"
      />
      <Check
        checked={filters.logo}
        onChange={(logo) => setFilters({ logo })}
        label="Diamond logo"
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
        <span className="text-sm text-[var(--color-ink-3)]">
          {selected.size} selected
        </span>
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
          onClick={() => void downloadSelected()}
          disabled={busy || selected.size === 0}
          className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-white hover:bg-[var(--color-brand-600)] disabled:opacity-40"
        >
          {busy ? 'Working…' : 'Download'}
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
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex items-center gap-1.5 text-sm text-[var(--color-ink-2)] select-none">
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
