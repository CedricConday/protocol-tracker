// The two read-only surfaces, after the 2026-09-13 restructure.
//
// This file was `records.mjs`. The Records tab is gone: it was renamed
// `Trackers` and gutted down to four cards (water, sunlight, exercise, food),
// and everything it used to assert — the Doses Today / Day Streak stats, the
// weighted-adherence score, the Share Your Progress button and the three
// clinical entry points — moved to History, under the month grid. The
// assertions moved with the content rather than staying with the tab name,
// which is the whole point: a check pinned to a tab title reports a rename as
// a defect.
//
// Trackers is now a launcher, so what it owes the user is four reachable
// cards, not numbers.
import { onboard, gotoTab, startDay, tapAnimated, screenText, screenLine, reporter } from '../lib/prelude.mjs';

export default {
  name: 'history',
  description: 'History and Trackers tabs — compliance reflects the day, every control is live',
  session: { stubNotificationScheduler: true },

  async run(ctx) {
    const { findings, check } = reporter();

    await onboard(ctx);

    // Build one taken dose so the stats have something to show.
    await startDay(ctx);
    await ctx.page.waitForTimeout(2000);
    const today = await screenText(ctx);
    if (/more dose/.test(today)) {
      await tapAnimated(ctx, 'more dose').catch(() => {});
      await ctx.page.waitForTimeout(800);
    }
    // Two passes: the first "Took it" after Start My Day is dropped (see the
    // `day` flow). The compliance block needs a dose that actually landed.
    for (let attempt = 0; attempt < 2; attempt++) {
      if (/1 of 1 doses|All done/.test(await screenLine(ctx))) break;
      if (/more dose/.test(await screenText(ctx))) {
        await tapAnimated(ctx, 'more dose').catch(() => {});
        await ctx.page.waitForTimeout(800);
      }
      await tapAnimated(ctx, 'Vitamin D3').catch(() => {});
      await ctx.page.waitForTimeout(800);
      const took = ctx.page.getByText(/Took it/i).first();
      if (!(await took.count())) break;
      await took.click({ force: true });
      await ctx.page.waitForTimeout(1800);
    }

    // --- History: the month grid, and the compliance block beneath it ---
    await gotoTab(ctx, 'History');
    await ctx.page.waitForTimeout(1600);
    await ctx.shot('history');

    const hist = await screenText(ctx);
    check(!/went wrong/i.test(hist), 'History crashed into the error boundary', hist.slice(0, 400));

    const month = new Date().toLocaleDateString('en-US', { month: 'long' });
    check(hist.includes(month) || /\d{4}/.test(hist),
      'History does not show the current month', hist.slice(0, 400));

    // The calendar is meant to stay the first thing on the screen, with
    // compliance under it. Assert the order, not just the presence — "moved
    // under the calendar" was the requirement, and a block that reappeared
    // above the grid would satisfy a presence check silently.
    const gridAt = hist.indexOf(month);
    const statsAt = hist.indexOf('Doses Today');
    check(gridAt === -1 || statsAt === -1 || gridAt < statsAt,
      'The compliance block renders above the month grid on History, not below it',
      `month "${month}" at ${gridAt}, "Doses Today" at ${statsAt}`);

    check(hist.includes('Doses Today'), 'History did not render the Doses Today stat', hist.slice(0, 600));
    check(hist.includes('Day Streak'), 'History did not render the Day Streak stat', hist.slice(0, 600));
    check(/1\/1/.test(hist),
      'History does not show the dose taken on Today', hist.split('\n').slice(0, 24).join(' | '));
    check(!/\b0\/1\b/.test(hist),
      'History reports 0/1 doses although one was confirmed on Today',
      hist.split('\n').slice(0, 16).join(' | '));

    // Weighted adherence: getWeightedAdherenceScore returns a percentage.
    const scoreLine = hist.split('\n').find((l) => /\/8$/.test(l.trim()));
    check(!scoreLine || !/^(100|[1-9]\d)\.\d\/8$/.test(scoreLine.trim()),
      'Weighted Adherence renders a 0–100 percentage against a "/8" denominator',
      scoreLine ?? '(no /8 line found)');

    // Today's cell should be marked as having activity now that a dose is taken.
    const dayNum = String(new Date().getDate());
    check(hist.includes(dayNum), `History grid does not contain today's date (${dayNum})`, hist.slice(0, 500));

    // The three clinical entry points. They are registered under the Summary
    // stack but they are tapped from here, so this is the only place the tap
    // path can be checked.
    check(/Lab Results/i.test(hist), 'History offers no way to reach Lab Results', hist.slice(0, 900));
    check(/MRI History/i.test(hist), 'History offers no way to reach MRI History', hist.slice(0, 900));

    // The Share button. Its visible text is `shareProgress` — "Share Your
    // Progress", capitalised — while its accessibility name is "Share your
    // progress". Matching case-insensitively so a copy tweak does not read as
    // a missing button.
    const share = ctx.page.getByText(/Share Your Progress/i).first();
    check(await share.count() > 0, 'History has no Share Your Progress button');
    if (await share.count()) {
      const before = await screenText(ctx);
      const urlBefore = ctx.page.url();
      await share.click({ force: true });
      await ctx.page.waitForTimeout(1400);
      const after = await screenText(ctx);
      await ctx.shot('history-share-tapped');
      check(after !== before || ctx.page.url() !== urlBefore,
        'Tapping "Share Your Progress" does nothing — no sheet, no navigation, no state change',
        'Screen text is byte-identical before and after the tap.');
      // Back to History for the day-cell check below.
      await gotoTab(ctx, 'History');
      await ctx.page.waitForTimeout(1200);
    }

    // Tap today's cell — a day with data should open a detail view.
    const cell = ctx.page.getByText(dayNum, { exact: true }).last();
    if (await cell.count()) {
      const before = await screenText(ctx);
      await cell.click({ force: true });
      await ctx.page.waitForTimeout(1200);
      await ctx.shot('history-day-tapped');
      const after = await screenText(ctx);
      check(after !== before,
        'Tapping a day with logged doses in History does nothing',
        after.slice(0, 400));
      // Close the day sheet so it does not cover the tab bar.
      await ctx.page.keyboard.press('Escape').catch(() => {});
      await ctx.page.waitForTimeout(800);
    }

    // --- Trackers: a launcher, so judge it on reachability ---
    await gotoTab(ctx, 'Trackers');
    await ctx.page.waitForTimeout(1600);
    await ctx.shot('trackers');

    const trk = await screenText(ctx);
    check(!/went wrong/i.test(trk), 'Trackers crashed into the error boundary', trk.slice(0, 400));
    for (const card of ['Water', 'Sunlight', 'Exercise', 'Food']) {
      check(trk.includes(card), `Trackers has no ${card} card`, trk.slice(0, 600));
    }
    // The compliance numbers must NOT have been left behind here as well —
    // the restructure moved them, and a duplicate would be a real defect.
    check(!/Doses Today|Weighted Adherence/.test(trk),
      'Trackers still renders compliance numbers that were supposed to move to History',
      trk.slice(0, 600));

    // Each card must open something. While Build C's screens are placeholders
    // this proves the route is registered; once they land it proves the screen
    // renders. Either way "the card does nothing" is the failure being caught.
    for (const card of ['Water', 'Sunlight', 'Exercise', 'Food']) {
      const before = await screenText(ctx);
      const target = ctx.page.getByText(card, { exact: true }).first();
      if (!(await target.count())) continue;
      await target.click({ force: true });
      await ctx.page.waitForTimeout(1200);
      const after = await screenText(ctx);
      check(after !== before, `Tapping the ${card} card on Trackers does nothing`, after.slice(0, 300));
      await gotoTab(ctx, 'Trackers');
      await ctx.page.waitForTimeout(900);
    }

    return { findings, endScreen: (await screenText(ctx)).slice(0, 700) };
  },
};
