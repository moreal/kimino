import { describe, expect, it, vi } from 'vitest';
import type { ImageDraft } from '../domain/images';
import type { Addressing } from '../domain/note-content';
import { createImagePublisher } from './image-publisher';
import { GatewayRejected, GatewayUnreachable } from './gateway-errors';
import {
  createSession,
  credentials,
  deferred,
  gateway,
  note,
  post,
  timeline,
} from './session-doubles.test-support';

const image = (id = 'one'): ImageDraft => ({
  id,
  dataUrl: 'data:image/png;base64,iVBORw0KGgo=',
  mediaType: 'image/png',
  bytes: 8,
  alt: 'alt',
});
const uploaded = {
  id: 'https://example.test/image',
  url: 'https://example.test/file',
  mediaType: 'image/png' as const,
};
const followers = credentials.actorUrl + '/followers';
const publicAudience = { to: ['https://www.w3.org/ns/activitystreams#Public'], cc: [followers] };
async function setup(mode: 'oni' | null = 'oni', withFollowers = true, privateMedia = true) {
  const active = {
    ...gateway(),
    images: {
      upload: vi.fn().mockResolvedValue({ image: uploaded }),
      resolve: vi.fn().mockResolvedValue(uploaded),
    },
  };
  const initial = timeline();
  if (withFollowers) initial.actor.followers = followers;
  if (privateMedia) initial.actor.privateMedia = true;
  vi.mocked(active.loadTimeline).mockResolvedValue(initial);
  const session = createSession(() => active);
  await session.connect({ ...credentials, mediaMode: mode ?? undefined });
  return { active, session, draft: { ...post('hello'), images: [image()] } };
}

describe('image publishing lifecycle', () => {
  it('retains receipts after Note refusal and uses edited alternative text on retry', async () => {
    const { active, session, draft } = await setup();
    vi.mocked(active.publishNote).mockRejectedValueOnce(new GatewayRejected(400));
    await expect(session.publish(draft)).rejects.toMatchObject({ failure: { kind: 'http' } });
    await session.publish({ ...draft, images: [{ ...image(), alt: 'updated' }] });
    expect(active.images!.upload).toHaveBeenCalledTimes(1);
    expect(active.publishNote).toHaveBeenLastCalledWith(
      {
        ...post('hello'),
        attachments: [{ ...uploaded, alt: 'updated', audience: publicAudience }],
      },
      undefined,
    );
  });
  it('keeps partial upload receipts and retries only an explicitly rejected image', async () => {
    const { active, session, draft } = await setup();
    vi.mocked(active.images!.upload)
      .mockResolvedValueOnce({ image: uploaded })
      .mockRejectedValueOnce(new GatewayRejected(413));
    const multiple = { ...draft, images: [image(), image('two')] };
    await expect(session.publish(multiple)).rejects.toBeDefined();
    expect(active.publishNote).not.toHaveBeenCalled();
    await session.publish(multiple);
    expect(active.images!.upload).toHaveBeenCalledTimes(3);
  });
  it('recovers accepted uploads through GET only', async () => {
    const { active, session, draft } = await setup();
    vi.mocked(active.images!.upload).mockResolvedValue({
      location: 'https://example.test/created',
    });
    await expect(session.publish(draft)).rejects.toMatchObject({
      failure: { kind: 'media-unresolved' },
    });
    await expect(session.publish(draft)).rejects.toMatchObject({
      failure: { kind: 'media-unresolved' },
    });
    await session.resolveImage('one');
    await session.publish(draft);
    expect(active.images!.upload).toHaveBeenCalledTimes(1);
    expect(active.images!.resolve).toHaveBeenCalledWith(
      'https://example.test/created',
      'image/png',
      publicAudience,
    );
  });
  it.each([new GatewayUnreachable(), new GatewayRejected(503)])(
    'quarantines an ambiguous outcome',
    async (error) => {
      const { active, session, draft } = await setup();
      vi.mocked(active.images!.upload).mockRejectedValue(error);
      await expect(session.publish(draft)).rejects.toMatchObject({
        failure: { kind: 'media-uncertain' },
      });
      await expect(session.publish(draft)).rejects.toMatchObject({
        failure: { kind: 'media-uncertain' },
      });
      expect(active.images!.upload).toHaveBeenCalledTimes(1);
      expect(active.publishNote).not.toHaveBeenCalled();
    },
  );
  it('validates the entire selection before uploading any image', async () => {
    const { active, session, draft } = await setup();
    await expect(
      session.publish({ ...draft, images: [image(), { ...image('two'), bytes: 9_000_000 }] }),
    ).rejects.toMatchObject({ failure: { kind: 'media-invalid' } });
    expect(active.images!.upload).not.toHaveBeenCalled();
  });
  it('requires explicit opt-in even when the port exists', async () => {
    const { active, session, draft } = await setup(null);
    await expect(session.publish(draft)).rejects.toMatchObject({
      failure: { kind: 'media-unsupported' },
    });
    expect(active.images!.upload).not.toHaveBeenCalled();
  });
  it.each(['followers', 'direct'] as const)(
    'refuses %s images on stock ONI without an explicit private-media capability',
    async (visibility) => {
      const { active, session, draft } = await setup('oni', true, false);
      expect(session.getSnapshot().imageUploadEnabled).toBe(true);
      expect(session.getSnapshot().privateImageUploadEnabled).toBe(false);
      await expect(session.publish({ ...draft, visibility })).rejects.toMatchObject({
        failure: { kind: 'media-scope' },
      });
      expect(active.images.upload).not.toHaveBeenCalled();
      expect(active.publishNote).not.toHaveBeenCalled();
    },
  );
  it('advertises private authoring only with actor capability and explicit ONI opt-in', async () => {
    const enabled = await setup();
    expect(enabled.session.getSnapshot().privateImageUploadEnabled).toBe(true);
    enabled.session.disconnect();
    expect(enabled.session.getSnapshot().privateImageUploadEnabled).toBe(false);
    const disabled = await setup(null);
    expect(disabled.session.getSnapshot().privateImageUploadEnabled).toBe(false);
    const stock = await setup('oni', true, false);
    await stock.session.publish(stock.draft);
    expect(stock.active.images.upload).toHaveBeenCalledTimes(1);
  });
  it('never sends a Note or lands an upload after switching sessions', async () => {
    const { active, session, draft } = await setup();
    const pending = deferred<{ image: typeof uploaded }>();
    vi.mocked(active.images!.upload).mockReturnValueOnce(pending.promise);
    const writing = session.publish(draft);
    await session.connect({ ...credentials, mediaMode: 'oni' });
    pending.resolve({ image: uploaded });
    await expect(writing).rejects.toMatchObject({ failure: { kind: 'not-connected' } });
    expect(active.publishNote).not.toHaveBeenCalled();
    expect(session.getSnapshot().mediaUploads).toEqual({});
    await session.publish(draft);
    expect(active.images!.upload).toHaveBeenCalledTimes(2);
  });
  it('keeps accepted uploads unresolved when Location is missing or readback fails', async () => {
    const { active, session, draft } = await setup();
    vi.mocked(active.images!.upload).mockResolvedValueOnce({});
    await expect(session.publish(draft)).rejects.toMatchObject({
      failure: { kind: 'media-unresolved' },
    });
    await expect(session.resolveImage('one')).rejects.toMatchObject({
      failure: { kind: 'media-unresolved' },
    });
    expect(active.images!.resolve).not.toHaveBeenCalled();
    expect(session.getSnapshot().mediaUploads?.one).toEqual({ phase: 'unresolved' });
    await expect(session.publish(draft)).rejects.toMatchObject({
      failure: { kind: 'media-unresolved' },
    });
    expect(active.images!.upload).toHaveBeenCalledTimes(1);
  });
  it('retains unresolved receipt after failed recovery and allows another GET', async () => {
    const { active, session, draft } = await setup();
    vi.mocked(active.images!.upload).mockResolvedValueOnce({
      location: 'https://example.test/created',
    });
    vi.mocked(active.images!.resolve).mockRejectedValueOnce(new GatewayUnreachable());
    await expect(session.publish(draft)).rejects.toBeDefined();
    await expect(session.resolveImage('one')).rejects.toMatchObject({
      failure: { kind: 'media-unresolved' },
    });
    await session.resolveImage('one');
    expect(active.images!.upload).toHaveBeenCalledTimes(1);
    expect(session.getSnapshot().mediaUploads?.one?.phase).toBe('ready');
  });
  it('clamps a requested public reply and uploads only for its direct participants', async () => {
    const { active, session, draft } = await setup();
    const parent = note({
      visibility: 'direct',
      mentions: [credentials.actorUrl, 'https://third.test/person'],
    });
    const audience = { to: [parent.author, 'https://third.test/person'].sort(), cc: [] };
    await session.publish(draft, parent);
    expect(active.images.upload).toHaveBeenCalledWith(image(), audience);
    expect(active.publishNote).toHaveBeenCalledWith(
      { ...post('hello', 'direct'), attachments: [{ ...uploaded, alt: 'alt', audience }] },
      parent,
    );
  });
  it('discards local state on removal and after a confirmed Note', async () => {
    const { active, session, draft } = await setup();
    vi.mocked(active.publishNote).mockRejectedValueOnce(new GatewayRejected(400));
    await expect(session.publish(draft)).rejects.toBeDefined();
    expect(session.getSnapshot().mediaUploads?.one?.phase).toBe('ready');
    session.discardImage('one');
    expect(session.getSnapshot().mediaUploads).toEqual({});
    await session.publish({ ...draft, images: [image('new-selection')] });
    expect(session.getSnapshot().mediaUploads).toEqual({});
  });
  it('rejects duplicate local identities before sending either upload', async () => {
    const { active, session, draft } = await setup();
    await expect(session.publish({ ...draft, images: [image(), image()] })).rejects.toMatchObject({
      failure: { kind: 'media-invalid', reason: 'data' },
    });
    expect(active.images.upload).not.toHaveBeenCalled();
  });
  it('refuses changed visibility after upload', async () => {
    const { active, session, draft } = await setup();
    vi.mocked(active.publishNote).mockRejectedValueOnce(new GatewayRejected(400));
    await expect(session.publish(draft)).rejects.toBeDefined();
    await expect(session.publish({ ...draft, visibility: 'unlisted' })).rejects.toMatchObject({
      failure: { kind: 'media-audience' },
    });
    expect(active.images!.upload).toHaveBeenCalledTimes(1);
  });

  it('uploads a followers-only reply for the exact followers and conversation participants', async () => {
    const { active, session, draft } = await setup();
    const parent = note({
      visibility: 'followers',
      mentions: [credentials.actorUrl, 'https://third.test/person', 'https://third.test/person'],
    });
    const audience = { to: [followers], cc: [parent.author, 'https://third.test/person'].sort() };
    await session.publish(draft, parent);
    expect(active.images.upload).toHaveBeenCalledWith(image(), audience);
    expect(active.publishNote).toHaveBeenCalledWith(
      { ...post('hello', 'followers'), attachments: [{ ...uploaded, alt: 'alt', audience }] },
      parent,
    );
  });

  it('refuses missing followers addressing before any upload or Note POST', async () => {
    const { active, session, draft } = await setup('oni', false);
    await expect(session.publish({ ...draft, visibility: 'followers' })).rejects.toMatchObject({
      failure: { kind: 'no-followers' },
    });
    expect(active.images.upload).not.toHaveBeenCalled();
    expect(active.publishNote).not.toHaveBeenCalled();
  });

  it('refuses changed reply participants at the same visibility before uploading a new image', async () => {
    const { active, session, draft } = await setup();
    const parent = note({ visibility: 'direct' });
    vi.mocked(active.publishNote).mockRejectedValueOnce(new GatewayRejected(400));
    await expect(session.publish(draft, parent)).rejects.toBeDefined();
    await expect(
      session.publish(
        { ...draft, images: [image('new'), image()] },
        { ...parent, mentions: ['https://third.test/person'] },
      ),
    ).rejects.toMatchObject({ failure: { kind: 'media-audience' } });
    expect(active.images.upload).toHaveBeenCalledTimes(1);
    expect(active.publishNote).toHaveBeenCalledTimes(1);
  });

  it('captures drafts and reply participants before queuing and keeps them stable during upload', async () => {
    const { active, session, draft } = await setup();
    const blocking = deferred<void>();
    const uploading = deferred<{ image: typeof uploaded }>();
    vi.mocked(active.publishNote).mockReturnValueOnce(blocking.promise);
    active.images.upload.mockReturnValueOnce(uploading.promise);
    const first = session.publish(post('earlier'));
    const parent = note({ visibility: 'direct', mentions: ['https://third.test/person'] });
    const original = { ...parent, mentions: [...parent.mentions] };
    const submitted = session.publish(draft, parent);
    draft.content = 'changed after enqueue';
    draft.images[0].alt = 'changed after enqueue';
    parent.author = 'https://changed.test/person';
    parent.mentions.length = 0;
    parent.visibility = 'public';
    blocking.resolve();
    await first;
    await vi.waitFor(() => expect(active.images.upload).toHaveBeenCalledTimes(1));
    const audience = { to: [original.author, ...original.mentions].sort(), cc: [] };
    expect(active.images.upload).toHaveBeenCalledWith(image(), audience);
    draft.images[0].dataUrl = 'changed during upload';
    parent.mentions.push('https://later.test/person');
    uploading.resolve({ image: uploaded });
    await submitted;
    expect(active.publishNote).toHaveBeenLastCalledWith(
      { ...post('hello', 'direct'), attachments: [{ ...uploaded, alt: 'alt', audience }] },
      original,
    );
  });
});

describe('exact image receipt audiences', () => {
  const recipient = 'https://other.test/person';
  const other = 'https://third.test/person';
  const audience = (): Addressing => ({ to: [recipient], cc: [other] });
  function publisher() {
    const upload = vi.fn().mockResolvedValue({ image: { ...uploaded } });
    const resolve = vi.fn().mockResolvedValue({ ...uploaded });
    const update = vi.fn();
    return {
      upload,
      resolve,
      update,
      publisher: createImagePublisher({ upload, resolve }, () => true, update),
    };
  }

  it('reuses receipts despite recipient ordering or duplicate entries', async () => {
    const f = publisher();
    const expected = { to: [recipient, other].sort(), cc: [] };
    await f.publisher.prepare([image()], { to: [other, recipient, other], cc: [] });
    const attachments = await f.publisher.prepare([{ ...image(), alt: 'edited' }], {
      to: [recipient, other],
      cc: [],
    });
    expect(f.upload).toHaveBeenCalledTimes(1);
    expect(attachments).toEqual([{ ...uploaded, alt: 'edited', audience: expected }]);
  });

  it.each([
    { to: [recipient, other], cc: [] },
    { to: [recipient], cc: [] },
    { to: [other], cc: [recipient] },
  ])(
    'preflights every existing receipt before any new upload when recipient roles change',
    async (changed) => {
      const f = publisher();
      await f.publisher.prepare([image()], audience());
      await expect(f.publisher.prepare([image('new'), image()], changed)).rejects.toMatchObject({
        failure: { kind: 'media-audience' },
      });
      expect(f.upload).toHaveBeenCalledTimes(1);
    },
  );

  it('captures caller arrays before awaits and isolates arrays passed to the upload port', async () => {
    const f = publisher();
    const pending = deferred<{ image: typeof uploaded }>();
    const submitted = audience();
    f.upload.mockImplementationOnce((_image: ImageDraft, sent: Addressing) => {
      sent.to.push('https://port.test/extra');
      sent.cc.length = 0;
      return pending.promise;
    });
    const preparing = f.publisher.prepare([image()], submitted);
    submitted.to.length = 0;
    submitted.cc.push('https://caller.test/extra');
    pending.resolve({ image: { ...uploaded } });
    const result = await preparing;
    expect(result[0].audience).toEqual(audience());
    result[0].audience.to.push('https://attachment.test/extra');
    const again = await f.publisher.prepare([image()], audience());
    expect(again[0].audience).toEqual(audience());
    expect(f.upload).toHaveBeenCalledTimes(1);
  });

  it('uses an isolated copy of the stored audience for readback and subsequent retries', async () => {
    const f = publisher();
    f.upload.mockResolvedValueOnce({ location: 'https://example.test/accepted' });
    const submitted = audience();
    await expect(f.publisher.prepare([image()], submitted)).rejects.toMatchObject({
      failure: { kind: 'media-unresolved' },
    });
    submitted.to.length = 0;
    f.resolve.mockImplementationOnce((_location: string, _mediaType: string, sent: Addressing) => {
      expect(sent).toEqual(audience());
      sent.to.push('https://port.test/extra');
      sent.cc.length = 0;
      return Promise.reject(new GatewayUnreachable());
    });
    await expect(f.publisher.resolve('one')).rejects.toMatchObject({
      failure: { kind: 'media-unresolved' },
    });
    await f.publisher.resolve('one');
    expect(f.resolve).toHaveBeenLastCalledWith(
      'https://example.test/accepted',
      'image/png',
      audience(),
    );
    expect((await f.publisher.prepare([image()], audience()))[0].audience).toEqual(audience());
    expect(f.upload).toHaveBeenCalledTimes(1);
  });

  it('isolates selected images and confirmed image metadata from caller, port and snapshot mutation', async () => {
    const f = publisher();
    const pending = deferred<{ image: typeof uploaded }>();
    f.upload.mockImplementationOnce((sent: ImageDraft) => {
      sent.alt = 'port mutation';
      sent.dataUrl = 'port mutation';
      return pending.promise;
    });
    const selected = [image(), image('two')];
    const preparing = f.publisher.prepare(selected, audience());
    selected[0].alt = 'caller mutation';
    selected[1].dataUrl = 'caller mutation';
    const received = { ...uploaded };
    pending.resolve({ image: received });
    const attachments = await preparing;
    expect(f.upload).toHaveBeenNthCalledWith(2, image('two'), audience());
    expect(attachments[0].alt).toBe('alt');
    received.url = 'https://mutated.test/port';
    f.update.mock.lastCall![0].one.image.url = 'https://mutated.test/snapshot';
    const again = await f.publisher.prepare([image()], audience());
    expect(again[0].url).toBe(uploaded.url);
  });
});

it('withdraws private authoring capability when a refreshed actor stops advertising it', async () => {
  const { active, session, draft } = await setup();
  const current = await active.loadTimeline();
  vi.mocked(active.loadTimeline).mockResolvedValue({
    ...current,
    actor: { ...current.actor, privateMedia: true, followers: current.actor.id + '/followers' },
  });
  await session.refresh();
  expect(session.getSnapshot().privateImageUploadEnabled).toBe(true);
  vi.mocked(active.loadTimeline).mockResolvedValue({
    ...current,
    actor: { ...current.actor, privateMedia: false, followers: current.actor.id + '/followers' },
  });
  await session.refresh();
  expect(session.getSnapshot().privateImageUploadEnabled).toBe(false);
  await expect(session.publish({ ...draft, visibility: 'followers' })).rejects.toMatchObject({
    failure: { kind: 'media-scope' },
  });
  expect(active.images!.upload).not.toHaveBeenCalled();
});
