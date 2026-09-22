import { describe, expect, it } from 'vitest';
import type { ImageDraft } from '../domain/images';
import {
  imageAudienceAllowed,
  imageFileProblem,
  imageSelectionProblem,
  localImagePreview,
} from './image-authoring';
import { imageUploadText, mediaCopy } from './copy-media';

const image: ImageDraft = {
  id: 'local',
  dataUrl: 'data:image/png;base64,iVBORw0KGgo=',
  bytes: 8,
  mediaType: 'image/png',
  alt: '',
};

describe('image authoring presentation', () => {
  it('rejects unsupported or oversized files before reading and allows an empty decorative alt', () => {
    expect(imageFileProblem({ type: 'image/svg+xml', size: 20 })).toBe('type');
    expect(imageFileProblem({ type: 'image/png', size: 5 * 1024 * 1024 + 1 })).toBe('size');
    expect(imageFileProblem({ type: 'image/png', size: 0 })).toBe('size');
    expect(imageSelectionProblem([image])).toBeUndefined();
    expect(imageSelectionProblem(Array.from({ length: 5 }, () => image))).toBe('count');
  });

  it('only previews local raster data and never remote or SVG image sources', () => {
    expect(localImagePreview(image)).toBe(image.dataUrl);
    for (const dataUrl of [
      'https://example.test/private.png',
      '//example.test/a.png',
      'data:image/svg+xml;base64,PHN2Zz4=',
      'blob:https://example.test/id',
    ])
      expect(localImagePreview({ ...image, dataUrl })).toBeUndefined();
  });

  it('restricts authoring audiences without silently widening them', () => {
    expect(imageAudienceAllowed('public')).toBe(true);
    expect(imageAudienceAllowed('unlisted')).toBe(true);
    expect(imageAudienceAllowed('followers')).toBe(false);
    expect(imageAudienceAllowed('direct')).toBe(false);
    expect(imageAudienceAllowed('followers', true)).toBe(true);
    expect(imageAudienceAllowed('direct', true)).toBe(true);
  });

  it('distinguishes a confirmed upload without a recovery location from uncertainty', () => {
    expect(imageUploadText({ phase: 'unresolved' })).toBe(mediaCopy.noLocation);
    expect(imageUploadText({ phase: 'unresolved', location: 'https://example.test/upload' })).toBe(
      mediaCopy.unresolved,
    );
    expect(imageUploadText({ phase: 'uncertain' })).toBe(mediaCopy.uncertain);
  });
});
