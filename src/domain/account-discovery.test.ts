import { expect, it } from 'vitest';
import { parseAccountHandle, parseAccountDiscovery } from './account-discovery';
const handle = () => parseAccountHandle('@Alice@EXAMPLE.org')!;
it('normalizes host names while preserving username case and explicit HTTPS ports', () => {
  expect(handle()).toEqual({
    username: 'Alice',
    host: 'example.org',
    resource: 'acct:Alice@example.org',
    endpoint: 'https://example.org/.well-known/webfinger?resource=acct%3AAlice%40example.org',
    display: '@Alice@example.org',
  });
  expect(parseAccountHandle('alice@localhost:18448')?.host).toBe('localhost:18448');
  expect(parseAccountHandle('alice@bücher.example')?.host).toBe('xn--bcher-kva.example');
});
it.each([
  'a@b@c',
  '@a',
  'a@example.org/path',
  'a@example.org?x',
  'a@example.org#x',
  'a@user:pass@example.org',
  ' a@example.org',
  'a b@example.org',
  'a@example.org\\evil',
  'a@https://example.org',
  'a%2fb@example.org',
  'a@example.org:bad',
  'acct:a@example.org',
])('refuses ambiguous handles %s', (input) => expect(parseAccountHandle(input)).toBeUndefined());
it('accepts a unique self AP link including cross-host asserted targets', () => {
  expect(
    parseAccountDiscovery(
      {
        subject: 'acct:Alice@EXAMPLE.ORG',
        links: [
          {
            rel: 'self',
            type: 'application/activity+json',
            href: 'https://actor.example/users/alice',
          },
        ],
      },
      handle(),
    ),
  ).toEqual({ handle: '@Alice@example.org', actorUrl: 'https://actor.example/users/alice' });
  expect(
    parseAccountDiscovery(
      {
        subject: 'acct:Alice@example.org',
        links: [
          {
            rel: 'self',
            type: 'application/ld+json; profile="https://www.w3.org/ns/activitystreams"',
            href: 'https://example.org/a',
          },
        ],
      },
      handle(),
    )?.actorUrl,
  ).toBe('https://example.org/a');
});
it.each([
  {
    subject: 'acct:alice@example.org',
    links: [{ rel: 'self', type: 'application/activity+json', href: 'https://example.org/a' }],
  },
  {
    subject: 'acct:Alice@example.org',
    links: [{ rel: 'self', type: 'application/activity+json', href: 'javascript:bad' }],
  },
  {
    subject: 'acct:Alice@example.org',
    links: [
      { rel: 'self', type: 'application/activity+json', href: 'https://example.org/a' },
      { rel: 'self', type: 'application/activity+json', href: 'https://example.org/b' },
    ],
  },
  {
    subject: 'acct:Alice@example.org',
    links: [{ rel: 'self', type: 'application/activity+json' }],
  },
  {
    subject: 'acct:Alice@example.org',
    links: [{ rel: 'self', type: 'application/ld+json', href: 'https://example.org/a' }],
  },
])('rejects mismatched subjects and malformed/conflicting self evidence', (value) =>
  expect(parseAccountDiscovery(value, handle())).toBeUndefined(),
);
it('does not ignore malformed AP self links beside a good one', () => {
  const good = { rel: 'self', type: 'application/activity+json', href: 'https://example.org/a' };
  expect(
    parseAccountDiscovery(
      {
        subject: 'acct:Alice@example.org',
        links: [
          good,
          {
            rel: 'self',
            type: 'application/activity+json; unsupported=yes',
            href: 'https://example.org/b',
          },
        ],
      },
      handle(),
    ),
  ).toBeUndefined();
});
it('does not accept a display-handle prefix inside an acct subject', () => {
  expect(
    parseAccountDiscovery(
      {
        subject: 'acct:@Alice@example.org',
        links: [{ rel: 'self', type: 'application/activity+json', href: 'https://example.org/a' }],
      },
      handle(),
    ),
  ).toBeUndefined();
});
