import { expect, it } from 'vitest';
import { imageAudience, sameImageAudience } from './image-audience';
import { PUBLIC } from './note-content';
it('canonicalizes recipients as copied sets without merging to and cc', () => {
  const original = { to: ['https://B.test', 'https://a.test/', 'https://B.test/'], cc: [] };
  expect(imageAudience(original)).toEqual({ to: ['https://a.test/', 'https://b.test/'], cc: [] });
  expect(original.to).toHaveLength(3);
  expect(sameImageAudience(original, { to: ['https://a.test/', 'https://b.test/'], cc: [] })).toBe(
    true,
  );
  expect(sameImageAudience({ to: [PUBLIC], cc: [] }, { to: [], cc: [PUBLIC] })).toBe(false);
});
it('rejects malformed recipient evidence without dropping it', () => {
  for (const to of [['javascript:bad'], [null], 'https://a.test/'])
    expect(() => imageAudience({ to, cc: [] } as never)).toThrow();
});
