import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BasketPanel from './BasketPanel';
import { emptyLibrary, stickerFor } from '@/fs/library';
import { useAppStore } from '@/store/useAppStore';

const dir = { kind: 'directory', name: 'Client Stickers' } as FileSystemDirectoryHandle;

const pristine = { ...useAppStore.getState() };

beforeEach(() => {
  const files = ['Cat Nap.png', 'Coastal Scene.png'];
  useAppStore.setState({
    ...pristine,
    status: 'ready',
    dir,
    library: { ...emptyLibrary(), stickers: files.map((file) => stickerFor(file)) },
    files,
    basketOpen: true,
    basket: new Set([
      'Cat Nap.png|10x12|DAK',
      'Cat Nap.png|10x12|PBN',
      'Coastal Scene.png|10x12|DAK',
    ]),
    detail: null,
  });
});

describe('BasketPanel', () => {
  it('groups a sticker’s variants under one image', () => {
    render(<BasketPanel />);
    // Both stickers were added at 10x12 DAK; only Cat Nap also at PBN.
    expect(screen.getAllByText('10x12 Diamond Art Kit', { selector: 'button' })).toHaveLength(2);
    expect(
      screen.getByText('10x12 Paint by Numbers Kit', { selector: 'button' }),
    ).toBeInTheDocument();
    // Two images, one per sticker — not one per entry.
    expect(screen.getAllByTitle(/click to view full size/)).toHaveLength(2);
    // Two stickers, three entries — the counts are different numbers now.
    expect(screen.getByText(/2 stickers · 3 PDFs/)).toBeInTheDocument();
  });

  it('chooses which variant the image shows without touching the order', async () => {
    const user = userEvent.setup();
    render(<BasketPanel />);

    const pbn = screen.getByText('10x12 Paint by Numbers Kit', { selector: 'button' });
    expect(pbn).toHaveAttribute('aria-pressed', 'false');

    await user.click(pbn);

    expect(pbn).toHaveAttribute('aria-pressed', 'true');
    // The whole point of separating the line from the ✕: previewing must never
    // be able to delete a request.
    expect(useAppStore.getState().basket.size).toBe(3);
  });

  it('removes one entry from the ✕, not from the line', async () => {
    const user = userEvent.setup();
    render(<BasketPanel />);

    await user.click(screen.getByLabelText('Remove 10x12 PBN from the basket'));

    expect([...useAppStore.getState().basket].sort()).toEqual([
      'Cat Nap.png|10x12|DAK',
      'Coastal Scene.png|10x12|DAK',
    ]);
  });

  it('opens the maximized view at the variant on show, leaving the bar alone', async () => {
    const user = userEvent.setup();
    useAppStore.setState({ variant: { size: '16x20', type: 'DAK' } });
    render(<BasketPanel />);

    await user.click(screen.getByText('10x12 Paint by Numbers Kit', { selector: 'button' }));
    const [image] = screen.getAllByTitle(/click to view full size/);
    await user.click(image);

    expect(useAppStore.getState().detail).toEqual({
      stickerId: 'Cat Nap.png',
      size: '10x12',
      type: 'PBN',
      from: 'basket',
    });
    expect(useAppStore.getState().variant).toEqual({ size: '16x20', type: 'DAK' });
  });

  it('keeps an entry whose artwork has left the folder, and says so', () => {
    useAppStore.setState({ basket: new Set(['Gone.png|10x12|DAK']) });
    render(<BasketPanel />);
    expect(screen.getByText('Gone.png')).toBeInTheDocument();
    expect(screen.getByText(/not in the folder right now/)).toBeInTheDocument();
  });
});
