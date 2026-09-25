import { expect, test } from '@playwright/test';
import {
  actor,
  collection,
  connect,
  createNote,
  mockServer,
  origin,
  person,
  PUBLIC,
} from './helpers/mock';

for (const populated of [false, true]) {
  test(`people management ${populated ? 'keeps filters for no matches' : 'omits filters without records'}`, async ({
    page,
  }) => {
    await page.route(`${origin}/**`, (route) => {
      const url = route.request().url();
      return route.fulfill({
        json:
          url === actor
            ? { ...person(actor), following: `${actor}/following` }
            : collection(
                url === `${actor}/following` && populated ? ['https://friend.example/bob'] : [],
              ),
      });
    });
    await connect(page);
    await page.getByRole('button', { name: '사람 관리', exact: true }).first().click();
    const dialog = page.getByRole('dialog', { name: '사람 관리', exact: true });
    await expect(
      dialog.locator('.people-footer').getByRole('button', { name: '상태 새로고침', exact: true }),
    ).toBeEnabled();
    await dialog.getByRole('button', { name: /^내 목록/ }).click();
    if (populated) {
      await dialog.locator('.people-search input').fill('no matching person');
      await expect(dialog.locator('.people-person')).toHaveCount(0);
      await expect(dialog.locator('.people-list-controls')).toBeVisible();
    } else {
      await expect(dialog.locator('.people-list-controls')).toHaveCount(0);
      await expect(
        dialog.locator('.people-empty').getByRole('button', { name: '사람 찾기', exact: true }),
      ).toBeVisible();
    }
  });
}

test('people lookup feedback remains visible beside a failed relationship read', async ({
  page,
}) => {
  await page.route(`${origin}/**`, (route) => {
    const url = route.request().url();
    if (url === `${actor}/following`) return route.fulfill({ status: 503 });
    return route.fulfill({
      json: url === actor ? { ...person(actor), following: `${actor}/following` } : collection([]),
    });
  });
  await page.route('https://missing.example/**', (route) => route.fulfill({ status: 404 }));
  await connect(page);
  await page.getByRole('button', { name: '사람 관리', exact: true }).first().click();
  const dialog = page.getByRole('dialog', { name: '사람 관리', exact: true });
  const relationshipError = dialog.getByRole('alert').filter({ hasText: '503' });
  await expect(relationshipError).toBeVisible();
  const input = dialog.getByLabel('팔로우할 계정 주소');
  await input.fill('https://');
  await dialog.getByRole('button', { name: '입력 주소 보기', exact: true }).click();
  await expect(dialog.getByRole('alert')).toHaveCount(2);
  await expect(dialog.locator('.people-form').getByRole('alert')).toContainText(
    '정확한 HTTPS Actor URL',
  );
  await dialog.getByRole('button', { name: /^내 목록/ }).click();
  await expect(dialog.getByRole('alert')).toHaveCount(1);
  await expect(relationshipError).toBeVisible();
  await dialog.getByRole('button', { name: '사람 찾기', exact: true }).first().click();
  await expect(dialog.getByRole('alert')).toHaveCount(2);
  await input.fill('@nobody@missing.example');
  await dialog.getByRole('button', { name: '계정 찾기', exact: true }).click();
  await expect(dialog.locator('.people-form').getByRole('alert')).toContainText('아이디');
  await expect(relationshipError).toBeVisible();
  await dialog.getByRole('button', { name: /^내 목록/ }).click();
  await expect(dialog.getByRole('alert')).toHaveCount(1);
  await expect(relationshipError).toBeVisible();
  await dialog.getByRole('button', { name: '사람 찾기', exact: true }).first().click();
  await expect(dialog.locator('.people-form').getByRole('alert')).toContainText('아이디');
});

test('composition Escape keeps a reply open while ordinary Escape closes it', async ({ page }) => {
  await mockServer(page, [createNote('ime', { content: 'Reply here', to: [PUBLIC] })]);
  await connect(page);
  await page.locator('.note-card').getByRole('button', { name: /답글/ }).first().click();
  const reply = page.getByLabel('답글 내용', { exact: true });
  await reply.fill('작성 중');
  await reply.dispatchEvent('keydown', { key: 'Escape', isComposing: true });
  await expect(reply).toBeVisible();
  await expect(reply).toHaveValue('작성 중');
  await reply.press('Escape');
  await expect(reply).toHaveCount(0);
});

for (const modifier of ['ctrlKey', 'metaKey'] as const) {
  test(`composition ${modifier} Enter does not publish but the ordinary shortcut does`, async ({
    page,
  }) => {
    await mockServer(page, []);
    let posts = 0;
    await page.route(`${actor}/outbox`, (route) => {
      if (route.request().method() !== 'POST') return route.fallback();
      posts++;
      return route.fulfill({ status: 500 });
    });
    await connect(page);
    const input = page.getByLabel('새 글', { exact: true });
    await input.fill('작성 중');
    await input.dispatchEvent('keydown', { key: 'Enter', [modifier]: true, isComposing: true });
    await expect(input).toBeEnabled();
    await expect(input).toHaveValue('작성 중');
    expect(posts).toBe(0);
    await input.dispatchEvent('keydown', { key: 'Enter', [modifier]: true });
    await expect(page.locator('.compose-error')).toBeVisible();
    expect(posts).toBe(1);
  });
}
