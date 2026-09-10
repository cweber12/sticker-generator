import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import StickerGrid from './StickerGrid';
import { emptyLibrary, stickerFor } from '@/fs/library';
import { useAppStore } from '@/store/useAppStore';
import type { StickerRenderInput } from './useStickerRender';

/** Mirrors FILTER_SETTLE_MS in StickerGrid. */
const FILTER_SETTLE_MS = 120;

/**
 * The grid must SETTLE.
 *
 * Renders are the expensive thing here: every change of a card's render inputs
 * tears down its canvas and draws a new one. If the grid re-renders on a timer
 * of its own, every canvas in it is replaced on that timer — and a click whose
 * mousedown and mouseup straddle a replacement never fires, which reads as
 * "clicking the image only zooms sometimes".
 */

const seen: StickerRenderInput[] = [];

vi.mock('./useStickerRender', () => ({
  useStickerRender: (input: StickerRenderInput) => {
    seen.push(input);
    return { hostRef: { current: null }, phase: 'ready' as const, overflow: false };
  },
}));

const dir = { kind: 'directory', name: 'Client Stickers' } as FileSystemDirectoryHandle;
const pristine = { ...useAppStore.getState() };

beforeEach(() => {
  seen.length = 0;
  vi.useFakeTimers();
  const files = ['Cat Nap.png'];
  useAppStore.setState({
    ...pristine,
    status: 'ready',
    dir,
    library: { ...emptyLibrary(), stickers: files.map((file) => stickerFor(file)) },
    files,
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('StickerGrid', () => {
  it('stops re-rendering its cards once the variant has settled', () => {
    const sticker = stickerFor('Cat Nap.png');
    render(<StickerGrid visible={[sticker]} visibleIds={[sticker.id]} empty={false} />);

    // Anything at all that re-renders the grid. Ticking a card is the first
    // thing anyone does, and it is what used to start the loop.
    act(() => {
      useAppStore.setState({ selected: new Set([sticker.id]) });
    });

    // Several turns of the 120ms debounce. Each has to be its own act() so
    // the effects scheduled by one turn are flushed before the next, which is
    // what a real browser does — and what lets a self-feeding loop grow.
    for (let turn = 0; turn < 5; turn += 1) {
      act(() => {
        vi.advanceTimersByTime(FILTER_SETTLE_MS * 2);
      });
    }

    // A card is handed the same object every time, or its canvas is thrown
    // away and redrawn for no reason the user asked for.
    const templates = new Set(seen.map((input) => input.template));
    expect(templates.size).toBe(1);
  });
});
