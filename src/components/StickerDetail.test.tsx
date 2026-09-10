import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fireEvent } from '@testing-library/react';
import StickerDetail from './StickerDetail';
import { emptyLibrary, stickerFor } from '@/fs/library';
import { useAppStore } from '@/store/useAppStore';
import * as library from '@/fs/library';

/**
 * The fit and background controls.
 *
 * These are the first controls in the app that write to `stickers.json`, and
 * the split between moving a picker and deciding on a colour is the whole
 * point of them — so what is asserted here is mostly *when* a write happens,
 * not what the canvas looks like.
 */

vi.mock('@/fs/library', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/fs/library')>();
  return {
    ...actual,
    writeLibrary: vi.fn(async (_dir: unknown, lib: unknown) => lib),
    loadMasterImage: vi.fn(async () => ({
      source: {} as CanvasImageSource,
      width: 1000,
      height: 1200,
    })),
  };
});

const dir = { kind: 'directory', name: 'Client Stickers' } as FileSystemDirectoryHandle;

const pristine = { ...useAppStore.getState() };

function open(overrides: Record<string, unknown> = {}) {
  const sticker = { ...stickerFor('TheSun.png'), overrides };
  useAppStore.setState({
    ...pristine,
    status: 'ready',
    dir,
    files: ['TheSun.png'],
    library: { ...emptyLibrary(), stickers: [sticker] },
    detail: { stickerId: 'TheSun.png', size: '10x12', type: 'PBN', from: 'grid' },
  });
  render(<StickerDetail />);
}

const overridesNow = () => useAppStore.getState().library!.stickers[0].overrides;
const writes = () => vi.mocked(library.writeLibrary).mock.calls.length;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('the fit control', () => {
  it('starts on cover, because that is what every sticker has always been', () => {
    open();
    expect(screen.getByRole('button', { name: 'Cover' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('turns contain on for this sticker and writes it', async () => {
    open();
    await userEvent.click(screen.getByRole('button', { name: 'Contain' }));

    expect(overridesNow().fit).toBe('contain');
    await waitFor(() => expect(writes()).toBe(1));
  });

  it('does not write when the fit is already what was clicked', async () => {
    open();
    await userEvent.click(screen.getByRole('button', { name: 'Cover' }));
    expect(writes()).toBe(0);
  });
});

describe('the background control', () => {
  it('is hidden under cover, where the artwork covers every pixel of it', () => {
    open();
    expect(screen.queryByLabelText('Background colour')).not.toBeInTheDocument();
  });

  it('appears under contain', async () => {
    open({ fit: 'contain' });
    expect(await screen.findByLabelText('Background colour')).toBeInTheDocument();
  });

  it('reads Auto until a colour is chosen', async () => {
    open({ fit: 'contain' });
    expect(await screen.findByText('Auto')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reset to auto' })).not.toBeInTheDocument();
  });

  it('updates the sticker while the picker moves, without writing', async () => {
    open({ fit: 'contain' });
    const input = await screen.findByLabelText('Background colour');

    // React maps onChange onto the native `input` event: this is a drag.
    fireEvent.input(input, { target: { value: '#e8d5b0' } });

    expect(overridesNow().background).toBe('#e8d5b0');
    expect(writes()).toBe(0);
  });

  it('writes once when the picker is dismissed', async () => {
    open({ fit: 'contain' });
    const input = await screen.findByLabelText('Background colour');

    fireEvent.input(input, { target: { value: '#e8d5b0' } });
    fireEvent.input(input, { target: { value: '#d4c090' } });
    fireEvent.change(input, { target: { value: '#d4c090' } });

    expect(overridesNow().background).toBe('#d4c090');
    await waitFor(() => expect(writes()).toBe(1));
  });

  it('reverting deletes the key rather than storing a remembered value', async () => {
    open({ fit: 'contain', background: '#e8d5b0' });
    await userEvent.click(await screen.findByRole('button', { name: 'Reset to auto' }));

    expect('background' in overridesNow()).toBe(false);
    await waitFor(() => expect(writes()).toBe(1));
  });
});
