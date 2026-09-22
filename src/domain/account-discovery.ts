import { record, safeUrl } from './activitystreams';
export interface AccountHandle {
  username: string;
  host: string;
  resource: string;
  endpoint: string;
  display: string;
}
export interface DiscoveryResult {
  handle: string;
  actorUrl: string;
}

/** Deliberately strict handle input; an actor URL remains a separate discovery path. */
export function parseAccountHandle(input: string): AccountHandle | undefined {
  const match = /^@?([^@]+)@([^@]+)$/.exec(input);
  if (!match) return undefined;
  const [, username, authority] = match;
  if (
    /[\s\u0000-\u001f\u007f:/?#\\%]/.test(username) ||
    /[\s\u0000-\u001f\u007f/?#\\%]/.test(authority)
  )
    return undefined;
  try {
    const url = new URL(`https://${authority}`);
    if (
      !url.hostname ||
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search ||
      url.hash
    )
      return undefined;
    const host = url.host;
    const resource = `acct:${username}@${host}`;
    return {
      username,
      host,
      resource,
      endpoint: `https://${host}/.well-known/webfinger?resource=${encodeURIComponent(resource)}`,
      display: `@${username}@${host}`,
    };
  } catch {
    return undefined;
  }
}
function activityType(value: string): boolean {
  const parts = value.split(';').map((part) => part.trim());
  if (parts[0].toLowerCase() === 'application/activity+json') return parts.length === 1;
  return (
    parts[0].toLowerCase() === 'application/ld+json' &&
    parts.length === 2 &&
    /^profile\s*=\s*"https:\/\/www\.w3\.org\/ns\/activitystreams"$/i.test(parts[1])
  );
}
/** Returns the server's asserted actor address, never a verified-person claim. */
export function parseAccountDiscovery(
  value: unknown,
  handle: AccountHandle,
): DiscoveryResult | undefined {
  if (
    !record(value) ||
    typeof value.subject !== 'string' ||
    !/^acct:/i.test(value.subject) ||
    !Array.isArray(value.links)
  )
    return undefined;
  if (value.subject[5] === '@') return undefined;
  const subject = parseAccountHandle(value.subject.slice(5));
  if (!subject || subject.resource !== handle.resource) return undefined;
  const targets = new Set<string>();
  for (const link of value.links) {
    if (!record(link)) return undefined;
    if (link.rel !== 'self') continue;
    if (typeof link.type !== 'string') return undefined;
    if (!activityType(link.type)) {
      if (
        ['application/activity+json', 'application/ld+json'].includes(
          link.type.split(';')[0].trim().toLowerCase(),
        )
      )
        return undefined;
      continue;
    }
    if (typeof link.href !== 'string' || !link.href.trim() || link.href !== link.href.trim())
      return undefined;
    try {
      const target = safeUrl(link.href);
      if (new URL(target).hash) return undefined;
      targets.add(target);
    } catch {
      return undefined;
    }
  }
  return targets.size === 1 ? { handle: handle.display, actorUrl: [...targets][0] } : undefined;
}
