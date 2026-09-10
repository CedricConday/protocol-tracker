// Records (Summary) tab and the History (Calendar) tab: the two read-only
// surfaces. They must reflect what the day actually contains, and every control
// they show must do something.
import { onboard, gotoTab, startDay, tapAnimated, screenText, screenLine, reporter } from '../lib/prelude.mjs';

export default {
  name: 'records',
  description: 'Records and History tabs — stats reflect the day, controls are live',
  session: { stubNotificationScheduler: true },

  async run(ctx) {
    const { findings, check } = reporter();

    await onboard(ctx);

    // Build one taken dose so the stats have something to show.
    await startDay(ctx);
    await ctx.page.waitForTimeout(2000);
    let today = await screenText(ctx);
    if (/more dose/.test(today)) {
      await tapAnimated(ctx, 'more dose').catch(() => {});
      await ctx.page.waitForTimeout(800);
    }
    // Two passes: the first "Took it" after Start My Day is dropped (see the
    // `day` flow). Records needs a dose that actually landed.
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

    // --- Records ---
    await gotoTab(ctx, 'Records');
    await ctx.page.waitForTimeout(1600);
    await ctx.shot('records');

    const rec = await screenText(ctx);
    check(rec.includes('Doses Today'), 'Records did not render the Doses Today stat', rec.slice(0, 500));
    check(/1\/1/.test(rec),
      'Records does not show the dose taken on Today', rec.split('\n').slice(0, 20).join(' | '));
    check(!/\b0\/1\b/.test(rec),
      'Records reports 0/1 doses although one was confirmed on Today',
      rec.split('\n').slice(0, 12).join(' | '));

    // Weighted adherence: getWeightedAdherenceScore returns a percentage.
    const scoreLine = rec.split('\n').find((l) => /\/8$/.test(l.trim()));
    check(!scoreLine || !/^(100|[1-9]\d)\.\d\/8$/.test(scoreLine.trim()),
      'Weighted Adherence renders a 0–100 percentage against a "/8" denominator',
      scoreLine ?? '(no /8 line found)');

    // The Share button.
    const share = ctx.page.getByText('Share Your Progress').first();
    check(await share.count() > 0, 'Records has no Share Your Progress button');
    if (await share.count()) {
      const before = await screenText(ctx);
      const urlBefore = ctx.page.url();
      await share.click({ force: true });
      await ctx.page.waitForTimeout(1400);
      const after = await screenText(ctx);
      await ctx.shot('records-share-tapped');
      check(after !== before || ctx.page.url() !== urlBefore,
        'Tapping "Share Your Progress" does nothing — no sheet, no navigation, no state change',
        'Screen text is byte-identical before and after the tap.');
    }

    // Routes registered under the Records stack that nothing links to.
    check(/Share with Doctor|MRI|Lab Results/i.test(rec),
      'Records offers no way to reach the Report / MRI History / Lab Results screens registered under its stack',
      rec.slice(0, 700));

    // --- History ---
    await gotoTab(ctx, 'History');
    await ctx.page.waitForTimeout(1600);
    await ctx.shot('history');

    const hist = await screenText(ctx);
    check(!/went wrong/i.test(hist), 'History crashed into the error boundary', hist.slice(0, 400));
    const month = new Date().toLocaleDateString('en-US', { month: 'long' });
    check(hist.includes(month) || /\d{4}/.test(hist),
      'History does not show the current month', hist.slice(0, 400));

    // Today's cell should be marked as having activity now that a dose is taken.
    const dayNum = String(new Date().getDate());
    check(hist.includes(dayNum), `History grid does not contain today's date (${dayNum})`, hist.slice(0, 500));

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
    }

    return { findings, endScreen: (await screenText(ctx)).slice(0, 700) };
  },
};
