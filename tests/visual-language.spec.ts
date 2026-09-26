import { expect, test } from '@playwright/test';
import { connect, mockServer } from './helpers/mock';

for (const theme of ['light', 'dark'] as const) {
  test(`post actions keep a quiet selected state in ${theme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme });
    await page.goto('/');
    await page.getByRole('button', { name: '먼저 둘러보기' }).click();
    const card = page.locator('.note-card').filter({ hasText: '저도요.' });
    const liked = card.locator('.like-button');
    await expect(liked).toHaveAttribute('aria-pressed', 'true');
    await expect(liked.locator('.action-label')).toHaveText('좋아요');
    await expect(liked).toHaveAccessibleName('좋아요 취소 1');
    await expect(liked.locator('svg')).toHaveAttribute('fill', 'currentColor');
    expect(await liked.evaluate((element) => getComputedStyle(element).boxShadow)).toBe('none');
    expect(await liked.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe(
      'rgba(0, 0, 0, 0)',
    );
    const saved = card.locator('.save-button');
    const before = await saved.boundingBox();
    await saved.click();
    await page.mouse.move(0, 0);
    await expect(saved).toHaveAttribute('aria-pressed', 'true');
    await expect(saved.locator('svg')).toHaveAttribute('fill', 'currentColor');
    expect(await saved.evaluate((element) => getComputedStyle(element).boxShadow)).toBe('none');
    expect((await saved.boundingBox())!.height).toBe(before!.height);
    await liked.focus();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Shift+Tab');
    expect(
      await liked.evaluate((element) => parseFloat(getComputedStyle(element).outlineOffset)),
    ).toBeLessThan(0);
    const cue = card.locator('.reply-context--button');
    expect(await cue.evaluate((element) => getComputedStyle(element).textDecorationLine)).toBe(
      'none',
    );
    expect(
      await card
        .locator('.note-content a')
        .evaluate((element) => getComputedStyle(element).textDecorationLine),
    ).toBe('underline');
  });
}

test('fields keep body weight and rounded focus while unavailable primary actions stay neutral', async ({
  page,
}) => {
  await mockServer(page, []);
  await connect(page);
  const editor = page.getByLabel('새 글', { exact: true });
  await editor.focus();
  expect(
    await editor.evaluate((element) => parseFloat(getComputedStyle(element).borderRadius)),
  ).toBeGreaterThan(0);
  const submit = page.locator('.main-composer .primary-button');
  await expect(submit).toBeDisabled();
  const disabledColor = await submit.evaluate(
    (element) => getComputedStyle(element).backgroundColor,
  );
  await editor.fill('작성 중');
  await expect(submit).toBeEnabled();
  await expect
    .poll(() => submit.evaluate((element) => getComputedStyle(element).backgroundColor))
    .not.toBe(disabledColor);
  await page.getByRole('button', { name: '사람 관리', exact: true }).click();
  const input = page.getByLabel('팔로우할 계정 주소');
  expect(await input.evaluate((element) => getComputedStyle(element).fontWeight)).toBe('400');
});
