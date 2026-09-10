// Every bottom tab, in order, on a fresh account. Each one must render its own
// content (not a blank frame, not the ErrorBoundary fallback) and must not tear
// the app down on the way in or out.
import { onboard, gotoTab, screenText, TAB_LABELS, reporter } from '../lib/prelude.mjs';

// A marker that only that screen renders, so "the tab switched" is provable.
const MARKERS = {
  History: /Mon|Tue|Wed|January|February|March|April|May|June|July|August|September|October|November|December/,
  Journal: /How are you feeling\?/,
  Today: /Start My Day|of \d+ doses|All doses done/,
  Records: /Doses Today|Day Streak/,
  Settings: /Danger zone|Manage supplements/,
};

export default {
  name: 'tabs',
  description: 'Bottom tabs — History, Journal, Today, Records, Settings all render',

  async run(ctx) {
    const { findings, check } = reporter();

    await onboard(ctx);

    const tabBar = await ctx.text();
    for (const label of TAB_LABELS) {
      check(tabBar.includes(label), `Bottom tab "${label}" is missing from the tab bar`, tabBar.slice(-400));
    }

    for (const label of TAB_LABELS) {
      await gotoTab(ctx, label).catch((e) => {
        findings.push({ summary: `Could not switch to the ${label} tab`, detail: e.message });
      });
      await ctx.page.waitForTimeout(1200);
      await ctx.shot(`tab-${label.toLowerCase()}`);

      const body = await screenText(ctx);
      check(!/Something went wrong|went wrong/i.test(body),
        `${label} tab rendered the error boundary fallback`, body.slice(0, 400));
      check(body.trim().length > 40,
        `${label} tab rendered an essentially empty screen`, JSON.stringify(body.slice(0, 200)));
      check(MARKERS[label].test(body),
        `${label} tab did not render its own content`, body.slice(0, 500));
    }

    // Back to Today, then round-trip once more — a tab that only works on first
    // mount is a real failure mode with the stack navigators nested in tabs.
    await gotoTab(ctx, 'Today');
    await gotoTab(ctx, 'Records');
    await gotoTab(ctx, 'Today');
    const back = await screenText(ctx);
    check(MARKERS.Today.test(back), 'Today did not re-render after a second round trip', back.slice(0, 400));

    return { findings, endScreen: back.slice(0, 600) };
  },
};
