import { describe, expect, it } from 'vitest';
import { evaluateActivities } from './evaluate';
import type { ASObject } from './social';
const actor = 'https://social.test/alice';
const id = 'https://social.test/notes/photo';
const image = {
  type: 'Image',
  url: 'https://social.test/images/1',
  mediaType: 'image/png',
  name: 'A photo',
};
const note = { type: 'Note', id, attributedTo: actor, attachment: [image] };
const create = (object: ASObject) => ({
  type: 'Create',
  id: 'https://social.test/activities/1',
  actor,
  object,
});
describe('attachment-only Notes', () => {
  it('normalizes absent content to an empty string when safe attachments remain', () => {
    const result = evaluateActivities([create(note)]);
    expect(result.notes).toHaveLength(1);
    expect(result.notes[0]).toMatchObject({
      id,
      content: '',
      attachments: [{ kind: 'image', url: image.url, mediaType: 'image/png', alt: 'A photo' }],
    });
    expect(result.diagnostics.rejected).toBe(0);
  });
  it('also retains safe non-image attachments when content is absent', () => {
    const result = evaluateActivities([
      create({
        ...note,
        attachment: {
          type: 'Document',
          url: 'https://social.test/file.pdf',
          mediaType: 'application/pdf',
        },
      }),
    ]);
    expect(result.notes).toHaveLength(1);
    expect(result.notes[0].content).toBe('');
    expect(result.notes[0].attachments[0].url).toBe('https://social.test/file.pdf');
  });
  it.each([
    undefined,
    null,
    [],
    { type: 'Image' },
    { type: 'Image', url: 'javascript:alert(1)' },
    { type: 'Image', url: 'data:image/png;base64,AAAA' },
  ])('rejects absent content without a usable attachment (%j)', (attachment) => {
    expect(evaluateActivities([create({ ...note, attachment })]).notes).toEqual([]);
  });
  it.each([null, 42, {}, ['text']])(
    'rejects present non-string content (%j) even with safe attachments',
    (content) => {
      expect(evaluateActivities([create({ ...note, content })]).notes).toEqual([]);
    },
  );
  it('preserves ownership and deletion rules for attachment-only Notes', () => {
    const other = 'https://social.test/mallory';
    expect(evaluateActivities([{ ...create(note), actor: other }]).notes).toEqual([]);
    const own = create(note);
    expect(
      evaluateActivities([own, { type: 'Delete', actor: other, object: id }]).notes,
    ).toHaveLength(1);
    expect(evaluateActivities([own, { type: 'Delete', actor, object: id }]).notes).toEqual([]);
  });
});

const uploadedImage = {
  type: 'Create',
  id: 'https://social.test/activities/image',
  actor,
  object: {
    type: 'Image',
    id: 'https://social.test/images/uploaded',
    attributedTo: actor,
    mediaType: 'image/png',
  },
};
it('ignores a confirmed own raster Image Create without requiring binary content or URL', () => {
  for (const mediaType of ['image/png', 'image/jpeg', 'image/webp']) {
    const result = evaluateActivities(
      [{ ...uploadedImage, object: { ...uploadedImage.object, mediaType } }],
      { self: actor },
    );
    expect(result.notes).toEqual([]);
    expect(result.diagnostics).toEqual({ ignored: 1, rejected: 0 });
  }
});
it('retains the referencing attachment Note beside its own Image Create', () => {
  const result = evaluateActivities([uploadedImage, create(note)], { self: actor });
  expect(result.notes).toHaveLength(1);
  expect(result.notes[0].attachments[0].url).toBe(image.url);
  expect(result.diagnostics).toEqual({ ignored: 1, rejected: 0 });
});
it('requires the current actor identity before ignoring an Image Create', () => {
  expect(evaluateActivities([uploadedImage]).diagnostics).toEqual({ ignored: 0, rejected: 1 });
});
it.each([
  { ...uploadedImage, actor: 'https://social.test/other' },
  { ...uploadedImage, id: 'https://foreign.test/image-create' },
  { ...uploadedImage, id: undefined },
  { ...uploadedImage, type: ['Create', 'Like'] },
  { ...uploadedImage, object: { ...uploadedImage.object, type: ['Image', 'Note'] } },
  { ...uploadedImage, object: { ...uploadedImage.object, id: 'https://foreign.test/image' } },
  { ...uploadedImage, object: { ...uploadedImage.object, id: undefined } },
  {
    ...uploadedImage,
    object: { ...uploadedImage.object, attributedTo: 'https://social.test/other' },
  },
  { ...uploadedImage, object: { ...uploadedImage.object, attributedTo: undefined } },
  { ...uploadedImage, object: { ...uploadedImage.object, mediaType: 'image/svg+xml' } },
  { ...uploadedImage, object: { ...uploadedImage.object, type: 'Note' } },
])('keeps malformed/forged Image evidence rejected: %j', (activity) => {
  expect(evaluateActivities([activity], { self: actor }).diagnostics.rejected).toBeGreaterThan(0);
});
it('does not reinterpret a mixed Image/Note as a Note even when it has text', () => {
  const result = evaluateActivities(
    [
      {
        ...uploadedImage,
        object: { ...uploadedImage.object, type: ['Image', 'Note'], content: 'not a valid Note' },
      },
    ],
    { self: actor },
  );
  expect(result.notes).toEqual([]);
  expect(result.diagnostics).toEqual({ ignored: 0, rejected: 1 });
});
it('requires safe absolute identity IRIs and an explicit upload actor', () => {
  for (const activity of [
    { ...uploadedImage, actor: undefined },
    { ...uploadedImage, id: 'javascript:bad' },
    { ...uploadedImage, object: { ...uploadedImage.object, id: 'data:image/png;base64,AAAA' } },
  ])
    expect(evaluateActivities([activity], { self: actor }).diagnostics).toEqual({
      ignored: 0,
      rejected: 1,
    });
});
