import '@testing-library/jest-dom';
import { vi } from 'vitest';

// ---------------------------------------------------------------------------
// Canvas stub
// jsdom does not implement HTMLCanvasElement. Stub out enough of the 2D
// context API for renderer tests to run without errors.
// ---------------------------------------------------------------------------
class MockCanvasRenderingContext2D {
  canvas: HTMLCanvasElement;
  fillStyle = '';
  letterSpacing = '';
  font = '';
  textBaseline = 'alphabetic';
  constructor(canvas: HTMLCanvasElement) { this.canvas = canvas; }
  fillRect = vi.fn();
  drawImage = vi.fn();
  fillText = vi.fn();
  measureText = vi.fn((text: string) => ({ width: text.length * 10 }));
  getImageData = vi.fn(() => ({ data: new Uint8ClampedArray(4) }));
  putImageData = vi.fn();
  clearRect = vi.fn();
  save = vi.fn();
  restore = vi.fn();
  scale = vi.fn();
  translate = vi.fn();
  beginPath = vi.fn();
  closePath = vi.fn();
  stroke = vi.fn();
  fill = vi.fn();
  rect = vi.fn();
}

HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string) {
  if (type === '2d') return new MockCanvasRenderingContext2D(this) as unknown as CanvasRenderingContext2D;
  return null;
} as typeof HTMLCanvasElement.prototype.getContext;

HTMLCanvasElement.prototype.toDataURL = vi.fn(() => 'data:image/png;base64,fake');

// ---------------------------------------------------------------------------
// bwip-js stub
// ---------------------------------------------------------------------------
vi.mock('bwip-js/browser', () => ({ toCanvas: vi.fn() }));

// ---------------------------------------------------------------------------
// document.fonts stub — jsdom has no FontFaceSet.
// ---------------------------------------------------------------------------
if (!('fonts' in document)) {
  Object.defineProperty(document, 'fonts', {
    configurable: true,
    value: {
      load: vi.fn(async () => []),
      check: vi.fn(() => true),
      ready: Promise.resolve(),
    },
  });
}

// ---------------------------------------------------------------------------
// URL helpers stub
// ---------------------------------------------------------------------------
if (typeof URL.createObjectURL === 'undefined') {
  URL.createObjectURL = vi.fn(() => 'blob:fake-url');
}
URL.revokeObjectURL = vi.fn();
