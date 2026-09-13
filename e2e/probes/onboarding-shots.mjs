import { openApp } from '../lib/session.mjs';
const ctx = await openApp({ label: 'onb', stubNotificationScheduler: true });
const { page } = ctx;
await page.getByText('Not now').first().waitFor({ state: 'visible', timeout: 30000 });
await ctx.shot('00-primer');
await page.getByText('Not now').first().click({ force: true });
await page.getByText('Set Up Your Profile').first().waitFor({ state: 'visible', timeout: 30000 });
await page.waitForTimeout(1500);
await ctx.shot('01-profile-empty');

await page.getByPlaceholder('e.g. Alex').first().click();
await page.getByPlaceholder('e.g. Alex').first().fill('Cedric');
await page.waitForTimeout(600);
await ctx.shot('02-name-only');

await page.locator('[aria-label="Next step"]').first().click({ force: true });
await page.waitForTimeout(1200);
await ctx.shot('03-after-next-with-hint');

await page.getByPlaceholder('e.g. 70').first().fill('70');
await page.waitForTimeout(600);
await ctx.shot('04-filled');

await page.locator('[aria-label="Next step"]').first().click({ force: true });
await page.waitForTimeout(1600);
await ctx.shot('05-condition');

await page.getByText('Multiple Sclerosis').first().click({ force: true });
await page.waitForTimeout(600);
await page.locator('[aria-label="Next step"]').first().click({ force: true });
await page.waitForTimeout(1600);
await ctx.shot('06-almost-ready');
console.log('shots:', ctx.shots.join('\n'));
await ctx.close();
