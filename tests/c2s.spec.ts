import { test, expect } from '@playwright/test';
import {
  WALK,
  connect,
  deleteAll,
  deleteElsewhere,
  findInOutbox,
  manage,
  objectIri,
  publishNote,
  pushPastFirstPage,
  readActor,
  readAnonymously,
  readCredentials,
  readObject,
} from './helpers/c2s';

// This suite deliberately fails if the real fixture was not provisioned.
// `npm run test:e2e:ui` runs the isolated UI tests without Docker. Each test asserts what the
// real server stored or answered; the layout around those writes is covered in tests/ui.spec.ts
// and tests/writes.spec.ts against a mock server.
test.use({ ignoreHTTPSErrors: true });
// A test connects once or twice and may push, edit and delete dozens of posts around that
// walk; the default 30s budget is the walk allowance alone, so it is raised here.
test.setTimeout(120000);

test('real ONI: connect, publish, reply, and find both again after a reconnect', async ({
  page,
}) => {
  const credentials = readCredentials();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'warning' && /[A-Z_]{6,}/.test(message.text()))
      errors.push(message.text());
  });
  await connect(page, credentials);
  const message = `브라우저에서 남기는 이야기 ${Date.now()}`;
  const { card: post } = await publishNote(page, message);
  await post.getByRole('button', { name: /답글 달기/ }).click();
  const reply = `그리고 이어지는 답글 ${Date.now()}`;
  await page.getByLabel('답글 내용').fill(reply);
  await page.getByRole('button', { name: '답글 게시하기', exact: true }).click();
  await expect(page.locator('.note-card').filter({ hasText: reply })).toBeVisible();
  // Both are persisted: a fresh connection's full walk of the outbox lists them again.
  await page.reload();
  await connect(page, credentials);
  await expect(page.locator('.note-card').filter({ hasText: message })).toBeVisible({
    timeout: WALK,
  });
  await expect(page.locator('.note-card').filter({ hasText: reply })).toBeVisible();
  expect(errors).toEqual([]);
});

test('real ONI: a like is stored in the outbox and withdrawn by deleting its activity', async ({
  page,
  request,
}) => {
  const credentials = readCredentials();
  await connect(page, credentials);
  // React to a fresh post rather than a possibly already liked one.
  const { card, objectUrl } = await publishNote(page, `좋아요를 받을 이야기 ${Date.now()}`);
  // The label changes with the state (좋아요 → 좋아함), so the name is matched on its stem.
  const like = card.getByRole('button', { name: /^좋아/ });
  await expect(like).toHaveAttribute('aria-pressed', 'false');
  await like.click();
  await expect(like).toHaveAttribute('aria-pressed', 'true');
  const isOwnLike = (activity: Record<string, unknown>) =>
    activity.type === 'Like' && objectIri(activity) === objectUrl;
  expect(await findInOutbox(request, credentials, isOwnLike), 'the Like is stored').toBeTruthy();
  // Withdrawing deletes that activity; ONI answers a Delete with 410 Gone, which is success.
  await like.click();
  await expect(page.getByRole('status')).toHaveText('좋아요를 취소했어요.');
  await expect(like).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(
    await findInOutbox(request, credentials, isOwnLike),
    'the Like left the outbox',
  ).toBeUndefined();
});

test('real ONI: a followers-only note with a content warning is stored with summary and no Public', async ({
  page,
  request,
}) => {
  const credentials = readCredentials();
  await connect(page, credentials);
  const composer = page.locator('.main-composer');
  const body = `가려둔 이야기 ${Date.now()}`;
  // The body is hidden behind the warning, so this card is found by its warning line, which
  // carries the run's own stamp: earlier runs left warned cards on the fixture.
  const label = `테스트 경고 ${Date.now()}`;
  await page.getByLabel('새 글').fill(body);
  await composer.getByRole('button', { name: '경고 문구 추가' }).click();
  await composer.getByLabel('경고 문구').fill(label);
  await composer.getByRole('radio', { name: '팔로워만' }).check();
  await page.getByRole('button', { name: '게시하기', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('게시됐어요.');
  const card = page
    .locator('article.note-card')
    .filter({ has: page.locator('.content-warning-label', { hasText: label }) });
  await expect(card).toHaveCount(1, { timeout: 15000 });
  const objectUrl = (await card.locator('a:has(time)').first().getAttribute('href'))!;
  expect(objectUrl).toMatch(/^https:\/\/localhost:8443\//);
  // What the server kept: the summary, followers-only addressing, and no Public anywhere.
  const actor = await readActor(request, credentials);
  const stored = await readObject(request, credentials, objectUrl);
  expect(stored.body.summary).toBe(label);
  expect(stored.body.to).toEqual([actor.followers]);
  expect(JSON.stringify(stored.body)).not.toContain('#Public');
  expect(stored.body.content).toContain(body);
});

test('real ONI: sharing a followers-only note stores an Announce with no Public recipient', async ({
  page,
  request,
}) => {
  const credentials = readCredentials();
  await connect(page, credentials);
  const actor = await readActor(request, credentials);
  const body = `공유 범위를 지키는 이야기 ${Date.now()}`;
  await page.getByLabel('새 글').fill(body);
  await page.locator('.main-composer').getByRole('radio', { name: '팔로워만' }).check();
  await page.getByRole('button', { name: '게시하기', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('게시됐어요.');
  const card = page.locator('article.note-card').filter({ hasText: body });
  await expect(card).toBeVisible({ timeout: 15000 });
  const objectUrl = await card.locator('a:has(time)').first().getAttribute('href');
  const share = card.getByRole('button', { name: /^공유/ });
  await share.click();
  await expect(page.getByRole('status')).toHaveText('공유했어요.');
  await expect(share).toHaveAttribute('aria-pressed', 'true', { timeout: 15000 });
  // What the server actually stored: addressed to followers, with Public nowhere in it.
  const announce = await findInOutbox(
    request,
    credentials,
    (activity) => activity.type === 'Announce' && objectIri(activity) === objectUrl,
  );
  expect(announce, 'the Announce is in the outbox').toBeTruthy();
  expect(announce!.to).toEqual([actor.followers]);
  expect(JSON.stringify(announce!.to ?? [])).not.toContain('#Public');
  expect(JSON.stringify(announce!.cc ?? [])).not.toContain('#Public');
});

test('real ONI: my own note is deleted with a Tombstone and stays gone after a full walk', async ({
  page,
  request,
}) => {
  const credentials = readCredentials();
  await connect(page, credentials);
  const message = `지울 이야기 ${Date.now()}`;
  const { card, objectUrl } = await publishNote(page, message);
  await manage(card, '내 글 삭제하기');
  await page.getByRole('button', { name: '삭제하기', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('내 서버에서 글을 지웠어요');
  await expect(card).toHaveCount(0);
  // ONI answers a Delete with 410 Gone: a success, so nothing is reported as a failure.
  await expect(page.getByRole('alert')).toHaveCount(0);
  const stored = await readObject(request, credentials, objectUrl);
  expect(stored.status).toBe(410);
  expect(stored.body).toMatchObject({ type: 'Tombstone', formerType: 'Note' });
  // The Create stays in the outbox with that Tombstone in it; the full walk must not bring
  // the note back.
  await page.reload();
  await connect(page, credentials);
  await expect(page.locator('article.note-card').filter({ hasText: message })).toHaveCount(0);
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('real ONI: editing my own note rewrites its content and warning and keeps its audience', async ({
  page,
  request,
}) => {
  const credentials = readCredentials();
  await connect(page, credentials);
  const message = `고칠 이야기 ${Date.now()}`;
  const { card: published, objectUrl } = await publishNote(page, message);
  const before = await readObject(request, credentials, objectUrl);
  expect(before.status).toBe(200);
  // ONI stamps `updated` at creation with the publication time; an equal stamp is not an
  // edit, so a freshly published note must not carry the marker.
  expect(before.body.updated).toBe(before.body.published);
  await expect(published.locator('.note-edited')).toHaveCount(0);
  await manage(published, '내 글 수정하기');
  const form = page.locator('.inline-edit');
  const edited = `고친 이야기 ${Date.now()}`;
  const label = `수정 경고 ${Date.now()}`;
  await form.getByLabel('글 수정').fill(edited);
  await form.getByRole('button', { name: '경고 문구 추가' }).click();
  await form.getByLabel('경고 문구').fill(label);
  await form.getByRole('button', { name: '수정하기', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('글을 수정했어요.');
  // What the server stored: both fields changed, `updated` set, addressing untouched.
  const after = await readObject(request, credentials, objectUrl);
  expect(after.status).toBe(200);
  expect(String(after.body.content)).toContain(edited);
  expect(String(after.body.content)).not.toContain(message);
  expect(after.body.summary).toBe(label);
  expect(after.body.updated).toBeTruthy();
  // No addressing was sent in the patch, and the stored audience is unchanged by it.
  expect(after.body.to).toEqual(before.body.to);
  // This server does not move `updated` on an Update (an explicit one in the patch is
  // ignored too), so it cannot tell the client that the note was edited and the marker
  // stays off. The marker itself is covered against a server that does move it in
  // tests/ui.spec.ts; nothing here pretends the edit was announced.
  expect(after.body.updated).toBe(before.body.updated);
  const card = page
    .locator('article.note-card')
    .filter({ has: page.locator('.content-warning-label', { hasText: label }) });
  await expect(card).toHaveCount(1, { timeout: 15000 });
  await expect(card.locator('.note-edited')).toHaveCount(0);
});

test('real ONI: editing a note another client deleted refuses instead of republishing it', async ({
  page,
  request,
}) => {
  const credentials = readCredentials();
  await connect(page, credentials);
  const { card, objectUrl } = await publishNote(page, `사라질 이야기 ${Date.now()}`);
  // A second client deletes the note. This tab never hears about it: its card is stale.
  await deleteElsewhere(request, credentials, objectUrl);
  expect((await readObject(request, credentials, objectUrl)).status).toBe(410);
  const revived = `되살아나면 안 되는 이야기 ${Date.now()}`;
  await manage(card, '내 글 수정하기');
  const form = page.locator('.inline-edit');
  await form.getByLabel('글 수정').fill(revived);
  await form.getByRole('button', { name: '수정하기', exact: true }).click();
  // Refused, and the stale card leaves the list instead of inviting a retry.
  await expect(page.getByRole('alert')).toContainText('서버에 더 이상 없어요');
  await expect(card).toHaveCount(0);
  // The server still reports the object gone, to this client and to anyone else.
  const after = await readObject(request, credentials, objectUrl);
  expect(after.status).toBe(410);
  expect(after.body).toMatchObject({ type: 'Tombstone' });
  expect(JSON.stringify(after.body)).not.toContain(revived);
  const anonymous = await readAnonymously(request, objectUrl);
  expect(anonymous.status()).toBe(410);
  expect(await anonymous.text()).not.toContain(revived);
  // No Update for it ever reached the outbox.
  expect(
    await findInOutbox(
      request,
      credentials,
      (activity) => activity.type === 'Update' && objectIri(activity) === objectUrl,
    ),
    'no Update was sent for a deleted note',
  ).toBeUndefined();
});

test('real ONI: deleting a note that is already gone is reported as gone, not as a deletion', async ({
  page,
  request,
}) => {
  const credentials = readCredentials();
  await connect(page, credentials);
  const { card, objectUrl } = await publishNote(page, `두 번 지울 이야기 ${Date.now()}`);
  await deleteElsewhere(request, credentials, objectUrl);
  expect((await readObject(request, credentials, objectUrl)).status).toBe(410);
  await manage(card, '내 글 삭제하기');
  await page.getByRole('button', { name: '삭제하기', exact: true }).click();
  // Truthful, and not an error the reader has to act on.
  await expect(page.getByRole('status')).toContainText('이미 지워진 글이라');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(card).toHaveCount(0);
});

test('real ONI: a published note appears after an incremental read of at most 3 GETs', async ({
  page,
}) => {
  const credentials = readCredentials();
  await connect(page, credentials);
  await expect(page.getByRole('button', { name: '타임라인 새로고침' })).not.toHaveAttribute(
    'aria-busy',
    'true',
  );
  // Every GET to the actor's server between the publish and the card being on screen. The
  // full walk of a long outbox is dozens; the read after a write must be the first pages.
  const origin = new URL(credentials.actorUrl).origin;
  const gets: string[] = [];
  let counting = false;
  page.on('request', (request) => {
    if (counting && request.method() === 'GET' && request.url().startsWith(origin))
      gets.push(new URL(request.url()).pathname);
  });
  const message = `빠르게 보이는 이야기 ${Date.now()}`;
  await page.getByLabel('새 글').fill(message);
  counting = true;
  const started = Date.now();
  await page.getByRole('button', { name: '게시하기', exact: true }).click();
  const card = page.locator('article.note-card').filter({ hasText: message });
  await expect(card).toBeVisible({ timeout: 15000 });
  const elapsed = Date.now() - started;
  await expect(page.getByRole('status')).toHaveText('게시됐어요.');
  await expect(page.getByRole('button', { name: '타임라인 새로고침' })).not.toHaveAttribute(
    'aria-busy',
    'true',
  );
  counting = false;
  test.info().annotations.push({
    type: 'publish-to-card',
    description: `${elapsed} ms, ${gets.length} GETs`,
  });
  console.log(`publish-to-card: ${elapsed} ms, ${gets.length} GETs`);
  expect(gets.length, `GETs after publish: ${gets.length}`).toBeLessThanOrEqual(3);
});

test('real ONI: editing a note whose Create fell past the first outbox page shows the new words at once', async ({
  page,
  request,
}) => {
  const credentials = readCredentials();
  await connect(page, credentials);
  const { objectUrl } = await publishNote(page, `오래된 이야기 ${Date.now()}`);
  const extras = await pushPastFirstPage(page, request, credentials, objectUrl);
  try {
    const origin = new URL(credentials.actorUrl).origin;
    const gets: string[] = [];
    let counting = false;
    page.on('request', (r) => {
      if (counting && r.method() === 'GET' && r.url().startsWith(origin))
        gets.push(new URL(r.url()).pathname);
    });
    // The card is found by the note it stands for: its words are about to change.
    const mine = page.locator(`article.note-card[data-note="${objectUrl}"]`);
    await expect(mine).toHaveCount(1);
    await manage(mine, '내 글 수정하기');
    const form = page.locator('.inline-edit');
    const edited = `고쳐진 오래된 이야기 ${Date.now()}`;
    await form.getByLabel('글 수정').fill(edited);
    counting = true;
    await form.getByRole('button', { name: '수정하기', exact: true }).click();
    // The card shows the new words within a second, whatever the first page lists: the
    // edited object is read back on its own, not looked for on page one.
    await expect(mine.locator('.note-content')).toContainText(edited, { timeout: 1000 });
    await expect(page.getByRole('status')).toHaveText('글을 수정했어요.');
    await expect(page.getByRole('button', { name: '타임라인 새로고침' })).not.toHaveAttribute(
      'aria-busy',
      'true',
    );
    counting = false;
    // The existence check before the Update, then the object read back, the inbox root and
    // the outbox root: nothing walks the outbox to find the note.
    console.log(`edit-to-card: ${gets.length} GETs`);
    expect(gets.length, `GETs around the edit: ${gets.join(' ')}`).toBeLessThanOrEqual(4);
    const stored = await readObject(request, credentials, objectUrl);
    expect(String(stored.body.content)).toContain(edited);
  } finally {
    // Tidy up on any outcome: the pushed posts and the note never pile up in the fixture.
    await deleteAll(request, credentials, [...extras, objectUrl]);
  }
});

test('real ONI: deleting a note whose Create fell past the first outbox page removes its card and answers 410', async ({
  page,
  request,
}) => {
  const credentials = readCredentials();
  await connect(page, credentials);
  const { objectUrl } = await publishNote(page, `오래되어 지울 이야기 ${Date.now()}`);
  const extras = await pushPastFirstPage(page, request, credentials, objectUrl);
  try {
    const mine = page.locator(`article.note-card[data-note="${objectUrl}"]`);
    await expect(mine).toHaveCount(1);
    await manage(mine, '내 글 삭제하기');
    await page.getByRole('button', { name: '삭제하기', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('내 서버에서 글을 지웠어요');
    // The card leaves on the Delete's answer alone, whatever the first outbox page lists.
    await expect(mine).toHaveCount(0);
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(page.getByRole('button', { name: '타임라인 새로고침' })).not.toHaveAttribute(
      'aria-busy',
      'true',
    );
    await expect(mine).toHaveCount(0);
    // Gone for everyone: an anonymous read of the note answers 410, not the note.
    expect((await readAnonymously(request, objectUrl)).status()).toBe(410);
  } finally {
    await deleteAll(request, credentials, extras);
  }
});
