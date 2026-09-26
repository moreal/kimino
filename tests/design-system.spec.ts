import { expect, test } from '@playwright/test';

for (const colorScheme of ['light', 'dark'] as const) {
  for (const width of [390, 1440]) {
    test(`component matrix at ${width}px in ${colorScheme}`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
      const external: string[] = [];
      page.on('request', (request) => {
        if (!request.url().startsWith('http://127.0.0.1:5173/')) external.push(request.method());
      });
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto('/design-system.html');
      await expect(page.getByRole('heading', { name: 'Kimino 컴포넌트 라이브러리' })).toBeVisible();
      expect(await page.evaluate(() => window.scrollY)).toBe(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await expect(page.locator('.gallery-card')).toHaveCount(4);
      await expect(page.locator('.gallery-composer').last().getByRole('alert')).toContainText(
        '예시 오류',
      );
      const selected = page.locator('[data-specimen="selected"]');
      await expect(selected.locator('.like-button')).toHaveAttribute('aria-pressed', 'true');
      await expect(selected.locator('.like-button .action-label')).toHaveText('좋아요');
      expect(
        await selected
          .locator('.like-button')
          .evaluate((element) => getComputedStyle(element).boxShadow),
      ).toBe('none');
      await expect(page.locator('[data-specimen="pending"] .like-button')).toBeDisabled();
      await expect(page.getByLabel('비활성 입력', { exact: true })).toBeDisabled();
      await expect(page.getByLabel('오류가 있는 입력', { exact: true })).toHaveAttribute(
        'aria-invalid',
        'true',
      );
      for (const section of ['buttons', 'fields', 'actions', 'composer']) {
        await page
          .locator(`#${section}`)
          .screenshot({ path: testInfo.outputPath(`${section}.png`) });
      }
      const button = page.locator('[data-variant="primary"] button:enabled');
      await button.focus();
      expect(await button.evaluate((element) => getComputedStyle(element).outlineStyle)).toBe(
        'solid',
      );
      await page
        .locator('[data-variant="primary"]')
        .screenshot({ path: testInfo.outputPath('button-focus.png') });
      expect(external).toEqual([]);
      expect(errors).toEqual([]);
      expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0);
    });
  }
}

test('workbench controls use real reactive components and preserve a failed draft', async ({
  page,
}) => {
  await page.goto('/design-system.html');
  const card = page.locator('[data-specimen="rest"]');
  const like = card.locator('.like-button');
  await like.click();
  await expect(like).toHaveAttribute('aria-pressed', 'true');
  await expect(like.locator('.count')).toHaveText('1');
  await like.click();
  await expect(like).toHaveAttribute('aria-pressed', 'false');
  await expect(like.locator('.count')).toHaveCount(0);
  const field = page.getByLabel('기본 입력', { exact: true });
  await field.fill('키보드 입력');
  await expect(field).toHaveValue('키보드 입력');
  await page.getByLabel('테마', { exact: true }).selectOption('dark');
  expect(
    await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--ground').trim(),
    ),
  ).toBe('#151a16');
  await page.getByLabel('테마', { exact: true }).selectOption('light');
  expect(
    await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--ground').trim(),
    ),
  ).toBe('#f4f3ec');
  const composer = page.locator('.gallery-composer').last();
  await composer.getByLabel('새 글', { exact: true }).fill('실패해도 남는 초안');
  await composer.getByRole('button', { name: '게시하기', exact: true }).click();
  await expect(composer.getByRole('alert')).toContainText('예시 오류');
  await expect(composer.getByLabel('새 글', { exact: true })).toHaveValue('실패해도 남는 초안');
});
