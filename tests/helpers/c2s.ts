import { readFileSync } from 'node:fs';
import { expect, type APIRequestContext, type Locator, type Page } from '@playwright/test';

export interface Credentials {
  actorUrl: string;
  token: string;
}
/** The seeded fixture's actor and token; `npm run c2s:seed` writes them. */
export const readCredentials = (): Credentials =>
  JSON.parse(readFileSync('.local/c2s-credentials.json', 'utf8')) as Credentials;

/** How long a full walk of the grown fixture outbox may take under load. */
export const WALK = 30000;

/** Connects through the form and waits for the first card of the full walk. */
export async function connect(page: Page, credentials: Credentials) {
  await page.goto('/');
  await page.getByLabel('Actor URL').fill(credentials.actorUrl);
  await page.getByLabel('액세스 토큰').fill(credentials.token);
  await page.getByRole('button', { name: '연결하기', exact: true }).click();
  // Connecting is the full walk of the fixture's outbox (hundreds of activities, dozens of
  // pages), which takes several seconds when other suites share the machine.
  await expect(page.locator('.note-card').first()).toBeVisible({ timeout: WALK });
}

/** Presses 수정 or 삭제 on my own card; the two fold behind 관리 where the action row is narrow. */
export async function manage(card: Locator, name: '내 글 수정하기' | '내 글 삭제하기') {
  const button = card.getByRole('button', { name });
  if (!(await button.isVisible())) await card.getByRole('button', { name: /^내 글 관리/ }).click();
  await button.click();
}

/** Publishes one note through the UI and returns its card and the IRI the server gave it. */
export async function publishNote(page: Page, body: string) {
  await page.getByLabel('새 글').fill(body);
  await page.getByRole('button', { name: '게시하기', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('게시됐어요.');
  const card = page.locator('article.note-card').filter({ hasText: body });
  await expect(card).toBeVisible({ timeout: 15000 });
  // The timestamp is the permalink.
  const objectUrl = (await card.locator('a:has(time)').first().getAttribute('href'))!;
  expect(objectUrl).toMatch(/^https:\/\/localhost:8443\//);
  return { card, objectUrl };
}

const accept = { Accept: 'application/activity+json' };
const authorized = (credentials: { token: string }) => ({
  ...accept,
  Authorization: `Bearer ${credentials.token}`,
});

/** The actor document as the server publishes it (unauthenticated). */
export async function readActor(request: APIRequestContext, credentials: Credentials) {
  const response = await request.get(credentials.actorUrl, {
    headers: accept,
    ignoreHTTPSErrors: true,
  });
  return (await response.json()) as Record<string, unknown> & { outbox: string; followers: string };
}

/** An authenticated read of one stored object, for checking what the server actually kept. */
export async function readObject(
  request: APIRequestContext,
  credentials: { token: string },
  url: string,
) {
  const response = await request.get(url, {
    headers: authorized(credentials),
    ignoreHTTPSErrors: true,
  });
  return { status: response.status(), body: (await response.json()) as Record<string, unknown> };
}

/** An anonymous read of one object: what anyone else sees. */
export const readAnonymously = (request: APIRequestContext, url: string) =>
  request.get(url, { headers: accept, ignoreHTTPSErrors: true });

/** The IRI an activity names as its object, whether it is embedded or referenced. */
export const objectIri = (activity: Record<string, unknown>) =>
  typeof activity.object === 'string'
    ? activity.object
    : ((activity.object as { id?: string } | null)?.id ?? '');

/** The newest activity in this actor's outbox that `match` accepts, over the first pages. */
export async function findInOutbox(
  request: APIRequestContext,
  credentials: Credentials,
  match: (activity: Record<string, unknown>) => boolean,
  pages = 3,
): Promise<Record<string, unknown> | undefined> {
  const headers = authorized(credentials);
  let url: string | undefined = (await readActor(request, credentials)).outbox;
  for (let page = 0; page < pages && url; page++) {
    const collection = await (await request.get(url, { headers, ignoreHTTPSErrors: true })).json();
    const items: Record<string, unknown>[] = collection.orderedItems ?? collection.items ?? [];
    const found = items.find(match);
    if (found) return found;
    url = typeof collection.next === 'string' ? collection.next : undefined;
  }
  return undefined;
}

/** Posts one activity to this actor's outbox the way a second client would; returns the response. */
export async function postToOutbox(
  request: APIRequestContext,
  credentials: Credentials,
  activity: Record<string, unknown>,
) {
  const actor = await readActor(request, credentials);
  return request.post(actor.outbox, {
    headers: { ...authorized(credentials), 'Content-Type': 'application/activity+json' },
    data: { '@context': 'https://www.w3.org/ns/activitystreams', ...activity },
    ignoreHTTPSErrors: true,
  });
}

/** A second client deletes `url`; the server may answer any success, 410 included. */
export async function deleteElsewhere(
  request: APIRequestContext,
  credentials: Credentials,
  url: string,
) {
  const response = await postToOutbox(request, credentials, {
    type: 'Delete',
    actor: credentials.actorUrl,
    object: url,
  });
  expect([200, 201, 202, 410]).toContain(response.status());
}

/** Deletes the notes a test pushed, so they do not pile up as live posts in the fixture. */
export async function deleteAll(
  request: APIRequestContext,
  credentials: Credentials,
  urls: string[],
) {
  for (const url of urls) await deleteElsewhere(request, credentials, url);
}

/**
 * Twenty-one more posts from a second client, pushing `objectUrl`'s Create past the first
 * outbox page of twenty. The tab never reloads for them: it still holds the note from its
 * own read. ONI orders rows by `published` to the second, so posts in the same second would
 * interleave with the note; the extras wait for the next second to sort strictly before it.
 * Returns the extras' IRIs so the caller can delete them again.
 */
export async function pushPastFirstPage(
  page: Page,
  request: APIRequestContext,
  credentials: Credentials,
  objectUrl: string,
): Promise<string[]> {
  await page.waitForTimeout(1100);
  const extras: string[] = [];
  for (let i = 0; i < 21; i++) {
    const response = await postToOutbox(request, credentials, {
      type: 'Create',
      actor: credentials.actorUrl,
      to: ['https://www.w3.org/ns/activitystreams#Public'],
      object: {
        type: 'Note',
        attributedTo: credentials.actorUrl,
        content: `밀어내는 글 ${i} ${Date.now()}`,
        mediaType: 'text/html',
        to: ['https://www.w3.org/ns/activitystreams#Public'],
      },
    });
    expect(response.status()).toBe(201);
    const created = await readObject(request, credentials, response.headers()['location']!);
    extras.push(objectIri(created.body));
  }
  const firstPage = await findInOutbox(
    request,
    credentials,
    (activity) => activity.type === 'Create' && objectIri(activity) === objectUrl,
    1,
  );
  expect(firstPage, 'the Create is no longer on the first outbox page').toBeUndefined();
  return extras;
}
