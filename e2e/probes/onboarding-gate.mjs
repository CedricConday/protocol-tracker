// H5: "Next stays greyed out" — the button must say what it wants.
import { openApp } from '../lib/session.mjs';

const ctx = await openApp({ label: 'onboarding-gate', stubNotificationScheduler: true });
const { page } = ctx;
const text = () => page.innerText('body');

if ((await text()).includes('Stay on Track')) {
  await page.getByText('Not now').first().click({ force: true });
  await page.waitForTimeout(600);
}
await page.waitForTimeout(1200);

// All three steps are mounted side by side, so text presence proves nothing —
// "Your Condition" is in the DOM from the start. Geometry does: the name field
// lives on step 0, so its x says whether step 0 is still on screen.
const activeStep = async () => {
  const box = await page.getByPlaceholder('e.g. Alex').first().boundingBox();
  if (!box) return 'name field gone';
  const vw = await page.evaluate(() => window.innerWidth);
  return (box.x > -10 && box.x < vw) ? 'step 0 (profile)' : 'scrolled away, x=' + Math.round(box.x);
};

console.log('required markers  :', /Required/.test(await text()) ? 'present' : 'MISSING');
console.log('optional marker   :', /Optional/.test(await text()) ? 'present' : 'MISSING');
console.log('step before       :', await activeStep());

// Name only — exactly the screenshot.
await page.getByPlaceholder('e.g. Alex').first().fill('Cedric');
await page.waitForTimeout(400);

const next = page.locator('[aria-label="Next step"]').first();
const pe = await next.evaluate((e) => getComputedStyle(e).pointerEvents);
console.log('Next pointerEvents:', pe, pe === 'none' ? '(INERT — the bug)' : '(tappable)');

await next.click({ force: true });
await page.waitForTimeout(1000);
const after = await text();
console.log('after tapping Next:', (after.match(/Still needed:[^\n]*/) ?? ['(none)'])[0]);
console.log(/Still needed/.test(after) ? 'PASS: it says what is missing' : 'FAIL: still silent');
console.log('step after tap    :', await activeStep(), '<- must still be step 0');

// German decimal comma, which H5 measured as valid input.
await page.getByPlaceholder('e.g. 70').first().fill('70,5');
await page.waitForTimeout(800);
console.log('hint auto-cleared :', /Still needed/.test(await text()) ? 'NO' : 'yes');
await page.locator('[aria-label="Next step"]').first().click({ force: true });
await page.waitForTimeout(1400);
console.log('step after 70,5   :', await activeStep(), '<- must have moved on');
await ctx.close();
