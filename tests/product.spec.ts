import { test, expect } from '@playwright/test';
import { connect, mockServer } from './helpers/mock';

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
    page.getByText('Mastodon 계정으로 로그인할 수 없어요', { exact: false }),
  ).toBeVisible();
  await page.screenshot({ path: 'test-results/product-welcome.png', fullPage: true });
  await page.getByRole('button', { name: '먼저 둘러보기' }).click();
  await expect(page.locator('.demo-pill')).toContainText('미리보기');
  await expect(page.locator('.note-card')).toHaveCount(4);
  await page.getByLabel('불러온 글 검색').fill('책방');
  await expect(page.locator('.note-card')).toHaveCount(1);
  // The foot names what it counts under a search and in the saved list (round 17).
  await expect(page.locator('.feed-status')).toContainText('검색 결과 1개 · 불러온 글 4개');
  await expect(page.locator('.feed-status')).not.toContainText('중 1개 표시');
  await page.getByRole('button', { name: '저장', exact: true }).click();
  await page.getByRole('button', { name: '저장한 글', exact: true }).click();
  await expect(page.locator('.note-card')).toHaveCount(1);
  await expect(page.locator('.feed-status')).toContainText('저장한 글 1개 · 불러온 글 4개');
  await expect(page.getByRole('button', { name: '저장됨', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: '타임라인', exact: true }).click();
  await page.screenshot({ path: 'test-results/product-feed.png', fullPage: true });
  const reply = page.locator('.note-card').filter({ hasText: '저도요.' });
  await reply.getByRole('button', { name: '대화 열기', exact: true }).click();
  await expect(page.getByRole('region', { name: '대화 내용' })).toBeVisible();
  await expect(page.locator('.thread-parent')).toContainText('커피 한 잔');
  await page.getByRole('button', { name: '목록으로 돌아가기', exact: false }).click();
  await expect(reply.getByRole('button', { name: '대화 열기', exact: true })).toBeFocused();
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
  await mockServer(page, [], [], { actor });
  await connect(page, { actor, token: '' });
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
    await page.getByRole('button', { name: '받은 답글', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('받은 답글');
    await expect(page.locator('.note-card')).toHaveCount(1);
    await expect(page.locator('.note-card')).toContainText('저도요.');
    // The parent is loaded, so the cue quotes whose note this answers, and its first words.
    await expect(page.locator('.note-card .reply-context')).toHaveText(
      /^미나: 커피 한 잔과 .+… · 원글 보기$/,
    );
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
    // A reaction in effect renames itself (좋아요 → 좋아함), so the state is not only a colour.
    await expect(liked.getByRole('button', { name: /^좋아함/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(liked.getByRole('button', { name: '좋아함 1' })).toBeVisible();
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
    // By its own words: a reply's cue now quotes the parent, so the text alone matches two cards.
    const card = page.locator('.note-card', {
      has: page.locator('.note-content', { hasText: '커피 한 잔' }),
    });
    const like = card.getByRole('button', { name: /^좋아요/ });
    await like.scrollIntoViewIfNeeded();
    await like.click();
    const feedback = card.getByRole('alert');
    await expect(feedback).toContainText('좋아요·공유');
    await expect(feedback).toBeInViewport();
    // Measured from the action row, not from the one button: on a narrow column the row
    // wraps (so 수정 and 삭제 stay on screen), and the message still follows it immediately.
    const gap = await feedback.evaluate(
      (element, row) => {
        const a = element.getBoundingClientRect();
        const b = (row as HTMLElement).getBoundingClientRect();
        return a.top - b.bottom;
      },
      await card.locator('.note-actions').elementHandle(),
    );
    expect(gap).toBeLessThan(40);
    // The tapped control and its message are still read together, without scrolling.
    const fromButton = await feedback.evaluate(
      (element, button) =>
        element.getBoundingClientRect().top -
        (button as HTMLElement).getBoundingClientRect().bottom,
      await like.elementHandle(),
    );
    expect(fromButton).toBeLessThan(120);
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
    await expect(pill.getByRole('button', { name: '계정 연결', exact: true })).toBeVisible();
    const original = page.locator('.note-card').filter({ hasText: '커피 한 잔' });
    const thread = original.getByRole('button', { name: '대화 1', exact: true });
    await expect(thread.locator('.count')).toHaveText('1');
    await expect(
      page.locator('.main-nav .nav-item:not(.sidebar-disconnect) > svg.nav-icon'),
    ).toHaveCount(4);
  });

  test('thread view enlarges the focused post and links replies in-app', async ({ page }) => {
    const original = page.locator('.note-card', {
      has: page.locator('.note-content', { hasText: '커피 한 잔' }),
    });
    await original.getByRole('button', { name: '대화 1', exact: true }).click();
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
      .getByRole('button', { name: /^미나: 커피 한 잔과 .*원글 보기$/ })
      .click();
    await expect(page.locator('.thread-focus')).toContainText('커피 한 잔');
    await expect(page.locator('.conversation')).toContainText('저도요.');
  });

  test('exactly one preview exit control is visible on desktop and on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await expect(page.getByRole('button', { name: '둘러보기 종료', exact: true })).toHaveCount(1);
    await expect(page.getByRole('button', { name: '연결 해제', exact: true })).toHaveCount(0);
    // The right column is one account line; the sync summary is its tooltip, not a card.
    await expect(page.locator('.context-identity')).toHaveAttribute('title', /마지막 확인/);
    await expect(page.locator('.profile-card')).toHaveCount(0);
    await expect(page.locator('.sync-details')).toHaveCount(0);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole('button', { name: '둘러보기 종료', exact: true })).toHaveCount(1);
    await page.getByRole('button', { name: '둘러보기 종료', exact: true }).click();
    await expect(page.getByRole('button', { name: '먼저 둘러보기' })).toBeVisible();
  });
});

test.describe('content warnings, attachments and visibility', () => {
  const actor = 'https://social.example/users/me';
  const followers = `${actor}/followers`;
  const PUBLIC = 'https://www.w3.org/ns/activitystreams#Public';
  // 1x1 transparent PNG; the only image request the test should ever see.
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    'base64',
  );
  const note = (id: string, extra: Record<string, unknown>) => ({
    type: 'Create',
    id: `${actor}/activities/${id}`,
    actor,
    published: `2026-09-0${id}T00:00:00Z`,
    object: {
      type: 'Note',
      id: `${actor}/notes/${id}`,
      attributedTo: actor,
      published: `2026-09-0${id}T00:00:00Z`,
      ...extra,
    },
  });
  test.beforeEach(async ({ page }) => {
    const imageRequests: string[] = [];
    await page.route('https://cdn.example/**', (route) => {
      imageRequests.push(route.request().url());
      return route.fulfill({ body: png, contentType: 'image/png' });
    });
    await page.route('https://social.example/**', (route) => {
      const url = route.request().url();
      if (url === actor)
        return route.fulfill({
          json: {
            id: actor,
            type: 'Person',
            inbox: `${actor}/inbox`,
            outbox: `${actor}/outbox`,
            followers,
          },
        });
      if (url === `${actor}/outbox`)
        return route.fulfill({
          json: {
            type: 'OrderedCollection',
            orderedItems: [
              note('3', {
                content: '<p>결말은 이렇습니다.</p>',
                summary: '드라마 스포일러',
                to: [followers],
                attachment: {
                  type: 'Document',
                  mediaType: 'image/png',
                  url: 'https://cdn.example/spoiler.png',
                  name: '마지막 장면 스크린샷',
                },
              }),
              note('2', {
                content: '<p>공개 글에 첨부 두 개</p>',
                to: [PUBLIC],
                cc: [followers],
                attachment: [
                  { type: 'Image', url: 'https://cdn.example/a.png' },
                  { type: 'Document', mediaType: 'video/mp4', url: 'https://cdn.example/a.mp4' },
                ],
              }),
              note('1', { content: '<p>조용한 글</p>', to: [followers], cc: [PUBLIC] }),
            ],
          },
        });
      return route.fulfill({ json: { type: 'OrderedCollection', orderedItems: [] } });
    });
    await page.goto('/');
    await page.getByLabel('Actor URL').fill(actor);
    await page.getByRole('button', { name: '연결하기', exact: true }).click();
    await expect(page.locator('.note-card')).toHaveCount(3);
    (page as unknown as { imageRequests: string[] }).imageRequests = imageRequests;
  });

  test('a content warning hides the body and attachments until opened', async ({ page }) => {
    const card = page.locator('.note-card').filter({ hasText: '드라마 스포일러' });
    await expect(card.locator('.content-warning-label')).toHaveText('주의: 드라마 스포일러');
    await expect(card.locator('.note-content')).toHaveCount(0);
    await expect(card.locator('.attachment')).toHaveCount(0);
    const toggle = card.getByRole('button', { name: '내용 보기', exact: true });
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(
      await toggle.evaluate((element) => element.getBoundingClientRect().height),
    ).toBeGreaterThanOrEqual(44);
    await toggle.focus();
    await page.keyboard.press('Enter');
    await expect(card.locator('.note-content')).toContainText('결말은 이렇습니다.');
    await expect(card.getByRole('button', { name: '접기', exact: true })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    await expect(card.locator('.attachment-alt')).toHaveText('마지막 장면 스크린샷');
    await card.getByRole('button', { name: '접기', exact: true }).click();
    await expect(card.locator('.note-content')).toHaveCount(0);
  });

  test('images load only on tap and other media open as external links', async ({ page }) => {
    const card = page.locator('.note-card').filter({ hasText: '첨부 두 개' });
    await expect(card.locator('.attachment')).toHaveCount(2);
    await expect(card.getByRole('list', { name: '첨부 이미지 1개 · 동영상 1개' })).toBeVisible();
    await expect(card.locator('img')).toHaveCount(0);
    await expect(card.locator('.attachment-alt--none').first()).toHaveText('대체 텍스트 없음');
    expect((page as unknown as { imageRequests: string[] }).imageRequests).toEqual([]);
    await card.getByRole('button', { name: '이미지 불러오기', exact: true }).click();
    const img = card.locator('img.attachment-image');
    await expect(img).toHaveAttribute('src', 'https://cdn.example/a.png');
    await expect(img).toHaveAttribute('alt', '');
    await expect(card.getByRole('button', { name: '이미지 불러오기' })).toHaveCount(0);
    await expect
      .poll(() => (page as unknown as { imageRequests: string[] }).imageRequests)
      .toEqual(['https://cdn.example/a.png']);
    const video = card.getByRole('link', { name: /동영상 열기/ });
    await expect(video).toHaveAttribute('href', 'https://cdn.example/a.mp4');
    await expect(video).toHaveAttribute('rel', 'noopener noreferrer');
    await expect(video).toHaveAttribute('target', '_blank');
  });

  test('non-public notes carry a visibility indicator; public notes do not', async ({ page }) => {
    const quiet = page.locator('.note-card').filter({ hasText: '조용한 글' });
    await expect(quiet.locator('.visibility-badge')).toHaveAttribute(
      'title',
      '조용히 공개 · 미등록',
    );
    const spoiler = page.locator('.note-card').filter({ hasText: '드라마 스포일러' });
    await expect(spoiler.locator('.visibility-badge')).toHaveAttribute('title', '팔로워만 공개');
    await expect(spoiler.locator('.visibility-badge .sr-only')).toHaveText('팔로워만 공개');
    await expect(
      page.locator('.note-card').filter({ hasText: '첨부 두 개' }).locator('.visibility-badge'),
    ).toHaveCount(0);
  });

  test('the visibility badge says its word on screen, at every width', async ({ page }) => {
    const quiet = page.locator('.note-card').filter({ hasText: '조용한 글' });
    const spoiler = page.locator('.note-card').filter({ hasText: '드라마 스포일러' });
    for (const size of [
      { width: 390, height: 844 },
      { width: 1440, height: 900 },
    ]) {
      await page.setViewportSize(size);
      await expect(spoiler.locator('.visibility-word')).toHaveText('팔로워만');
      await expect(spoiler.locator('.visibility-word')).toBeVisible();
      await expect(quiet.locator('.visibility-word')).toHaveText('조용히');
      await expect(quiet.locator('.visibility-word')).toBeVisible();
      const word = spoiler.locator('.visibility-word');
      const box = (await word.boundingBox())!;
      expect(box.width, `${size.width}px`).toBeGreaterThan(0);
      // The compact type step, and a word that keeps body-text contrast on its own chip.
      const read = await word.evaluate((el) => {
        const style = getComputedStyle(el);
        const luminance = (color: string) => {
          const [r, g, b] = color
            .match(/[\d.]+/g)!
            .slice(0, 3)
            .map((channel) => {
              const value = Number(channel) / 255;
              return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
            });
          return 0.2126 * r + 0.7152 * g + 0.0722 * b;
        };
        const badge = getComputedStyle(el.parentElement!).backgroundColor;
        const [light, dark] = [luminance(style.color), luminance(badge)].sort((a, b) => b - a);
        return { size: style.fontSize, contrast: (light + 0.05) / (dark + 0.05) };
      });
      expect(read.size, `${size.width}px`).toBe('12px');
      expect(read.contrast, `${size.width}px`).toBeGreaterThanOrEqual(4.5);
    }
  });

  test('the composer offers a warning field and a visibility picker; replies cannot widen', async ({
    page,
  }) => {
    const composer = page.locator('.main-composer');
    // The collapsed composer shows no options; they appear once writing starts.
    await expect(composer.locator('.compose-options')).toBeHidden();
    await composer.getByLabel('새 글').click();
    await expect(composer.locator('.compose-options')).toBeVisible();
    // What the composer cannot do is said here, not implied by a missing button.
    await expect(composer.locator('.compose-scope')).toHaveText(
      '이미지 첨부는 아직 지원하지 않아요. 대체 텍스트도 여기서는 쓸 수 없어요.',
    );
    await expect(composer.locator('input[type="file"]')).toHaveCount(0);
    await expect(composer.getByRole('radio', { name: '공개', exact: true })).toBeChecked();
    await expect(composer.locator('.visibility')).toContainText('누구나 볼 수 있어요');
    await composer.getByRole('radio', { name: '팔로워만' }).check();
    await expect(composer.locator('.visibility')).toContainText('팔로워만');
    await expect(composer.getByLabel('경고 문구')).toHaveCount(0);
    const warning = composer.getByRole('button', { name: '경고 문구 추가' });
    await expect(warning).toHaveAttribute('aria-pressed', 'false');
    await warning.click();
    await composer.getByLabel('경고 문구').fill('스포일러');
    await expect(composer.getByRole('button', { name: '경고 문구 제거' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    const spoiler = page.locator('.note-card').filter({ hasText: '드라마 스포일러' });
    await spoiler.getByRole('button', { name: /답글 달기/ }).click();
    const reply = page.locator('.inline-reply');
    await expect(reply.getByRole('radio', { name: '팔로워만' })).toBeChecked();
    await expect(reply.getByRole('radio', { name: '공개', exact: true })).toBeDisabled();
    await expect(reply.getByRole('radio', { name: '조용히 공개(미등록)' })).toBeDisabled();
    await expect(reply.getByRole('radio', { name: '다이렉트' })).toBeEnabled();
    await expect(reply.locator('.visibility-limit')).toContainText('팔로워만');
  });
});

test.describe('round 6: keyboard and desktop layout', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: '먼저 둘러보기' }).click();
    await expect(page.locator('.note-card')).toHaveCount(4);
  });

  test('j/k move between cards, Enter opens the conversation, Escape leaves the card', async ({
    page,
  }) => {
    await page.keyboard.press('j');
    const cards = page.locator('.timeline .note-card');
    await expect(cards.nth(0)).toBeFocused();
    await page.keyboard.press('j');
    await expect(cards.nth(1)).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(cards.nth(2)).toBeFocused();
    await page.keyboard.press('k');
    await expect(cards.nth(1)).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.locator('#timeline')).toBeFocused();
    await page.keyboard.press('j');
    await expect(cards.nth(1)).toBeFocused();
    await page.keyboard.press('s');
    await expect(cards.nth(1).getByRole('button', { name: '저장됨', exact: true })).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(page.locator('.thread-focus .note-card--focused')).toContainText('저도요.');
    await expect(page.locator('#conversation-heading')).toBeFocused();
    // Typing in the search field is never a shortcut.
    await page.getByRole('button', { name: '목록으로 돌아가기', exact: false }).click();
    await page.getByLabel('불러온 글 검색').fill('j');
    await expect(page.locator('.thread-focus')).toHaveCount(0);
    await expect(page.getByLabel('불러온 글 검색')).toHaveValue('j');
  });

  test('? opens the shortcut list, which the sidebar button also reaches', async ({ page }) => {
    await page.keyboard.press('?');
    const dialog = page.getByRole('dialog', { name: '키보드 단축키' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('대화 열기');
    await expect(dialog.getByRole('button', { name: '닫기' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await page.getByRole('button', { name: '단축키' }).click();
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: '닫기' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole('button', { name: '단축키' })).toBeFocused();
  });

  test('on desktop the right column shows replies to me, then the open conversation beside the timeline', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const aside = page.locator('.context-column');
    await expect(aside.locator('.replies-peek')).toContainText('저도요.');
    await expect(aside).not.toContainText('작은 사용 안내');
    await aside.getByRole('button', { name: /대화 열기/ }).click();
    await expect(aside.locator('.conversation .thread-focus')).toContainText('저도요.');
    await expect(aside.locator('.thread-ancestor')).toContainText('커피 한 잔');
    await expect(page.locator('.main-column .timeline .note-card')).toHaveCount(4);
    await expect(page.locator('.main-column .conversation')).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('타임라인');
    await expect(page.locator('#conversation-heading')).toBeFocused();
    // A reply composer for a note in the conversation opens once, in the thread column.
    await aside
      .locator('.thread-focus')
      .getByRole('button', { name: /에게 답글 달기/ })
      .click();
    await expect(page.getByLabel('답글 내용')).toHaveCount(1);
    await expect(aside.locator('.inline-reply')).toHaveCount(1);
    // Narrower than the desktop breakpoint the same conversation takes the main column.
    await page.setViewportSize({ width: 1000, height: 900 });
    await expect(page.locator('.main-column .conversation .thread-focus')).toContainText('저도요.');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('대화');
    await expect(page.getByLabel('답글 내용')).toHaveCount(1);
    await page.getByRole('button', { name: '목록으로 돌아가기', exact: false }).click();
    await expect(page.locator('.main-column .timeline')).toBeVisible();
  });

  test('desktop controls are denser than phone controls without the palette changing', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const save = page
      .locator('.note-card')
      .first()
      .getByRole('button', { name: '저장', exact: true });
    expect((await save.boundingBox())!.height).toBeLessThanOrEqual(36);
    await page.setViewportSize({ width: 390, height: 844 });
    expect((await save.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  });
});

test.describe('round 18: the search field, and the names of the author and 대화 controls', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: '먼저 둘러보기' }).click();
    await expect(page.locator('.note-card')).toHaveCount(4);
  });

  test('검색 지우기 is offered whenever there is a query, Escape clears too, and the field says so', async ({
    page,
  }) => {
    const field = page.getByLabel('불러온 글 검색');
    await expect(field).toHaveAccessibleDescription(/Esc/);
    await expect(page.getByRole('button', { name: '검색 지우기' })).toHaveCount(0);
    await field.fill('책방');
    await expect(page.locator('.note-card')).toHaveCount(1);
    // A query with matches: the control is there, next to the field, not only in the empty state.
    const clear = page.locator('.search-field').getByRole('button', { name: '검색 지우기' });
    await expect(clear).toBeVisible();
    await clear.click();
    await expect(field).toHaveValue('');
    await expect(field).toBeFocused();
    await expect(page.locator('.note-card')).toHaveCount(4);
    await expect(clear).toHaveCount(0);
    await field.fill('없는 검색어');
    await expect(page.locator('.note-card')).toHaveCount(0);
    await expect(page.getByRole('button', { name: '검색 지우기' })).toHaveCount(2);
    await page.keyboard.press('Escape');
    await expect(field).toHaveValue('');
    await expect(page.locator('.note-card')).toHaveCount(4);
    await expect(page.locator('.thread-focus')).toHaveCount(0);
    // On a phone the field with a query is open and the control is inside the viewport.
    await page.setViewportSize({ width: 390, height: 844 });
    await field.fill('책방');
    await expect(clear).toBeVisible();
    const box = (await clear.boundingBox())!;
    expect(box.x + box.width).toBeLessThanOrEqual(390);
    expect(box.height).toBeGreaterThanOrEqual(44);
  });

  test('the author control says what it opens, 대화 without a count says it opens, and 촘촘하게 only promises spacing', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const card = page.locator('.note-card').filter({ hasText: '저도요.' });
    await expect(card.locator('button.author')).toHaveAccessibleName(/^.+ 정보 보기$/);
    await expect(card.locator('button.author')).toHaveText(/^[^정]+$/);
    await expect(card.locator('.thread-button')).toHaveAccessibleName('대화 열기');
    await expect(card.locator('.thread-button .action-label')).toHaveText('대화');
    const parent = page
      .locator('.note-card')
      .filter({ has: page.locator('.note-content', { hasText: '커피 한 잔' }) });
    await expect(parent.locator('.thread-button')).toHaveAccessibleName(/^대화 \d+$/);
    const density = page.getByRole('switch', { name: '촘촘하게' });
    await expect(density).toHaveAttribute('title', /여백을 줄여/);
    await expect(density).not.toHaveAttribute('title', /글자/);
  });
});
