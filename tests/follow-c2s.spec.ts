import { test, expect, type Page } from '@playwright/test';
import { followToken } from './helpers/follow-c2s';
import {
  readDeliveryAudit,
  completeMembershipCount,
  inboxContainsObject,
  inspectObjectAccess,
} from './helpers/follow-audit';

const directory = process.env.KIMINO_FOLLOW_FIXTURE_DIR;
const port = process.env.KIMINO_FOLLOW_PORT ?? '18447';
const alice = `https://alice.test:${port}/`;
const bob = `https://bob.test:${port}/`;
test.skip(!directory, 'Requires the explicitly corrected two-actor fixture');
test.use({
  ignoreHTTPSErrors: true,
  actionTimeout: 15000,
  trace: 'off',
  screenshot: 'off',
  video: 'off',
  launchOptions: {
    args: ['--host-resolver-rules=MAP alice.test 127.0.0.1,MAP bob.test 127.0.0.1'],
  },
});
test.setTimeout(120000);
async function connect(page: Page, actor: string) {
  const token = await followToken(actor, directory!);
  await page.goto('/');
  await page.getByLabel('Actor URL').fill(actor);
  const tokenField = page.getByLabel('액세스 토큰');
  await expect(tokenField).toBeEditable();
  // Locator.fill includes its value in timeout call logs. Keep bearer data out
  // of action metadata as well as traces, screenshots and persisted fixtures.
  await tokenField.evaluate((element, value) => {
    const input = element as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, token);
  await page.getByRole('button', { name: '연결하기', exact: true }).click();
  await expect(page.getByRole('button', { name: '사람 관리', exact: true }).first()).toBeEnabled({
    timeout: 30000,
  });
  return token;
}

test('corrected two-actor ONI: Follow, reception and confirmed post-Undo nondelivery use actual C2S', async ({
  browser,
  page,
}) => {
  const otherContext = await browser.newContext({
    ignoreHTTPSErrors: true,
    baseURL: 'http://127.0.0.1:5173',
  });
  const other = await otherContext.newPage();
  const auditSince = new Date(Date.now() - 5000).toISOString();
  try {
    const aliceToken = await connect(page, alice);
    await page.getByRole('button', { name: '사람 관리', exact: true }).first().click();
    const people = page.getByRole('dialog', { name: '사람 관리', exact: true });
    await people.getByLabel('팔로우할 계정 주소').fill(bob);
    await people.getByRole('button', { name: '입력 주소 보기', exact: true }).click();
    // An interrupted earlier test may have left this confirmed fixture relationship active.
    // Withdraw only when the UI has loaded the exact request needed for Undo.
    const follow = people.getByRole('button', { name: '팔로우', exact: true });
    const unfollow = people.getByRole('button', { name: '팔로우 취소', exact: true });
    await expect
      .poll(async () => (await follow.isVisible()) || (await unfollow.isVisible()), {
        timeout: 30000,
      })
      .toBe(true);
    if (await unfollow.isVisible()) {
      await unfollow.click();
      await expect
        .poll(
          async () => {
            if (await follow.isVisible()) return true;
            const refresh = people
              .getByRole('button', { name: '상태 새로고침', exact: true })
              .first();
            if (await refresh.isEnabled()) await refresh.click();
            return false;
          },
          { timeout: 30000 },
        )
        .toBe(true);
    }
    await expect(people.getByRole('button', { name: '팔로우', exact: true })).toBeVisible({
      timeout: 10000,
    });
    await people.getByRole('button', { name: '팔로우', exact: true }).click();
    await expect
      .poll(
        async () => {
          if (await people.getByText('팔로우 중', { exact: true }).count()) return true;
          const refresh = people
            .getByRole('button', { name: '상태 새로고침', exact: true })
            .first();
          if (await refresh.isEnabled()) await refresh.click();
          return false;
        },
        { timeout: 30000, intervals: [500, 1000, 2000] },
      )
      .toBe(true);
    const bobToken = await connect(other, bob);
    const content = `실제 팔로우로 도착한 이야기 ${Date.now()}`;
    await other.getByLabel('새 글', { exact: true }).fill(content);
    await other.getByRole('button', { name: '게시하기', exact: true }).click();
    await expect(other.locator('.note-card').filter({ hasText: content })).toBeVisible();
    await people.getByRole('button', { name: '타임라인에서 새 글 확인', exact: true }).click();
    await expect
      .poll(
        async () => {
          if (await page.locator('.note-card').filter({ hasText: content }).count()) return true;
          const refresh = page.getByRole('button', { name: '타임라인 새로고침', exact: true });
          if (await refresh.isEnabled()) await refresh.click();
          return false;
        },
        { timeout: 30000, intervals: [500, 1000, 2000] },
      )
      .toBe(true);
    // Exercise the recipient path, not only author-side storage/addressing.
    const followersContent = `팔로워에게 도착한 이야기 ${Date.now()}`;
    await other.getByLabel('새 글', { exact: true }).fill(followersContent);
    await other.locator('.main-composer').getByRole('radio', { name: '팔로워만' }).check();
    const [publication] = await Promise.all([
      other.waitForRequest(
        (request) => request.method() === 'POST' && request.url() === `${bob}outbox`,
      ),
      other.getByRole('button', { name: '게시하기', exact: true }).click(),
    ]);
    // Assert audience booleans only: never include private payloads in failure output.
    const sent = publication.postDataJSON();
    const publicIRI = 'https://www.w3.org/ns/activitystreams#Public';
    expect(sent.object.to?.includes(`${bob}followers`)).toBe(true);
    expect(
      [
        ...(sent.to ?? []),
        ...(sent.cc ?? []),
        ...(sent.object.to ?? []),
        ...(sent.object.cc ?? []),
      ].includes(publicIRI),
    ).toBe(false);
    await expect(other.locator('.note-card').filter({ hasText: followersContent })).toBeVisible();
    await expect
      .poll(
        async () => {
          if (await page.locator('.note-card').filter({ hasText: followersContent }).count())
            return true;
          const refresh = page.getByRole('button', { name: '타임라인 새로고침', exact: true });
          if (await refresh.isEnabled()) await refresh.click();
          return false;
        },
        { timeout: 30000, intervals: [500, 1000, 2000] },
      )
      .toBe(true);
    await expect(page.locator('.note-card').filter({ hasText: followersContent })).toBeVisible();
    const beforeURL = await other
      .locator('.note-card')
      .filter({ hasText: followersContent })
      .locator('a:has(time)')
      .first()
      .getAttribute('href');
    expect(beforeURL).not.toBeNull();
    await expect
      .poll(
        async () => {
          const audit = await readDeliveryAudit(directory!, auditSince, 'bob', beforeURL!);
          return (
            !!audit &&
            audit.completed &&
            !audit.local_failed &&
            !audit.remote_failed &&
            audit.remote_targets > 0
          );
        },
        { timeout: 30000 },
      )
      .toBe(true);

    // A received private parent must support an actual two-person conversation.
    const receivedParent = page.locator('.note-card').filter({ hasText: followersContent });
    await receivedParent.getByRole('button', { name: /답글 달기/ }).click();
    const replyContent = `두 계정 사이의 답글 ${Date.now()}`;
    await page.getByLabel('답글 내용').fill(replyContent);
    const [replyRequest] = await Promise.all([
      page.waitForRequest(
        (request) => request.method() === 'POST' && request.url() === `${alice}outbox`,
      ),
      page.getByRole('button', { name: '답글 게시하기', exact: true }).click(),
    ]);
    const replyActivity = replyRequest.postDataJSON();
    expect(replyActivity.object.inReplyTo === beforeURL).toBe(true);
    expect(
      [
        ...(replyActivity.to ?? []),
        ...(replyActivity.cc ?? []),
        ...(replyActivity.object.to ?? []),
        ...(replyActivity.object.cc ?? []),
      ].includes(publicIRI),
    ).toBe(false);
    expect(JSON.stringify(replyActivity.object.to) === JSON.stringify([bob])).toBe(true);
    expect((replyActivity.object.cc ?? []).length).toBe(0);
    const aliceReply = page.locator('.note-card').filter({ hasText: replyContent });
    await expect(aliceReply).toBeVisible();
    const replyURL = await aliceReply.locator('a:has(time)').first().getAttribute('href');
    expect(replyURL).not.toBeNull();
    await expect
      .poll(
        async () => {
          if (await other.locator('.note-card').filter({ hasText: replyContent }).count())
            return true;
          const refresh = other.getByRole('button', { name: '타임라인 새로고침', exact: true });
          if (await refresh.isEnabled()) await refresh.click();
          return false;
        },
        { timeout: 30000, intervals: [500, 1000, 2000] },
      )
      .toBe(true);
    await other.getByRole('button', { name: '받은 답글', exact: true }).click();
    const bobReply = other.locator('.note-card').filter({ hasText: replyContent });
    await expect(bobReply).toBeVisible();
    await bobReply.getByRole('button', { name: '대화 열기', exact: true }).click();
    const conversation = other.getByRole('region', { name: '대화 내용' });
    await expect(conversation).toBeVisible();
    await expect(
      conversation.locator('.thread-parent').filter({ hasText: followersContent }),
    ).toBeVisible();
    await expect(conversation.locator('.thread-focus')).toContainText(replyContent);
    const ownerReply = await inspectObjectAccess(page, alice, replyURL!, replyContent, aliceToken);
    expect(ownerReply.status).toBe(200);
    expect(ownerReply.containsText).toBe(true);
    const anonymousReply = await inspectObjectAccess(page, alice, replyURL!, replyContent);
    expect([403, 404]).toContain(anonymousReply.status);
    expect(anonymousReply.containsText).toBe(false);
    await other.getByRole('button', { name: '목록으로 돌아가기', exact: false }).click();
    await other.getByRole('button', { name: '타임라인', exact: true }).click();

    await page.getByRole('button', { name: '사람 관리', exact: true }).first().click();
    await expect(people).toBeVisible();
    await people.getByRole('button', { name: '팔로우 취소', exact: true }).click();
    await expect
      .poll(
        async () => {
          if (await people.getByText('팔로우하지 않음', { exact: true }).count()) return true;
          const refresh = people
            .getByRole('button', { name: '상태 새로고침', exact: true })
            .first();
          if (await refresh.isEnabled()) await refresh.click();
          return false;
        },
        { timeout: 30000, intervals: [500, 1000, 2000] },
      )
      .toBe(true);
    await expect
      .poll(() => completeMembershipCount(page, alice, aliceToken, 'following'), { timeout: 30000 })
      .toBe(0);
    await expect
      .poll(() => completeMembershipCount(other, bob, bobToken, 'followers'), { timeout: 30000 })
      .toBe(0);
    const afterContent = `취소 후 전달되지 않을 이야기 ${Date.now()}`;
    await other.getByLabel('새 글', { exact: true }).fill(afterContent);
    await other.locator('.main-composer').getByRole('radio', { name: '팔로워만' }).check();
    await other.getByRole('button', { name: '게시하기', exact: true }).click();
    const afterCard = other.locator('.note-card').filter({ hasText: afterContent });
    await expect(afterCard).toBeVisible();
    const afterURL = await afterCard.locator('a:has(time)').first().getAttribute('href');
    expect(afterURL).not.toBeNull();
    await expect
      .poll(
        async () => {
          const audit = await readDeliveryAudit(directory!, auditSince, 'bob', afterURL!);
          return (
            !!audit &&
            audit.completed &&
            !audit.local_failed &&
            !audit.remote_failed &&
            audit.remote_targets === 0
          );
        },
        { timeout: 30000 },
      )
      .toBe(true);
    expect(await inboxContainsObject(page, alice, aliceToken, afterURL!)).toBe(false);
    const ownerAccess = await inspectObjectAccess(other, bob, afterURL!, afterContent, bobToken);
    const anonymousAccess = await inspectObjectAccess(other, bob, afterURL!, afterContent);
    expect(ownerAccess.status).toBe(200);
    expect(ownerAccess.containsText).toBe(true);
    expect([403, 404]).toContain(anonymousAccess.status);
    expect(anonymousAccess.containsText).toBe(false);
    const anonymousProxy = await inspectObjectAccess(
      other,
      bob,
      afterURL!,
      afterContent,
      undefined,
      true,
    );
    expect.soft([401, 403, 404]).toContain(anonymousProxy.status);
    expect.soft(anonymousProxy.containsText).toBe(false);
    const ownerProxy = await inspectObjectAccess(
      other,
      bob,
      afterURL!,
      afterContent,
      bobToken,
      true,
    );
    expect.soft(ownerProxy.status).toBe(200);
    expect.soft(ownerProxy.containsText).toBe(true);
    expect.soft(ownerProxy.privateNoStore).toBe(true);
    const warmedAnonymousProxy = await inspectObjectAccess(
      other,
      bob,
      afterURL!,
      afterContent,
      undefined,
      true,
    );
    expect.soft([401, 403, 404]).toContain(warmedAnonymousProxy.status);
    expect.soft(warmedAnonymousProxy.containsText).toBe(false);
    const invalidProxy = await inspectObjectAccess(
      other,
      bob,
      afterURL!,
      afterContent,
      'invalid-local-test-token',
      true,
    );
    expect.soft([401, 403, 404]).toContain(invalidProxy.status);
    expect.soft(invalidProxy.containsText).toBe(false);

    expect.soft(ownerAccess.publiclyCacheable).toBe(false);
    expect.soft(ownerAccess.privateNoStore).toBe(true);
  } finally {
    await otherContext.close();
  }
});
