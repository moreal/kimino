import { validateImages, type ImageAttachment, type ImageDraft } from '../domain/images';
import type { Addressing } from '../domain/note-content';
import { imageAudience, sameImageAudience } from '../domain/image-audience';
import { GatewayHttpError, SessionError } from './gateway-errors';
import type { ImageGateway, ImageUploadState } from './image-types';

type Entry = { source: ImageDraft; audience: Addressing; state: ImageUploadState };

/** One account's memory-only receipts. Never retries an ambiguous or accepted POST. */
export function createImagePublisher(
  port: ImageGateway,
  live: () => boolean,
  update: (states: Readonly<Record<string, ImageUploadState>>) => void,
) {
  const entries = new Map<string, Entry>();
  function check() {
    if (!live()) throw new SessionError({ kind: 'not-connected' });
  }
  function emit() {
    check();
    update(
      Object.fromEntries(
        [...entries].map(([id, entry]) => [
          id,
          {
            ...entry.state,
            ...(entry.state.image ? { image: { ...entry.state.image } } : {}),
          },
        ]),
      ),
    );
  }
  function requireReady(entry: Entry) {
    if (entry.state.phase === 'uncertain') throw new SessionError({ kind: 'media-uncertain' });
    if (entry.state.phase !== 'ready' || !entry.state.image)
      throw new SessionError({ kind: 'media-unresolved' });
    return entry.state.image;
  }
  return {
    discard(id: string) {
      check();
      entries.delete(id);
      emit();
    },
    async prepare(
      selected: readonly ImageDraft[],
      addressing: Addressing,
    ): Promise<ImageAttachment[]> {
      check();
      const images = selected.map((image) => ({ ...image }));
      const problem = validateImages(images);
      if (problem) throw new SessionError({ kind: 'media-invalid', reason: problem });
      if (new Set(images.map((image) => image.id)).size !== images.length)
        throw new SessionError({ kind: 'media-invalid', reason: 'data' });
      let audience: Addressing;
      try {
        audience = imageAudience(addressing);
      } catch {
        throw new SessionError({ kind: 'media-invalid', reason: 'data' });
      }
      // Check all existing receipts before sending anything else in this selection.
      for (const image of images) {
        const entry = entries.get(image.id);
        if (!entry) continue;
        if (!sameImageAudience(entry.audience, audience))
          throw new SessionError({ kind: 'media-audience' });
        if (
          entry.source.dataUrl !== image.dataUrl ||
          entry.source.mediaType !== image.mediaType ||
          entry.source.bytes !== image.bytes
        )
          throw new SessionError({ kind: 'media-invalid', reason: 'data' });
        requireReady(entry);
      }
      const attachments: ImageAttachment[] = [];
      for (const image of images) {
        check();
        let entry = entries.get(image.id);
        if (!entry) {
          entry = {
            source: { ...image },
            audience: imageAudience(audience),
            state: { phase: 'uploading' },
          };
          entries.set(image.id, entry);
          emit();
          try {
            check();
            const receipt = await port.upload({ ...image }, imageAudience(entry.audience));
            check();
            entry.state = {
              ...receipt,
              ...(receipt.image ? { image: { ...receipt.image } } : {}),
              phase: receipt.image ? 'ready' : 'unresolved',
            };
            emit();
          } catch (error) {
            check();
            // Only an explicit client-error response proves that this POST was refused.
            if (error instanceof GatewayHttpError && error.status >= 400 && error.status < 500) {
              entries.delete(image.id);
              emit();
              throw error;
            }
            entry.state = { phase: 'uncertain' };
            emit();
            throw new SessionError({ kind: 'media-uncertain' });
          }
        }
        attachments.push({
          ...requireReady(entry),
          alt: image.alt,
          audience: imageAudience(entry.audience),
        });
      }
      return attachments;
    },
    async resolve(id: string) {
      check();
      const entry = entries.get(id);
      if (entry?.state.phase === 'ready') return;
      if (entry?.state.phase === 'uncertain') throw new SessionError({ kind: 'media-uncertain' });
      if (!entry || entry.state.phase !== 'unresolved' || !entry.state.location)
        throw new SessionError({ kind: 'media-unresolved' });
      const location = entry.state.location;
      try {
        const image = await port.resolve(
          location,
          entry.source.mediaType,
          imageAudience(entry.audience),
        );
        check();
        entry.state = { phase: 'ready', location, image: { ...image } };
        emit();
      } catch {
        check();
        throw new SessionError({ kind: 'media-unresolved' });
      }
    },
  };
}
