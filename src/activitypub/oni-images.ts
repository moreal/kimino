import type { ImageGateway } from '../application/image-types';
import type { ASObject, Actor } from '../domain/social';
import { validateImage } from '../domain/images';
import { iri, isType, record, safeUrl, sameOrigin, str } from '../domain/activitystreams';
import { PUBLIC, type Addressing } from '../domain/note-content';
import { imageAudience, sameImageAudience } from '../domain/image-audience';
import { protocol, unexpected } from './errors';

/** ONI's verified Create/Image convention, never inferred from an actor outbox. */
export function createOniImageGateway(deps: {
  actorUrl: string;
  actor(): Promise<Actor>;
  request(url: string, init?: RequestInit): Promise<Response>;
  json(url: string): Promise<ASObject>;
  verified(id: string, mediaType: string, audience: Addressing): void;
}): ImageGateway {
  const trusted = (value: string, base = deps.actorUrl) => {
    const url = safeUrl(value, base);
    if (!sameOrigin(url, deps.actorUrl))
      throw unexpected('ONI image resources must stay on the actor origin.');
    return url;
  };
  const requireOnlyToCc = (object: ASObject) => {
    for (const field of ['audience', 'bto', 'bcc']) {
      const value = object[field];
      if (field in object && !(Array.isArray(value) && value.length === 0))
        throw unexpected('Created image has additional recipient fields.');
    }
  };
  const addressing = (object: ASObject): Addressing => {
    requireOnlyToCc(object);
    const list = (value: unknown): string[] => {
      if (value === undefined) return [];
      const values = Array.isArray(value) ? value : [value];
      return values.map((entry) => {
        const id = iri(entry);
        if (!id) throw unexpected('Malformed image recipient.');
        return id;
      });
    };
    return imageAudience({ to: list(object.to), cc: list(object.cc) });
  };
  const resolve: ImageGateway['resolve'] = async (location, mediaType, expected) => {
    const audience = imageAudience(expected);
    const target = trusted(location);
    let object = await deps.json(target);
    if (iri(object) && trusted(iri(object)!, target) !== target)
      throw unexpected('Resolved activity ID differs from its requested IRI.');
    if (isType(object, 'Create')) {
      requireOnlyToCc(object);
      if (('to' in object || 'cc' in object) && !sameImageAudience(addressing(object), audience))
        throw unexpected('Created activity audience differs from the requested audience.');
      if (record(object.object) && isType(object.object, 'Image')) object = object.object;
      else {
        const objectIri = iri(object.object);
        if (!objectIri) throw unexpected('Created Image reference is missing.');
        const objectTarget = trusted(objectIri, target);
        object = await deps.json(objectTarget);
        if (!str(object.id) || trusted(str(object.id)!, objectTarget) !== objectTarget)
          throw unexpected('Resolved Image ID differs from its requested IRI.');
      }
    }
    const raw = str(object.id);
    if (!isType(object, 'Image') || !raw || object.mediaType !== mediaType)
      throw unexpected('Created object is not the expected raster Image.');
    const id = trusted(raw, target);
    if (!sameImageAudience(addressing(object), audience))
      throw unexpected('Created Image audience differs from the requested audience.');
    deps.verified(id, mediaType, imageAudience(audience));
    // ONI serves bytes through content negotiation on Image.id; it omits Image.url.
    return { id, url: id, mediaType };
  };
  return {
    resolve,
    async upload(source, expected) {
      const image = { ...source };
      const audience = imageAudience(expected);
      if (validateImage(image)) throw unexpected('Local image is invalid.');
      const actor = await deps.actor();
      if (![...audience.to, ...audience.cc].includes(PUBLIC) && !actor.privateMedia)
        throw unexpected('This server does not advertise restricted image authoring support.');
      const outbox = trusted(actor.outbox);
      const { to, cc } = audience;
      const response = await deps.request(outbox, {
        method: 'POST',
        body: JSON.stringify({
          '@context': 'https://www.w3.org/ns/activitystreams',
          type: 'Create',
          actor: actor.id,
          to,
          cc,
          object: {
            type: 'Image',
            attributedTo: actor.id,
            mediaType: image.mediaType,
            name: image.alt,
            content: image.dataUrl.replace(/=+$/, ''),
            to,
            cc,
          },
        }),
      });
      if (response.status !== 201)
        throw protocol(
          'unconfirmed-write',
          'Image Create requires 201 Created. Check the outbox before retrying.',
        );
      // Everything after 201 is hydration: no missing header/read failure can undo confirmation.
      let location: string | undefined;
      try {
        const raw = response.headers.get('Location');
        if (!raw) return {};
        location = trusted(raw, outbox);
      } catch {
        return {};
      }
      try {
        return { location, image: await resolve(location, image.mediaType, audience) };
      } catch {
        return { location };
      }
    },
  };
}
