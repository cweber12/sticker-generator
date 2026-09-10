import { describe, it, expect } from 'vitest';
import { DEFAULT_TEMPLATE } from '@/config/template';
import { stickerFor } from '@/fs/library';
import { resolveTemplate } from './index';

/**
 * Identity matters here, not just value.
 *
 * A resolved template is a card's render-effect dependency. Every sticker in
 * the grid is resolved on every library change, so if an un-overridden sticker
 * gets a fresh object each time, editing ONE sticker re-renders every canvas in
 * the grid - which is precisely what a live colour picker would do forty times
 * a second.
 */
describe('resolveTemplate', () => {
  const plain = stickerFor('TheSun.png');

  it('returns the template itself when nothing is overridden', () => {
    expect(resolveTemplate(DEFAULT_TEMPLATE, plain)).toBe(DEFAULT_TEMPLATE);
  });

  it('returns the template itself when the overrides are only text', () => {
    // artName and subtitle are not geometry, so they change nothing here.
    const named = { ...plain, overrides: { artName: 'The Sun', subtitle: 'Custom' } };
    expect(resolveTemplate(DEFAULT_TEMPLATE, named)).toBe(DEFAULT_TEMPLATE);
  });

  it('returns the template itself when the variant key has no overrides', () => {
    expect(resolveTemplate(DEFAULT_TEMPLATE, plain, '10x12|PBN')).toBe(DEFAULT_TEMPLATE);
  });

  it('copies once a sticker actually overrides something', () => {
    const contained = { ...plain, overrides: { fit: 'contain' as const } };
    const resolved = resolveTemplate(DEFAULT_TEMPLATE, contained);

    expect(resolved).not.toBe(DEFAULT_TEMPLATE);
    expect(resolved.fit).toBe('contain');
    expect(resolved.labelHeightIn).toBe(DEFAULT_TEMPLATE.labelHeightIn);
  });

  it('lets a variant override beat a sticker override', () => {
    const both = {
      ...plain,
      overrides: { background: '#111111' },
      variantOverrides: { '10x12|PBN': { background: '#222222' } },
    };
    expect(resolveTemplate(DEFAULT_TEMPLATE, both, '10x12|PBN').background).toBe('#222222');
    expect(resolveTemplate(DEFAULT_TEMPLATE, both, '8x10|PBN').background).toBe('#111111');
  });
});
