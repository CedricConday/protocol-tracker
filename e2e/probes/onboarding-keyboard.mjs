// The bug Cedric hit was with the iOS keyboard up. KeyboardAvoidingView shrinks
// the area above it, so reproduce that by shrinking the viewport to what an
// iPhone leaves above the keyboard (~508pt of 844) and check step 0 both fits
// and can be scrolled.
import { openApp } from '../lib/session.mjs';
const ctx = await openApp({ label: 'onb-kb', stubNotificationScheduler: true });
const { page } = ctx;
await page.getByText('Not now').first().waitFor({ state: 'visible', timeout: 30000 });
await page.getByText('Not now').first().click({ force: true });
await page.getByText('Set Up Your Profile').first().waitFor({ state: 'visible', timeout: 30000 });
await page.waitForTimeout(1200);

await page.setViewportSize({ width: 390, height: 508 });
await page.waitForTimeout(1200);
await ctx.shot('kb-top');

const probe = async () => page.evaluate(() => {
  const btn = [...document.querySelectorAll('[aria-label]')].find((e) => e.getAttribute('aria-label') === 'Next step');
  let footer = null;
  for (let n = btn; n; n = n.parentElement) {
    if (parseFloat(getComputedStyle(n).borderTopWidth) > 0) { footer = n; break; }
  }
  const fb = footer.getBoundingClientRect();
  const hits = [];
  for (const el of document.querySelectorAll('div[dir="auto"], input')) {
    if (footer.contains(el)) continue;
    const b = el.getBoundingClientRect();
    if (b.width === 0 || b.height === 0) continue;
    const t = (el.innerText || el.placeholder || '').replace(/\s+/g, ' ').trim().slice(0, 34);
    if (!t) continue;
    if (b.bottom > fb.top + 1 && b.top < fb.bottom) hits.push(t);
  }
  // Is the form in a scroller, and does it have more to show?
  let sc = null;
  for (const el of document.querySelectorAll('*')) {
    if (el.scrollHeight > el.clientHeight + 4 && /auto|scroll/.test(getComputedStyle(el).overflowY)) { sc = el; break; }
  }
  return {
    footerTop: Math.round(fb.top),
    overlapping: hits,
    scrollable: !!sc,
    scrollRange: sc ? Math.round(sc.scrollHeight - sc.clientHeight) : 0,
  };
});

const before = await probe();
console.log('footer top          :', before.footerTop);
console.log('overlapping footer  :', before.overlapping.length ? before.overlapping : 'none');
console.log('form scrollable     :', before.scrollable ? `yes (${before.scrollRange}px of travel)` : 'NO');

// Can the D3 field actually be reached by scrolling?
await page.getByPlaceholder('e.g. 5000').first().scrollIntoViewIfNeeded();
await page.waitForTimeout(600);
const box = await page.getByPlaceholder('e.g. 5000').first().boundingBox();
const vh = await page.evaluate(() => window.innerHeight);
console.log('D3 field reachable  :', box && box.y >= 0 && box.y < vh ? `yes (y=${Math.round(box.y)}, vh=${vh})` : 'NO');
await ctx.shot('kb-scrolled');
console.log('errors:', ctx.errors.filter((e) => !e.advisory).map((e) => e.text.slice(0, 90)));
await ctx.close();
