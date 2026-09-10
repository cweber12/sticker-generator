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
  const onOpen = vi.fn();
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
      onOpen={onOpen}
      {...overrides}
    />,
  );
  return { onSelect, onOpen };
}

describe('StickerCard', () => {
  it('ticks the sticker when the checkbox is clicked', async () => {
    const { onSelect, onOpen } = renderCard();
    await userEvent.click(screen.getByRole('checkbox', { name: /Select Sunset Beach/ }));
    expect(onSelect).toHaveBeenCalledWith('Sunset Beach.png', false);
    // The checkbox sits on top of the image; a tick must not also maximize.
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('passes shift through, so a range can be filled from the checkbox', async () => {
    // One session, or the held modifier is dropped between calls.
    const user = userEvent.setup();
    const { onSelect } = renderCard();
    await user.keyboard('{Shift>}');
    await user.click(screen.getByRole('checkbox', { name: /Select Sunset Beach/ }));
    await user.keyboard('{/Shift}');
    expect(onSelect).toHaveBeenCalledWith('Sunset Beach.png', true);
  });

  it('opens the maximized view when the image is clicked', async () => {
    const { onOpen, onSelect } = renderCard();
    await userEvent.click(screen.getByRole('button', { name: /click to view full size/ }));
    expect(onOpen).toHaveBeenCalledWith('Sunset Beach.png');
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('reports its ticked state to assistive technology', () => {
    renderCard({ selected: true });
    expect(screen.getByRole('checkbox', { name: /Select Sunset Beach/ })).toBeChecked();
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
