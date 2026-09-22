import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import type { Page } from '@playwright/test';
import type { ASObject } from '../../src/domain/social';

export interface DeliveryAudit {
  activity_hash: string;
  object_hash: string;
  remote_targets: number;
  completed: boolean;
  local_failed: boolean;
  remote_failed: boolean;
}

/** Raw fixture logs stay inside this function and are never attached to errors. */
export async function readDeliveryAudit(
  directory: string,
  since: string,
  service: 'alice' | 'bob',
  objectURL: string,
): Promise<DeliveryAudit | undefined> {
  if (!['alice', 'bob'].includes(service) || !Number.isFinite(Date.parse(since)))
    throw new Error('Invalid delivery audit request');
  const objectHash = createHash('sha256').update(objectURL).digest('hex');
  const stdout = await new Promise<string>((accept, reject) => {
    execFile(
      'docker',
      [
        'compose',
        '-f',
        resolve(directory, 'compose.yaml'),
        'logs',
        '--no-log-prefix',
        '--since',
        since,
        service,
      ],
      { encoding: 'utf8', timeout: 10000, maxBuffer: 4 * 1024 * 1024 },
      (error, output) => {
        if (error) reject(new Error('Delivery audit logs unavailable'));
        else accept(output);
      },
    );
  });
  const prefix = 'KIMINO_DELIVERY_AUDIT ';
  let found: DeliveryAudit | undefined;
  for (const line of stdout.split(/\r?\n/)) {
    if (!line.startsWith(prefix)) continue;
    let value: unknown;
    try {
      value = JSON.parse(line.slice(prefix.length));
    } catch {
      throw new Error('Malformed delivery audit marker');
    }
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new Error('Malformed delivery audit marker');
    const record = value as Record<string, unknown>;
    if (record.object_hash !== objectHash) continue;
    if (
      typeof record.activity_hash !== 'string' ||
      !/^[0-9a-f]{64}$/.test(record.activity_hash) ||
      typeof record.object_hash !== 'string' ||
      !/^[0-9a-f]{64}$/.test(record.object_hash) ||
      !Number.isSafeInteger(record.remote_targets) ||
      (record.remote_targets as number) < 0 ||
      typeof record.completed !== 'boolean' ||
      typeof record.local_failed !== 'boolean' ||
      typeof record.remote_failed !== 'boolean'
    )
      throw new Error('Malformed matching delivery audit marker');
    const next: DeliveryAudit = {
      activity_hash: record.activity_hash,
      object_hash: record.object_hash,
      remote_targets: record.remote_targets as number,
      completed: record.completed,
      local_failed: record.local_failed,
      remote_failed: record.remote_failed,
    };
    if (found && JSON.stringify(found) !== JSON.stringify(next))
      throw new Error('Conflicting matching delivery audit markers');
    found = next;
  }
  return found;
}

async function completeFixtureRead(
  page: Page,
  actor: string,
  token: string,
  operation: 'followers' | 'following' | 'inbox',
  objectURL?: string,
): Promise<number | boolean> {
  try {
    return await page.evaluate(
      async ({ actor, token, operation, objectURL }) => {
        try {
          const profileURL = new URL(actor);
          if (
            profileURL.protocol !== 'https:' ||
            profileURL.username ||
            profileURL.password ||
            profileURL.hash
          )
            throw new Error();
          const fetchObject = async (input: string): Promise<ASObject> => {
            const url = new URL(input, profileURL);
            if (url.origin !== profileURL.origin || url.username || url.password || url.hash)
              throw new Error();
            const response = await fetch(url.href, {
              headers: { Accept: 'application/activity+json', Authorization: `Bearer ${token}` },
              redirect: 'error',
              credentials: 'omit',
              referrerPolicy: 'no-referrer',
              signal: AbortSignal.timeout(10000),
            });
            if (
              !response.ok ||
              !/^(application\/activity\+json|application\/ld\+json|application\/json)(?:\s*;|$)/i.test(
                response.headers.get('content-type') ?? '',
              )
            )
              throw new Error();
            const reader = response.body?.getReader();
            if (!reader) throw new Error();
            const chunks: Uint8Array[] = [];
            let bytes = 0;
            try {
              for (;;) {
                const chunk = await reader.read();
                if (chunk.done) break;
                bytes += chunk.value.byteLength;
                if (bytes > 1048576) {
                  await reader.cancel();
                  throw new Error();
                }
                chunks.push(chunk.value);
              }
            } finally {
              reader.releaseLock();
            }
            const data = new Uint8Array(bytes);
            let offset = 0;
            for (const chunk of chunks) {
              data.set(chunk, offset);
              offset += chunk.byteLength;
            }
            const value: unknown = JSON.parse(new TextDecoder().decode(data));
            if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
            return value as ASObject;
          };
          const id = (value: unknown): string | undefined => {
            if (typeof value === 'string') return value;
            if (value && typeof value === 'object') {
              const record = value as Record<string, unknown>;
              if (typeof record.id === 'string') return record.id;
              if (typeof record.href === 'string') return record.href;
            }
            return undefined;
          };
          const profile = await fetchObject(actor);
          if (id(profile) !== profileURL.href) throw new Error();
          const start = id(profile[operation]);
          if (!start) throw new Error();
          if (operation !== 'inbox') {
            const modulePath = '/src/activitypub/membership-reader.ts';
            const { readMembership } = (await import(
              /* @vite-ignore */ modulePath
            )) as typeof import('../../src/activitypub/membership-reader');
            return (
              await readMembership(start, {
                actorOrigin: profileURL.origin,
                fetch: fetchObject,
                maxPages: 100,
              })
            ).length;
          }
          const modulePath = '/src/activitypub/collection-reader.ts';
          const { createCollectionReader } = (await import(
            /* @vite-ignore */ modulePath
          )) as typeof import('../../src/activitypub/collection-reader');
          const read = createCollectionReader({
            fetch: fetchObject,
            maxPages: 100,
            trustedOrigin: profileURL.origin,
            resolveObjects: false,
          });
          const result = await read(start);
          return result.items.some(
            (item) => id(item) === objectURL || id(item.object) === objectURL,
          );
        } catch {
          throw new Error('Complete fixture read failed');
        }
      },
      { actor, token, operation, objectURL },
    );
  } catch {
    throw new Error('Complete fixture read failed');
  }
}

export async function completeMembershipCount(
  page: Page,
  actor: string,
  token: string,
  kind: 'followers' | 'following',
): Promise<number> {
  const result = await completeFixtureRead(page, actor, token, kind);
  if (typeof result !== 'number') throw new Error('Invalid complete membership result');
  return result;
}

export async function inboxContainsObject(
  page: Page,
  actor: string,
  token: string,
  objectURL: string,
): Promise<boolean> {
  const result = await completeFixtureRead(page, actor, token, 'inbox', objectURL);
  if (typeof result !== 'boolean') throw new Error('Invalid complete inbox result');
  return result;
}

/** Known synthetic local resource only; return evidence, never its response body. */
export async function inspectObjectAccess(
  page: Page,
  actor: string,
  objectURL: string,
  expectedText: string,
  token?: string,
  throughOwnerProxy = false,
): Promise<{
  status: number;
  containsText: boolean;
  publiclyCacheable: boolean;
  privateNoStore: boolean;
}> {
  try {
    return await page.evaluate(
      async ({ actor, objectURL, expectedText, token, throughOwnerProxy }) => {
        const target = new URL(objectURL);
        if (
          target.origin !== new URL(actor).origin ||
          target.protocol !== 'https:' ||
          target.username ||
          target.password ||
          target.hash
        )
          throw new Error();
        const headers: Record<string, string> = { Accept: 'application/activity+json' };
        if (token) headers.Authorization = `Bearer ${token}`;
        if (throughOwnerProxy) headers['Content-Type'] = 'application/x-www-form-urlencoded';
        const response = await fetch(
          throughOwnerProxy ? new URL('proxyUrl', actor).href : target.href,
          {
            method: throughOwnerProxy ? 'POST' : 'GET',
            body: throughOwnerProxy
              ? new URLSearchParams({ id: target.href }).toString()
              : undefined,
            headers,
            credentials: 'omit',
            redirect: 'error',
            referrerPolicy: 'no-referrer',
            cache: 'no-store',
            signal: AbortSignal.timeout(10000),
          },
        );
        const reader = response.body?.getReader();
        if (!reader) throw new Error();
        let text = '';
        let bytes = 0;
        const decoder = new TextDecoder();
        try {
          for (;;) {
            const part = await reader.read();
            if (part.done) break;
            bytes += part.value.byteLength;
            if (bytes > 1048576) {
              await reader.cancel();
              throw new Error();
            }
            text += decoder.decode(part.value, { stream: true });
          }
          text += decoder.decode();
        } finally {
          reader.releaseLock();
        }
        return {
          status: response.status,
          containsText: text.includes(expectedText),
          privateNoStore:
            /(?:^|,)\s*private(?:\s|,|$)/i.test(response.headers.get('cache-control') ?? '') &&
            /(?:^|,)\s*no-store(?:\s|,|$)/i.test(response.headers.get('cache-control') ?? ''),
          publiclyCacheable: /(?:^|,)\s*public(?:\s|,|$)/i.test(
            response.headers.get('cache-control') ?? '',
          ),
        };
      },
      { actor, objectURL, expectedText, token, throughOwnerProxy },
    );
  } catch {
    throw new Error('Fixture object access check failed');
  }
}
