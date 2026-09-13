// Shared set-up for flows that need an account already created.
//
// Every flow starts from a fresh browser context (see session.mjs), so anything
// past onboarding has to walk through onboarding first. Rather than repeat that
// walk in six files, it lives here. `onboard()` reports nothing — the dedicated
// onboarding flow is what audits that path; here it is only scaffolding, and it
// throws if a step does not land so a broken prelude cannot masquerade as a
// broken feature.

export const TAB_LABELS = ['History', 'Journal', 'Today', 'Trackers', 'Settings'];

// The route id behind each tab. `Trackers` was called `Records` until
// 2026-09-13; only the visible label moved, the route is still `Summary`.
// Matching on the href rather than the label is what makes a rename a one-line
// change here instead of a sweep through six flows — and it is the same handle
// protocol60/thirtyday/mood3 already use.
export const TAB_HREF = {
  History: '/Calendar',
  Journal: '/Journal',
  Today: '/Home',
  Trackers: '/Summary',
  Settings: '/Settings',
};

/**
 * Text of the tab that is actually on screen.
 *
 * `page.innerText('body')` returns every mounted tab at once — react-navigation
 * keeps inactive tab screens in the DOM and only marks them `aria-hidden`. So a
 * naive `sees('Start My Day')` is true while you are looking at Settings. This
 * reads leaf text nodes that are not inside an `aria-hidden="true"` subtree,
 * which is the active screen plus the tab bar and any open modal.
 */
export async function screenText(ctx) {
  return ctx.page.evaluate(() => {
    const hidden = new Set(document.querySelectorAll('[aria-hidden="true"]'));
    const buried = (el) => {
      for (let n = el; n; n = n.parentElement) if (hidden.has(n)) return true;
      return false;
    };
    // RNW renders every <Text> as a div[dir="auto"], and a <Text> with nested
    // <Text> children puts several text nodes under one such root. Group by that
    // root so "0" + " / 30 min" reads as one line, the way a user sees it.
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const lines = [];
    let lastRoot = null;
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const text = n.nodeValue;
      if (!text || !text.trim()) continue;
      const el = n.parentElement;
      if (!el || buried(el)) continue;
      if (/^(SCRIPT|STYLE|NOSCRIPT|TITLE)$/.test(el.tagName)) continue;
      let root = el;
      for (let a = el; a; a = a.parentElement) {
        if (a.getAttribute && a.getAttribute('dir') === 'auto') { root = a; break; }
      }
      if (root === lastRoot && lines.length) lines[lines.length - 1] += text;
      else lines.push(text);
      lastRoot = root;
    }
    return lines.join('\n');
  });
}

/** `screenText` contains this needle (case-sensitive). */
export async function onScreen(ctx, needle) {
  return (await screenText(ctx)).includes(needle);
}

/** `screenText` with newlines flattened — for phrases RN splits across sibling
 *  <Text> nodes that a user reads as one line ("0" + " of 1 doses"). */
export async function screenLine(ctx) {
  return (await screenText(ctx)).replace(/\n/g, ' ').replace(/\s+/g, ' ');
}

/** Touchables (RNW gives them tabindex=0) on the visible screen only — hidden
 *  tab screens keep their layout, so an unfiltered query returns their boxes. */
export async function visibleTouchables(ctx) {
  const all = await ctx.page.$$('[tabindex="0"]');
  const out = [];
  for (const el of all) {
    const hidden = await el.evaluate((e) => {
      for (let n = e; n; n = n.parentElement) {
        if (n.getAttribute && n.getAttribute('aria-hidden') === 'true') return true;
      }
      return false;
    });
    if (!hidden) out.push(el);
  }
  return out;
}

/**
 * Fresh install → app proper. Leaves the app on the Today tab with a profile
 * named `name` and one supplement ("Vitamin D3") when `d3Dose` is given.
 */
export async function onboard(ctx, { name = 'Testuser', weight = '72', d3Dose = '10000', condition = 'Multiple Sclerosis' } = {}) {
  if (await ctx.sees('Stay on Track')) {
    await ctx.tap('Not now');
  }
  if (!(await ctx.sees('Set Up Your Profile'))) {
    throw new Error(`prelude: onboarding did not open on the profile step. Saw: ${(await ctx.text()).slice(0, 200)}`);
  }

  await ctx.fill('e.g. Alex', name);
  await ctx.fill('e.g. 70', weight);
  if (d3Dose) await ctx.fill('e.g. 5000', d3Dose);
  await ctx.tap('Continue');

  if (!(await ctx.sees('Your Condition'))) {
    throw new Error('prelude: profile step did not advance to Your Condition');
  }
  await ctx.tap(condition);
  await ctx.tap('Continue');

  if (!(await ctx.sees('Almost Ready'))) {
    throw new Error('prelude: condition step did not advance to Almost Ready');
  }
  await ctx.tap("Let's begin");
  await ctx.page.waitForTimeout(1500); // first Home load
}

/**
 * Switch bottom tab.
 *
 * The tab bar renders as `<a role="tab" href="/Home">`, so the href is the
 * stable handle and the visible label is not: a rename or a locale change moves
 * the label and leaves the route alone. Falls back to the label for a tab with
 * no href in TAB_HREF, and throws naming the tabs it actually saw rather than
 * timing out on a selector, so a miss reads as a tab-bar fact.
 */
export async function gotoTab(ctx, label) {
  const href = TAB_HREF[label];
  if (href) {
    const seen = await ctx.page.evaluate((wanted) => {
      // Compare the PATH only. Once you navigate into a tab's nested stack the
      // tab's own href carries the route with it — the Trackers tab reads
      // `/Summary?screen=Report` after opening the doctor report — so an exact
      // match misses the tab you are already standing next to. Query and hash
      // are state, not identity.
      const path = (a) => (a.getAttribute('href') || '').split(/[?#]/)[0];
      const tabs = [...document.querySelectorAll('a[role="tab"]')];
      const hit = tabs.find((a) => path(a) === wanted)
        || tabs.find((a) => path(a).startsWith(wanted + '/'));
      if (hit) { hit.click(); return null; }
      return tabs.map((a) => a.getAttribute('href') || '(no href)');
    }, href);
    if (seen) {
      throw new Error(`gotoTab: no tab anchor with href "${href}" for "${label}". Tabs present: ${seen.join(', ') || 'none'}`);
    }
    await ctx.page.waitForTimeout(1200);
    return;
  }
  const tab = ctx.page.getByText(label, { exact: true }).last();
  await tab.waitFor({ state: 'visible', timeout: 8000 });
  await tab.click();
  await ctx.page.waitForTimeout(1200);
}

/**
 * Click by visible text without Playwright's stability check.
 *
 * Several controls sit inside a never-ending Animated loop (StartDayButton
 * pulses, a due DoseRow's accent border pulses). Playwright waits for an
 * element to stop moving before it clicks, so those controls time out. That is
 * a harness artifact, not an app defect — a finger does not wait for the
 * transform to settle. Force the click instead.
 */
export async function tapAnimated(ctx, text, { exact = false, timeout = 10000 } = {}) {
  const target = ctx.page.getByText(text, { exact }).first();
  await target.waitFor({ state: 'visible', timeout });
  await target.click({ force: true });
  await ctx.page.waitForTimeout(600);
}

// getByDisplayValue is not available in this Playwright build, so inputs are
// matched by reading their live value instead.

/** Every text input's current value, in DOM order. */
export async function inputValues(ctx) {
  const els = await ctx.page.$$('input, textarea');
  return Promise.all(els.map((e) => e.inputValue()));
}

/** Find the first input whose current value equals `value` and refill it. */
export async function refillInput(ctx, value, next) {
  const inputs = await ctx.page.$$('input, textarea');
  for (const el of inputs) {
    if ((await el.inputValue()) === value) {
      await el.fill(next);
      await ctx.page.waitForTimeout(300);
      return true;
    }
  }
  return false;
}

/** Does any input on screen currently hold this exact value? */
export async function hasInputValue(ctx, value) {
  const values = await inputValues(ctx);
  return values.includes(value);
}

/**
 * Start the day from Today, so dose rows exist. Returns false when the button
 * is not on screen (the day was already started).
 */
export async function startDay(ctx) {
  if (!(await onScreen(ctx, 'Start My Day'))) return false;
  await tapAnimated(ctx, 'Start My Day');
  await ctx.page.waitForTimeout(2500);
  return true;
}

/** Collect a `check(ok, summary, detail)` helper plus its findings array. */
export function reporter() {
  const findings = [];
  const check = (ok, summary, detail) => {
    if (!ok) findings.push({ summary, detail: detail == null ? undefined : String(detail) });
    return ok;
  };
  return { findings, check };
}
