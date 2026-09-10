import type { Actor } from '../domain/social';

/** What a person is called on screen, and the address that tells two of them apart. */
export interface ActorName {
  /** `name`, else `preferredUsername`, else the IRI's last path segment, else its host. */
  readonly primary: string;
  /** `@user@host`, or the host alone; absent when it would only repeat the primary label. */
  readonly secondary?: string;
}

/**
 * The pieces of an actor IRI a label can be built from; nothing when it is not a URL. A
 * Takahe-style path (`/@alice`, `/@alice@remote.host/`) already carries the address in its
 * segment: the leading `@` is not part of the name, and a host inside the segment is the
 * account's own, so it wins over the URL's.
 */
function parts(id: string): { user?: string; host: string } | undefined {
  try {
    const url = new URL(id);
    const segment = url.pathname.split('/').filter(Boolean).at(-1)?.replace(/^@/, '');
    const at = segment?.indexOf('@') ?? -1;
    if (segment && at > 0)
      return { user: segment.slice(0, at), host: segment.slice(at + 1) || url.host };
    return { user: segment || undefined, host: url.host };
  } catch {
    return undefined;
  }
}

/**
 * Only the connected account's profile is loaded, so only it can be named by its `name` or
 * `preferredUsername`; every other author is named by its IRI. A one-person server whose
 * actor lives at the root (`https://host/`) used to be called by its host alone, which is
 * an address, not a name.
 */
export function actorName(
  id: string,
  self?: Pick<Actor, 'id' | 'name' | 'preferredUsername'>,
): ActorName {
  const iri = parts(id);
  if (!iri) return { primary: id };
  const mine = !!self && self.id === id;
  const user = (mine && self.preferredUsername) || iri.user;
  const primary = (mine && (self.name || self.preferredUsername)) || user || iri.host;
  const secondary = user ? `@${user}@${iri.host}` : iri.host;
  return secondary === primary ? { primary } : { primary, secondary };
}

/** The primary label alone, for prose ("…님이 공유", "…에게"). */
export const actorLabelOf = (id: string, self?: Pick<Actor, 'id' | 'name' | 'preferredUsername'>) =>
  actorName(id, self).primary;

/** A path segment that reads as a username: short and plain ASCII, digits allowed anywhere. */
const USERNAME = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,29}$/;
/**
 * Misskey's account ids: ten `[0-9a-z]` characters under `/users/`, with or without an `@host`
 * suffix. An aid mixes digits and letters: ten plain letters (`alexanders`) or ten digits are
 * a username and an all-digit id, not an aid.
 */
const MISSKEY_AID = /\/users\/(?=[0-9a-z]*\d)(?=[0-9a-z]*[a-z])[0-9a-z]{10}(@[^/]*)?\/?$/;

/**
 * What a remembered tab can call its account before the actor document arrives: only the
 * username the IRI itself carries. An actor that lives at its server root has nothing but a
 * host in its IRI, and a host is an address, not a name - so nothing is returned for it.
 * Neither is an opaque account id: an all-digit segment (`/users/123`) or Misskey's aid
 * (`/users/9k2jd8a1xq`). A username may open with a digit, as Mastodon allows (`2ndlaw`).
 */
export function nameFromIri(id: string): string | undefined {
  const user = parts(id)?.user;
  if (!user || !USERNAME.test(user) || /^\d+$/.test(user)) return undefined;
  let pathname: string;
  try {
    pathname = new URL(id).pathname;
  } catch {
    return undefined;
  }
  return MISSKEY_AID.test(pathname) ? undefined : user;
}
