import { test, expect } from '@playwright/test';
import { actor, origin, person, collection, createNote, connect } from './helpers/mock';

for (const width of [390, 1440]) {
  test(`reply discloses all direct participants before sending at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const bob = `${origin}/users/bob`;
    const carol = `${origin}/users/${'long-name-'.repeat(12)}carol`;
    const parent = createNote('private-parent', {
      attributedTo: bob,
      content: '<p>함께 이야기해요</p>',
      to: [actor, carol],
      tag: [
        { type: 'Mention', href: actor },
        { type: 'Mention', href: carol },
        { type: 'Mention', href: carol },
      ],
    });
    const posted: Record<string, any>[] = [];
    await page.route(origin + '/**', async (route) => {
      const request = route.request();
      if (request.method() === 'POST') {
        posted.push(request.postDataJSON());
        return route.fulfill({
          status: 201,
          headers: {
            Location: `${origin}/activities/reply`,
            'Access-Control-Expose-Headers': 'Location',
          },
        });
      }
      const reply = posted[0] && {
        ...posted[0],
        id: `${origin}/activities/reply`,
        object: { ...posted[0].object, id: `${origin}/notes/reply` },
      };
      return route.fulfill({
        json:
          request.url() === actor
            ? { ...person(actor, 'alice'), followers: actor + '/followers' }
            : request.url() === `${origin}/activities/reply`
              ? reply
              : collection(request.url().endsWith('/inbox') ? [parent] : reply ? [reply] : []),
      });
    });
    await connect(page);
    await page
      .locator('.note-card')
      .filter({ hasText: '함께 이야기해요' })
      .getByRole('button', { name: /답글 달기/ })
      .click();
    const composer = page.locator('.inline-reply');
    const audience = composer.locator('.reply-audience');
    await expect(audience).toBeVisible();
    await composer.getByText('이미지 첨부 안내', { exact: true }).click();
    await expect(composer.locator('.image-picker-help')).toContainText('공개와 조용히 공개 글에만');
    await expect(composer.locator('.image-picker-help')).not.toContainText('연결 화면');
    await expect(composer.getByRole('button', { name: '이미지 추가', exact: true })).toHaveCount(0);
    await expect(audience).toContainText(bob);
    await expect(audience).toContainText(carol);
    await expect(audience).not.toContainText(actor);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await composer.getByLabel('답글 내용').fill('전달 대상을 확인했어요');
    await page.screenshot({ path: `/tmp/kimino-reply-audience-${width}.png`, fullPage: true });
    await composer.getByRole('button', { name: '답글 게시하기', exact: true }).click();
    await expect.poll(() => posted.length).toBe(1);
    expect(posted[0].object.to).toEqual([bob, carol]);
    expect(posted[0].object.cc).toEqual([]);
    await expect(
      page.locator('.note-card').filter({ hasText: '전달 대상을 확인했어요' }),
    ).toBeVisible();
  });
}
