import { describe, expect, it } from 'vitest';
import { ActivityPubClient } from './client';
import { imageAudience } from '../domain/image-audience';
import { buildAddressing, PUBLIC } from '../domain/note-content';
import type { ImageDraft } from '../domain/images';
const actor = 'https://oni.example/u/alice';
const outbox = actor + '/outbox';
const publicAudience = buildAddressing('public', { id: actor, followers: actor + '/followers' });
const location = 'https://oni.example/a/1';
const id = 'https://oni.example/o/1';
const image: ImageDraft = {
  id: 'local',
  dataUrl: 'data:image/png;base64,iVBORw0KGgo=',
  mediaType: 'image/png',
  bytes: 8,
  alt: 'description',
};
function fixture(
  options: {
    status?: number;
    location?: string | null;
    read?: unknown;
    object?: unknown;
    readError?: boolean;
    mode?: boolean;
    privateMedia?: boolean;
  } = {},
) {
  let audience = publicAudience;
  const calls: { url: string; init: RequestInit }[] = [];
  const fetcher: typeof fetch = async (input, init = {}) => {
    const url = String(input);
    calls.push({ url, init });
    if (url === actor)
      return Response.json({
        id: actor,
        type: 'Person',
        inbox: actor + '/inbox',
        outbox,
        followers: actor + '/followers',
        ...(options.privateMedia === false
          ? {}
          : { generator: { type: 'Service', id: 'urn:kimino:oni:private-media:1' } }),
      });
    if (init.method === 'POST') {
      const body = JSON.parse(String(init.body));
      audience = { to: body.to, cc: body.cc };
      return new Response(null, {
        status: options.status ?? 201,
        headers: options.location === null ? {} : { Location: options.location ?? location },
      });
    }
    if (options.readError) throw new Error('offline');
    if (url === location)
      return Response.json(
        options.read ?? {
          type: 'Create',
          id: location,
          object: { id, type: 'Image', mediaType: 'image/png', ...audience },
        },
      );
    if (url === id)
      return Response.json(
        options.object ?? { id, type: 'Image', mediaType: 'image/png', ...audience },
      );
    throw new Error('unexpected request');
  };
  return {
    calls,
    client: new ActivityPubClient({
      actorUrl: actor,
      token: 'secret',
      fetch: fetcher,
      ...(options.mode === false ? {} : { mediaMode: 'oni' as const }),
    }),
  };
}
describe('explicit ONI image gateway', () => {
  it('is absent without opt-in', () =>
    expect(fixture({ mode: false }).client.images).toBeUndefined());
  it.each(['public', 'unlisted', 'followers', 'direct'] as const)(
    'uploads %s unpadded Create/Image then resolves binary id',
    async (visibility) => {
      const { client, calls } = fixture();
      const audience = buildAddressing(
        visibility,
        { id: actor, followers: actor + '/followers' },
        { author: 'https://bob.example/', mentions: [] },
      );
      expect(await client.images!.upload(image, audience)).toEqual({
        location,
        image: { id, url: id, mediaType: 'image/png' },
      });
      const post = calls.find((c) => c.init.method === 'POST')!;
      const body = JSON.parse(String(post.init.body));
      expect(body.object).toMatchObject({
        type: 'Image',
        name: 'description',
        mediaType: 'image/png',
        content: 'data:image/png;base64,iVBORw0KGgo',
      });
      expect({ to: body.to, cc: body.cc }).toEqual(imageAudience(audience));
      expect({ to: body.object.to, cc: body.object.cc }).toEqual(imageAudience(audience));
      if (visibility === 'followers' || visibility === 'direct')
        expect([...body.to, ...body.cc]).not.toContain(PUBLIC);
      expect(post.init).toMatchObject({
        redirect: 'error',
        credentials: 'omit',
        headers: { Authorization: 'Bearer secret' },
      });
    },
  );
  it.each([null, 'javascript:bad', 'https://evil.example/a'])(
    'keeps 201 confirmation with unusable location %s',
    async (location) => {
      const { client, calls } = fixture({ location });
      expect(await client.images!.upload(image, publicAudience)).toEqual({});
      expect(calls.filter((c) => c.init.method === 'POST')).toHaveLength(1);
      expect(calls).toHaveLength(2);
    },
  );
  it('keeps Location for failed hydration and resolve performs GET only', async () => {
    const { client, calls } = fixture({ readError: true });
    expect(await client.images!.upload(image, publicAudience)).toEqual({ location });
    await expect(client.images!.resolve(location, 'image/png', publicAudience)).rejects.toThrow();
    expect(calls.filter((c) => c.init.method === 'POST')).toHaveLength(1);
  });
  it('resolves object IRIs and refuses mismatched IDs and MIME', async () => {
    const good = fixture({ read: { type: 'Create', object: id } });
    expect(await good.client.images!.resolve(location, 'image/png', publicAudience)).toEqual({
      id,
      url: id,
      mediaType: 'image/png',
    });
    for (const object of [
      { id: 'https://evil.example/o', type: 'Image', mediaType: 'image/png' },
      { id, type: 'Note', mediaType: 'image/png' },
      { id, type: 'Image', mediaType: 'image/jpeg' },
    ]) {
      await expect(
        fixture({ read: object }).client.images!.resolve(location, 'image/png', publicAudience),
      ).rejects.toThrow();
    }
  });
  it.each([200, 202, 400, 500])('refuses unconfirmed/non-success status %s', async (status) => {
    await expect(
      fixture({ status }).client.images!.upload(image, publicAudience),
    ).rejects.toThrow();
  });
  it('rejects raw images before publishing and serializes resolved image attachments', async () => {
    const { client, calls } = fixture();
    await expect(
      client.publishNote({ content: 'test', visibility: 'public', images: [image] }),
    ).rejects.toThrow();
    expect(calls.filter((c) => c.init.method === 'POST')).toHaveLength(0);
    await client.images!.upload(image, publicAudience);
    calls.length = 0;
    await client.publishNote({
      content: 'test',
      visibility: 'public',
      attachments: [
        { id, url: id, mediaType: 'image/png', alt: 'description', audience: publicAudience },
      ],
    });
    expect(
      JSON.parse(String(calls.find((c) => c.init.method === 'POST')!.init.body)).object.attachment,
    ).toEqual([{ type: 'Image', id, url: id, mediaType: 'image/png', name: 'description' }]);
  });
});

it('never fetches a cross-origin Image reference during upload readback', async () => {
  const { client, calls } = fixture({
    read: { type: 'Create', object: 'https://evil.example/image' },
  });
  expect(await client.images!.upload(image, publicAudience)).toEqual({ location });
  expect(calls.every((call) => new URL(call.url).origin === new URL(actor).origin)).toBe(true);
});
it('rejects invalid local uploads and unsafe audiences before any request', async () => {
  const { client, calls } = fixture();
  await expect(client.images!.upload({ ...image, bytes: 1 }, publicAudience)).rejects.toThrow();
  await expect(client.images!.upload(image, { to: ['javascript:bad'], cc: [] })).rejects.toThrow();
  expect(calls).toHaveLength(0);
});
it('rejects bypassed unsupported and unsafe outgoing attachments before POST', async () => {
  const attachment = {
    id,
    url: id,
    mediaType: 'image/png' as const,
    alt: '',
    audience: publicAudience,
  };
  for (const [mode, visibility, attachments] of [
    [false, 'public', [attachment]],
    [true, 'direct', [attachment]],
    [true, 'public', [{ ...attachment, url: 'data:image/png;base64,AAAA' }]],
    [
      true,
      'public',
      [{ ...attachment, id: 'https://evil.example/image', url: 'https://evil.example/image' }],
    ],
  ] as const) {
    const { client, calls } = fixture({ mode });
    await expect(client.publishNote({ content: '', visibility, attachments })).rejects.toThrow();
    expect(calls.filter((call) => call.init.method === 'POST')).toHaveLength(0);
  }
});
it('rejects a resolved object whose ID differs from the object IRI', async () => {
  const { client } = fixture({
    read: { type: 'Create', object: id },
    object: { type: 'Image', id: id + '/other', mediaType: 'image/png' },
  });
  await expect(client.images!.resolve(location, 'image/png', publicAudience)).rejects.toThrow();
});

it('preserves confirmation but refuses a server-widened restricted upload during hydration', async () => {
  const requested = { to: [actor + '/followers'], cc: [] };
  const { client, calls } = fixture({
    read: { id, type: 'Image', mediaType: 'image/png', to: [PUBLIC], cc: [] },
  });
  expect(await client.images!.upload(image, requested)).toEqual({ location });
  await expect(client.images!.resolve(location, 'image/png', requested)).rejects.toThrow();
  expect(calls.filter((call) => call.init.method === 'POST')).toHaveLength(1);
});
it('refuses an attachment uploaded for another direct recipient before publishing', async () => {
  const { client, calls } = fixture();
  await expect(
    client.publishNote({
      content: 'private',
      visibility: 'direct',
      attachments: [
        {
          id,
          url: id,
          mediaType: 'image/png',
          alt: '',
          audience: { to: ['https://other.example/'], cc: [] },
        },
      ],
    }),
  ).rejects.toThrow();
  expect(calls.filter((call) => call.init.method === 'POST')).toHaveLength(0);
});

it('does not infer private upload support from a generic ONI connection', async () => {
  const { client, calls } = fixture({ privateMedia: false });
  await expect(
    client.images!.upload(image, { to: [actor + '/followers'], cc: [] }),
  ).rejects.toThrow();
  expect(calls.filter((call) => call.init.method === 'POST')).toHaveLength(0);
});

it.each(['audience', 'bto', 'bcc'])(
  'keeps accepted uploads unresolved for unexpected %s recipients',
  async (field) => {
    const audience = { to: [actor + '/followers'], cc: [] };
    for (const wrapper of [false, true]) {
      const object = {
        id,
        type: 'Image',
        mediaType: 'image/png',
        ...audience,
        ...(!wrapper ? { [field]: [PUBLIC] } : {}),
      };
      const read = wrapper
        ? { id: location, type: 'Create', object, ...audience, [field]: [PUBLIC] }
        : { id: location, type: 'Create', object };
      const { client, calls } = fixture({ read });
      expect(await client.images!.upload(image, audience)).toEqual({ location });
      await expect(client.images!.resolve(location, 'image/png', audience)).rejects.toThrow();
      expect(calls.filter((call) => call.init.method === 'POST')).toHaveLength(1);
      await expect(
        client.publishNote({
          content: 'private',
          visibility: 'followers',
          attachments: [{ id, url: id, mediaType: 'image/png', alt: '', audience }],
        }),
      ).rejects.toThrow();
      expect(calls.filter((call) => call.init.method === 'POST')).toHaveLength(1);
    }
  },
);
