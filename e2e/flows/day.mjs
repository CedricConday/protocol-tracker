// The active-day surface on Today: the progress header, the dose list, the dose
// detail sheet, and the water/sun trackers.
//
// Needs the notification-scheduler stub to get past startDay() at all — see
// session.mjs and the `home` flow, which documents why.
import { onboard, startDay, tapAnimated, screenText, screenLine, reporter } from '../lib/prelude.mjs';

export default {
  name: 'day',
  description: 'Today tab after T=0 — progress header, dose list, dose sheet, water and sun',
  session: { stubNotificationScheduler: true },

  async run(ctx) {
    const { findings, check } = reporter();

    await onboard(ctx);
    await startDay(ctx);
    await ctx.page.waitForTimeout(3000);
    await ctx.shot('after-start');

    const day = await screenText(ctx);
    check(!day.includes('Start My Day'),
      'Start My Day is still on screen after starting the day (even with notifications stubbed)',
      day.slice(0, 500));
    if (day.includes('Start My Day')) return { findings, endScreen: day.slice(0, 500) };

    // Onboarding created exactly one supplement (Vitamin D3), so today has
    // exactly one dose.
    const counter = await screenLine(ctx);
    check(/\b0 of 1 doses\b|\b1 of 1 doses\b|All doses done/.test(counter),
      'Dose counter does not report the single scheduled dose',
      (counter.match(/.{0,40}of \d+ doses/) ?? ['(no dose counter)'])[0]);
    check(!day.includes('No supplements scheduled'),
      'Today claims no supplements are scheduled although onboarding created one');

    // A one-supplement protocol collapses to "0 more doses today", which hides
    // the only dose of the day behind a tap on an empty-looking card.
    const stackLine = day.split('\n').find((l) => /more dose/.test(l)) ?? '';
    check(!/^0 more dose/.test(stackLine.trim()),
      'With a single supplement, Today shows "0 more doses today — tap to view all" and the only dose row is hidden until tapped',
      stackLine || '(no stack label rendered)');

    // --- Expand and open the dose ---
    if (day.includes('more dose')) {
      await tapAnimated(ctx, 'more dose').catch(() => {});
      await ctx.page.waitForTimeout(900);
    }
    const expanded = await screenText(ctx);
    check(expanded.includes('Vitamin D3'),
      'Vitamin D3 dose row is not reachable from Today', expanded.slice(0, 700));
    await ctx.shot('doses-expanded');

    const openDoseSheet = async () => {
      const now = await screenText(ctx);
      if (/more dose/.test(now)) {
        await tapAnimated(ctx, 'more dose').catch(() => {});
        await ctx.page.waitForTimeout(800);
      }
      await tapAnimated(ctx, 'Vitamin D3').catch(() => {});
      await ctx.page.waitForTimeout(900);
      return ctx.page.getByText(/Took it/i).first();
    };
    const doseDone = async () => /1 of 1 doses|All doses done|All done/.test(await screenLine(ctx));

    if (expanded.includes('Vitamin D3')) {
      const took = await openDoseSheet();
      await ctx.shot('dose-sheet');
      check(await took.count() > 0,
        'Dose detail sheet offers no "Took it" action for a due dose',
        (await screenText(ctx)).slice(0, 700));

      if (await took.count()) {
        await took.click({ force: true });
        await ctx.page.waitForTimeout(2200);
        await ctx.shot('dose-taken-first-try');
        const firstTry = await doseDone();

        // A second attempt is the tell: if the same tap works the second time,
        // the first one was dropped rather than mis-clicked.
        let secondTry = firstTry;
        if (!firstTry) {
          const took2 = await openDoseSheet();
          if (await took2.count()) {
            await took2.click({ force: true });
            await ctx.page.waitForTimeout(2200);
            await ctx.shot('dose-taken-second-try');
            secondTry = await doseDone();
          }
        }

        check(firstTry,
          secondTry
            ? 'The FIRST "Took it" after Start My Day is silently dropped — the dose sheet closes, nothing is logged; tapping again works'
            : 'Confirming a dose never updates the Today progress header',
          `after first tap: ${firstTry ? 'logged' : 'not logged'}; after second tap: ${secondTry ? 'logged' : 'still not logged'}`);
      }
    }

    // --- Water and sun are NOT on Today any more ---
    // Both moved to their own screens under Trackers on 2026-09-13, where they
    // have entry lists, editable goals and history. Asserted as an absence so a
    // regression that puts the cards back is visible here rather than only as a
    // surprise on the device; the logging itself is covered by the `trackers`
    // flow, against the screens that now own it.
    const todayBody = await screenText(ctx);
    check(!/\+ 250 ml/.test(todayBody),
      'The water tracker is back on Today — it belongs on the Water screen',
      todayBody.slice(0, 400));
    check(!/goal 30|\/ 30 min/.test(todayBody),
      'The sun tracker is back on Today — it belongs on the Sunlight screen',
      todayBody.slice(0, 400));

    // --- Quick log links ---
    const body = await screenText(ctx);
    check(body.includes('Sleep check-in'), 'Sleep check-in quick log missing from Today', body.slice(0, 600));
    check(body.includes('Calcium log'), 'Calcium log quick log missing from Today');

    // Neither exercise nor meals can be logged anywhere on Today, although the
    // screen loads and holds both.
    check(/Exercise|Walk|Log exercise/i.test(body),
      'Today loads exercise state (getTodayExercise) but renders no way to log exercise',
      body.slice(0, 800));
    check(/meal|Ate|breakfast/i.test(body),
      'Today loads meal state and defines handleLogMeal, but renders no meal prompt or button',
      body.slice(0, 800));

    if (body.includes('Sleep check-in')) {
      await tapAnimated(ctx, 'Sleep check-in').catch(() => {});
      await ctx.page.waitForTimeout(1400);
      await ctx.shot('sleep');
      const sleep = await screenText(ctx);
      check(!/went wrong/i.test(sleep), 'Sleep check-in crashed into the error boundary', sleep.slice(0, 400));
    }

    return { findings, endScreen: (await screenText(ctx)).slice(0, 800) };
  },
};
