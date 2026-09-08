import { test, expect } from '@playwright/test';

test('exploration shows compatibility, search, saved posts and conversation without login', async ({
  page,
}) => {
  const issues: string[] = [];
  page.on('pageerror', (error) => issues.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'warning' && /[A-Z_]{6,}/.test(message.text()))
      issues.push(message.text());
  });
  await page.goto('/');
  await expect(
    page.getByText('현재 일반 Mastodon 계정으로는 로그인할 수 없습니다.', { exact: false }),
  ).toBeVisible();
  await page.screenshot({ path: 'test-results/product-welcome.png', fullPage: true });
  await page.getByRole('button', { name: '먼저 둘러보기' }).click();
  await expect(page.locator('.demo-pill')).toContainText('미리보기');
  await expect(page.locator('.note-card')).toHaveCount(4);
  await page.getByLabel('불러온 글 검색').fill('책방');
  await expect(page.locator('.note-card')).toHaveCount(1);
  await page.getByRole('button', { name: '저장', exact: true }).click();
  await page.getByRole('button', { name: '저장한 글', exact: true }).click();
  await expect(page.locator('.note-card')).toHaveCount(1);
  await expect(page.getByRole('button', { name: '저장됨', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: '타임라인', exact: true }).click();
  await page.screenshot({ path: 'test-results/product-feed.png', fullPage: true });
  const reply = page.locator('.note-card').filter({ hasText: '저도요.' });
  await reply.getByRole('button', { name: '대화 보기', exact: true }).click();
  await expect(page.getByRole('region', { name: '대화 내용' })).toBeVisible();
  await expect(page.locator('.thread-parent')).toContainText('커피 한 잔');
  await page.getByRole('button', { name: '목록으로 돌아가기', exact: false }).click();
  await expect(reply.getByRole('button', { name: '대화 보기', exact: true })).toBeFocused();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/product-mobile.png', fullPage: true });
  expect(issues).toEqual([]);
});

test('saved links absent from the current feed remain discoverable', async ({ page }) => {
  const actor = 'https://social.example/users/me';
  await page.addInitScript(() =>
    localStorage.setItem(
      'kimino.saved.https://social.example/users/me',
      JSON.stringify(['https://social.example/notes/old']),
    ),
  );
  await page.route('https://social.example/**', (route) =>
    route.fulfill({
      json:
        route.request().url() === actor
          ? { id: actor, type: 'Person', inbox: `${actor}/inbox`, outbox: `${actor}/outbox` }
          : { type: 'OrderedCollection', orderedItems: [] },
    }),
  );
  await page.goto('/');
  await page.getByLabel('Actor URL').fill(actor);
  await page.getByRole('button', { name: '연결하기', exact: true }).click();
  await page.getByRole('button', { name: '저장한 글', exact: true }).click();
  await expect(page.getByRole('heading', { name: '불러오지 못한 저장 링크 · 1' })).toBeVisible();
  await expect(page.getByRole('link', { name: '저장한 원문 열기' })).toHaveAttribute(
    'href',
    'https://social.example/notes/old',
  );
});

test.describe('preview mode after round 4', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: '먼저 둘러보기' }).click();
    await expect(page.locator('.note-card')).toHaveCount(4);
  });

  test('replies view lists a reply to my own post', async ({ page }) => {
    await page.getByRole('button', { name: '나에게 온 답글', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('나에게 온 답글');
    await expect(page.locator('.note-card')).toHaveCount(1);
    await expect(page.locator('.note-card')).toContainText('저도요.');
    await expect(page.locator('.note-card .reply-context')).toContainText('답글');
  });

  test('timestamps are relative permalinks with absolute titles', async ({ page }) => {
    const stamp = page.locator('.note-card').first().locator('.timestamp time');
    await expect(stamp).toHaveText(/전$|어제|월 \d+일/);
    await expect(stamp).toHaveAttribute('title', /\d{4}년/);
    await expect(page.locator('.note-card').first().locator('a.timestamp')).toHaveAttribute(
      'href',
      /^https:\/\/demo\.invalid\//,
    );
    await expect(page.locator('.permalink')).toHaveCount(0);
    await expect(page.locator('.feed-heading')).toHaveCount(0);
  });

  test('reply opens the composer and submitting explains that preview cannot publish', async ({
    page,
  }) => {
    const card = page.locator('.note-card').filter({ hasText: '책방' });
    const reply = card.getByRole('button', { name: /에게 답글 달기/ });
    await expect(reply).toBeEnabled();
    await reply.click();
    await expect(page.getByLabel('답글 내용')).toBeFocused();
    await page.getByLabel('답글 내용').fill('미리보기에서 보내는 답글');
    await page.getByRole('button', { name: '답글 게시하기' }).click();
    await expect(page.getByRole('alert')).toContainText('계정을 연결');
    await expect(page.getByLabel('답글 내용')).toHaveValue('미리보기에서 보내는 답글');
  });

  test('like and share explain that preview cannot react instead of being disabled', async ({
    page,
  }) => {
    const card = page.locator('.note-card').filter({ hasText: '책방' });
    const like = card.getByRole('button', { name: /^좋아요/ });
    await expect(like).toBeEnabled();
    await expect(like).toHaveAttribute('aria-pressed', 'false');
    await like.click();
    await expect(page.getByRole('alert')).toContainText('계정을 연결');
    const liked = page.locator('.note-card').filter({ hasText: '저도요.' });
    await expect(liked.getByRole('button', { name: /^좋아요/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(liked.getByRole('button', { name: '좋아요 1' })).toBeVisible();
    await liked.getByRole('button', { name: /^공유/ }).click();
    await expect(liked.getByRole('alert')).toContainText('계정을 연결');
    // Feedback stays with the note that was tapped instead of a page-wide banner.
    await expect(page.locator('.page-error')).toHaveCount(0);
    await expect(page.locator('.note-feedback')).toHaveCount(2);
  });

  test('reaction feedback sits under the tapped button within a phone viewport', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const card = page.locator('.note-card').filter({ hasText: '커피 한 잔' });
    const like = card.getByRole('button', { name: /^좋아요/ });
    await like.scrollIntoViewIfNeeded();
    await like.click();
    const feedback = card.getByRole('alert');
    await expect(feedback).toContainText('좋아요·공유');
    await expect(feedback).toBeInViewport();
    const gap = await feedback.evaluate(
      (element, button) => {
        const a = element.getBoundingClientRect();
        const b = (button as HTMLElement).getBoundingClientRect();
        return a.top - b.bottom;
      },
      await like.elementHandle(),
    );
    expect(gap).toBeLessThan(40);
    await expect(like).not.toHaveAttribute('aria-busy', 'true');
  });

  test('a reply draft survives navigation and is signposted on its note', async ({ page }) => {
    const card = page.locator('.note-card').filter({ hasText: '책방' });
    await card.getByRole('button', { name: /에게 답글 달기/ }).click();
    await page.getByLabel('답글 내용').fill('나중에 이어서 쓸 답글');
    await page.getByRole('button', { name: '저장한 글', exact: true }).click();
    await expect(page.getByLabel('답글 내용')).toHaveCount(0);
    await page.getByRole('button', { name: '타임라인', exact: true }).click();
    await expect(page.getByLabel('답글 내용')).toHaveCount(0);
    const reply = card.getByRole('button', { name: /에게 답글 달기/ });
    await expect(reply.locator('.draft-badge')).toHaveText('초안 있음');
    await expect(page.locator('.draft-badge')).toHaveCount(1);
    await reply.click();
    await expect(page.getByLabel('답글 내용')).toHaveValue('나중에 이어서 쓸 답글');
    await expect(page.locator('.draft-badge')).toHaveCount(0);
  });

  test('header is quiet: no update stamp, a thin preview line, and a read-only thread label', async ({
    page,
  }) => {
    await expect(page.locator('.page-header')).not.toContainText('업데이트');
    const pill = page.locator('.demo-pill');
    expect(
      await pill.evaluate((element) => element.getBoundingClientRect().height),
    ).toBeLessThanOrEqual(36);
    await expect(pill.getByRole('button', { name: '계정 연결 →' })).toBeVisible();
    const original = page.locator('.note-card').filter({ hasText: '커피 한 잔' });
    const thread = original.getByRole('button', { name: '대화 보기 답글 1', exact: true });
    await expect(thread.locator('.count')).toHaveText('답글 1');
    await expect(page.locator('.main-nav svg.nav-icon')).toHaveCount(4);
  });

  test('thread view enlarges the focused post and links replies in-app', async ({ page }) => {
    const original = page.locator('.note-card').filter({ hasText: '커피 한 잔' });
    await original.getByRole('button', { name: '대화 보기 답글 1', exact: true }).click();
    await expect(page.locator('.thread-focus .note-card--focused')).toContainText('커피 한 잔');
    await expect(page.locator('.note-card--focused')).toHaveCount(1);
    const back = page.getByRole('button', { name: '목록으로 돌아가기', exact: false });
    expect(
      await back.evaluate((element) => parseFloat(getComputedStyle(element).fontSize)),
    ).toBeGreaterThanOrEqual(14);
    await back.click();
    await page
      .locator('.note-card')
      .filter({ hasText: '저도요.' })
      .getByRole('button', { name: /원글 대화 열기/ })
      .click();
    await expect(page.locator('.thread-focus')).toContainText('커피 한 잔');
    await expect(page.locator('.conversation')).toContainText('저도요.');
  });

  test('exactly one preview exit control is visible on desktop and on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await expect(page.getByRole('button', { name: '둘러보기 종료', exact: true })).toHaveCount(1);
    await expect(page.getByRole('button', { name: '연결 해제', exact: true })).toHaveCount(0);
    await expect(page.locator('.profile-meta')).toContainText('마지막 확인');
    await expect(page.locator('.sync-details')).toHaveCount(0);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole('button', { name: '둘러보기 종료', exact: true })).toHaveCount(1);
    await page.getByRole('button', { name: '둘러보기 종료', exact: true }).click();
    await expect(page.getByRole('button', { name: '먼저 둘러보기' })).toBeVisible();
  });
});
