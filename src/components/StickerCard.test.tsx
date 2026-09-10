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
    // Slice A keeps the whole card as the select target. Slice B moves it to
    // the checkbox, once clicking the image has a detail view to open.
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
