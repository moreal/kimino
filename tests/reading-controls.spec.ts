import { test, expect } from '@playwright/test';
import { actor, collection, connect, createNote, mockServer, origin } from './helpers/mock';

const bob = `${origin}/users/bob`;
const bobNote = createNote('hidden-parent', {
  attributedTo: bob,
  content: '<p>잠시 보고 싶지 않은 작성자의 글</p>',
  to: ['https://www.w3.org/ns/activitystreams#Public'],
});
const ownReply = createNote('own-reply', {
  content: '<p>내 답글은 계속 볼 수 있어요</p>',
  inReplyTo: `${origin}/notes/hidden-parent`,
  to: ['https://www.w3.org/ns/activitystreams#Public'],
});

async function hideBob(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'bob 정보 보기' }).first().click();
  const hide = page.getByRole('button', { name: '이 작성자의 글 숨기기', exact: true });
  await expect(hide).toBeVisible();
  await hide.click();
}

test('hide an author across reading surfaces, retain saved links and restore with keyboard', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockServer(page, [ownReply, bobNote]);
  await connect(page);
  const bobCard = page.locator(`.note-card[data-note="${origin}/notes/hidden-parent"]`);
  await bobCard.getByRole('button', { name: '저장', exact: true }).click();
  await hideBob(page);
  await expect(bobCard).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
  await expect(page.locator('.note-card')).toContainText('숨긴 작성자의 글이에요');
  await expect(page.locator('.note-card a.reply-context')).toHaveCount(0);
  await page.getByRole('button', { name: '저장한 글', exact: true }).click();
  await expect(page.locator('.note-card')).toHaveCount(0);
  await expect(
    page.getByRole('heading', { name: '숨김 설정으로 글이 보이지 않아요' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: '숨김 설정 확인' })).toBeVisible();
  await expect(page.getByRole('link', { name: '저장한 원문 열기' })).toHaveCount(0);
  expect(
    await page.evaluate((id) => JSON.parse(localStorage.getItem(`kimino.saved.${id}`)!), actor),
  ).toEqual([`${origin}/notes/hidden-parent`]);
  await page.getByRole('button', { name: '숨긴 작성자 1명 관리' }).click();
  const dialog = page.getByRole('dialog', { name: '숨긴 작성자', exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('브라우저');
  await page.keyboard.press('Shift+Tab');
  // Native modal dialogs may give the browser chrome a tab stop; Tab returns
  // inside, and the application behind the dialog must remain inert.
  await page.keyboard.press('Tab');
  await page
    .getByRole('button', { name: '타임라인', exact: true })
    .evaluate((el: HTMLElement) => el.focus());
  expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('n');
  await expect(page.getByLabel('새 글', { exact: true })).not.toBeFocused();
  await expect(page.locator('.main-composer .composer')).toHaveClass(/composer--collapsed/);
  await dialog.getByRole('button', { name: 'bob 숨기기 취소' }).click();
  await expect(dialog).toContainText('숨긴 작성자가 없어요');
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(bobCard).toBeVisible();
  await expect(bobCard.getByRole('button', { name: '저장됨', exact: true })).toBeVisible();
});

test('a browser account keeps its hidden authors after reconnect, but preview never persists them', async ({
  page,
}) => {
  await mockServer(page, [ownReply, bobNote]);
  await connect(page);
  await hideBob(page);
  await page.reload();
  await connect(page, { goto: false });
  await expect(page.getByRole('button', { name: '숨긴 작성자 1명 관리' })).toBeVisible();
  await expect(page.locator('.note-card')).toHaveCount(1);
  await page.goto('/');
  await page.getByRole('button', { name: '먼저 둘러보기' }).click();
  await page.getByRole('button', { name: 'sol 정보 보기' }).first().click();
  await page.getByRole('button', { name: '이 작성자의 글 숨기기', exact: true }).click();
  await expect(page.getByRole('button', { name: '숨긴 작성자 1명 관리' })).toBeVisible();
  await page.reload();
  await expect(page.locator('.note-card')).toHaveCount(4);
  await expect(page.getByRole('button', { name: '숨긴 작성자 1명 관리' })).toHaveCount(0);
  expect(
    await page.evaluate(() =>
      Object.keys(localStorage).filter((k) => k.startsWith('kimino.muted.')),
    ),
  ).toEqual([`kimino.muted.${actor}`]);
});

test('a hidden parent is explained in a conversation without quoting or linking around the filter', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockServer(page, [ownReply, bobNote]);
  await connect(page);
  await hideBob(page);
  const own = page.locator(`.note-card[data-note="${origin}/notes/own-reply"]`);
  await own.getByRole('button', { name: '대화 열기', exact: true }).click();
  const conversation = page.getByRole('region', { name: '대화 내용' });
  await expect(conversation.locator('.missing-parent')).toHaveText('숨긴 작성자의 글이에요');
  await expect(conversation.getByText('잠시 보고 싶지 않은', { exact: false })).toHaveCount(0);
  await expect(conversation.locator(`a[href="${origin}/notes/hidden-parent"]`)).toHaveCount(0);
});

test('phone author controls give short names a full touch target', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: '먼저 둘러보기' }).click();
  const authors = page.locator('.note-card button.author');
  for (const author of await authors.all()) {
    const box = await author.boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }
});

test('a refresh completing behind hidden-author management keeps the focused restore control', async ({
  page,
}) => {
  await mockServer(page, [ownReply, bobNote]);
  await connect(page);
  await hideBob(page);
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(`${actor}/inbox`, async (route) => {
    await pending;
    await route.fulfill({ json: collection([]) });
  });
  const refresh = page.getByRole('button', { name: '타임라인 새로고침', exact: true });
  await refresh.click();
  await expect(refresh).toBeDisabled();
  await page.getByRole('button', { name: '숨긴 작성자 1명 관리' }).click();
  const restore = page.getByRole('button', { name: 'bob 숨기기 취소' });
  await restore.focus();
  release();
  await expect(refresh).toBeEnabled();
  await expect(restore).toBeFocused();
});
