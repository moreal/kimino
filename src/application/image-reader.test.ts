import { expect, it, vi } from 'vitest';
import {
  createSession,
  credentials,
  deferred,
  gateway,
  note,
  timeline,
} from './session-doubles.test-support';
import type { ReadImage } from './image-reader';
const image = { kind: 'image' as const, url: 'https://remote.test/image', mediaType: 'image/png' };
const parent = note({ attachments: [image], visibility: 'followers' });
const raster: ReadImage = { bytes: new Uint8Array([1]), mediaType: 'image/png' };
async function setup(mode = true) {
  const active = { ...gateway(), imageReader: { load: vi.fn().mockResolvedValue(raster) } };
  vi.mocked(active.loadTimeline).mockResolvedValue({ ...timeline(), notes: [parent] });
  const session = createSession(() => active);
  await session.connect({ ...credentials, ...(mode ? { mediaMode: 'oni' as const } : {}) });
  return { session, active };
}
it('reads only a current image attachment with the server-provided MIME', async () => {
  const { session, active } = await setup();
  expect(active.imageReader.load).not.toHaveBeenCalled();
  const signal = new AbortController().signal;
  await expect(session.loadImage(parent.id, image.url, signal)).resolves.toEqual(raster);
  expect(active.imageReader.load).toHaveBeenCalledWith(
    { url: image.url, mediaType: image.mediaType },
    expect.any(AbortSignal),
  );
  await expect(session.loadImage('missing', image.url, signal)).rejects.toBeDefined();
  await expect(
    session.loadImage(parent.id, 'https://unapproved.test/', signal),
  ).rejects.toBeDefined();
  expect(active.imageReader.load).toHaveBeenCalledTimes(1);
});
it('requires explicit ONI mode even if a gateway exposes image reads', async () => {
  const { session, active } = await setup(false);
  await expect(
    session.loadImage(parent.id, image.url, new AbortController().signal),
  ).rejects.toBeDefined();
  expect(active.imageReader.load).not.toHaveBeenCalled();
});
it.each(['disconnect', 'hide', 'replacement'] as const)(
  'rejects late image bytes after %s',
  async (action) => {
    const { session, active } = await setup();
    const pending = deferred<ReadImage>();
    active.imageReader.load.mockReturnValueOnce(pending.promise);
    const cancellation = new AbortController();
    const reading = session.loadImage(parent.id, image.url, cancellation.signal);
    const result = expect(reading).rejects.toBeDefined();
    if (action === 'disconnect') session.disconnect();
    else if (action === 'hide') cancellation.abort();
    else {
      vi.mocked(active.loadTimeline).mockResolvedValue({ ...timeline(), notes: [] });
      await session.refresh();
    }
    pending.resolve(raster);
    await result;
  },
);
