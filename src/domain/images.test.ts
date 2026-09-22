import { describe, expect, it } from 'vitest';
import { validateImage, validateImages, IMAGE_LIMITS, type ImageDraft } from './images';
const png = 'iVBORw0KGgo=';
const image: ImageDraft = {
  id: 'a',
  dataUrl: `data:image/png;base64,${png}`,
  mediaType: 'image/png',
  bytes: 8,
  alt: '',
};
describe('local image validation', () => {
  it('accepts supported raster signatures with exact byte counts', () => {
    expect(validateImage(image)).toBeUndefined();
    expect(validateImage({ ...image, dataUrl: image.dataUrl.replace(/=$/, '') })).toBeUndefined();
    for (const [mediaType, bytes] of [
      ['image/jpeg', [255, 216, 255, 224]],
      ['image/webp', [82, 73, 70, 70, 0, 0, 0, 0, 87, 69, 66, 80]],
    ] as const) {
      expect(
        validateImage({
          ...image,
          mediaType,
          bytes: bytes.length,
          dataUrl: `data:${mediaType};base64,${Buffer.from(bytes).toString('base64')}`,
        }),
      ).toBeUndefined();
    }
  });
  it('refuses spoofed MIME, malformed/noncanonical base64, size mismatch and signature mismatch', () => {
    for (const dataUrl of [
      'data:image/jpeg;base64,' + png,
      'data:image/png;base64,AAAA',
      'data:image/png;base64,iVBORw0KGgp=',
      'data:image/png;base64,iVBORw0KGgo===',
      'data:image/png;base64,iVBORw0KGgo=\n',
    ])
      expect(validateImage({ ...image, dataUrl })).toBe('data');
    expect(validateImage({ ...image, bytes: 9 })).toBe('data');
    expect(validateImage({ ...image, mediaType: 'image/svg+xml' as ImageDraft['mediaType'] })).toBe(
      'type',
    );
  });
  it('enforces count, per-image size and alternative-text bounds', () => {
    expect(validateImage({ ...image, bytes: IMAGE_LIMITS.bytes + 1 })).toBe('size');
    expect(validateImage({ ...image, bytes: 0 })).toBe('size');
    expect(validateImage({ ...image, alt: 'a'.repeat(1501) })).toBe('alt');
    expect(validateImages(Array(5).fill(image))).toBe('count');
    expect(validateImages([image])).toBeUndefined();
  });
});
