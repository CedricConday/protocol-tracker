// Trackers: remove-any-entry, sun sessions, exercise sessions.
//
// Cedric reported from the device that the Water screen could only remove the
// TOP entry. That was true and deliberate — `undoLastWater` removes the day's
// newest row, and it was the only remover there was. This proves the fix by
// removing a MIDDLE entry, which is the case that could not work before, and
// checks the day total moved by that entry's amount and no other.
import { openApp } from '../lib/session.mjs';
import { onboard, gotoTab, screenText, reporter } from '../lib/prelude.mjs';

export default {
  name: 'trackers',
  description: 'Water / Sunlight / Exercise — any entry can be removed, and the day total follows',
  session: { stubNotificationScheduler: true },

  async run(ctx) {
    const { findings, check } = reporter();
    await onboard(ctx);

    const call = (fn, ...args) => ctx.page.evaluate(async ({ fn, args }) => {
      const id = window.__PT_MODS['src/db/queries.ts'];
      if (id === undefined) throw new Error('queries module not registered');
      const m = window.__r(id);
      if (typeof m[fn] !== 'function') throw new Error(`no such export: ${fn}`);
      return m[fn](...args);
    }, { fn, args });

    const today = await ctx.today();

    // ── water: three entries, remove the middle one ──────────────────────────
    await call('addWater', 250);
    await call('addWater', 400);
    await call('addWater', 150);
    let rows = await call('getWaterLogs', today);
    check(rows.length === 3, 'water: three entries were not logged', JSON.stringify(rows));

    const anchorBefore = await call('getAnchor', today);
    const totalBefore = anchorBefore?.water_ml ?? 0;
    // getWaterLogs is newest-first, so index 1 is the middle entry — the one
    // that had no Remove button and could not be deleted at all.
    const middle = rows[1];
    const ok = await call('deleteWaterLog', middle.id);
    check(ok === true, 'water: deleteWaterLog refused the middle entry', String(ok));

    rows = await call('getWaterLogs', today);
    check(rows.length === 2, 'water: the middle entry was not removed', JSON.stringify(rows));
    check(!rows.some((r) => r.id === middle.id),
      'water: a different entry was removed than the one asked for',
      `asked to remove id ${middle.id}; remaining ${JSON.stringify(rows)}`);

    const anchorAfter = await call('getAnchor', today);
    check((anchorAfter?.water_ml ?? 0) === totalBefore - middle.amount_ml,
      'water: the day total did not move by exactly the removed entry',
      `before ${totalBefore}, removed ${middle.amount_ml}, after ${anchorAfter?.water_ml}`);

    // ── sun: sessions, not one aggregated row ────────────────────────────────
    await call('logSunExposure', 20, '', undefined, today);
    await call('logSunExposure', 25, '', undefined, today);
    let sun = await call('getSunEntries', today);
    check(sun.length === 2, 'sun: two sessions were not recorded separately', JSON.stringify(sun));

    let day = await call('getTodaySunLog');
    check((day?.minutes ?? 0) === 45,
      'sun: the day total does not equal the sum of its sessions',
      `sessions ${JSON.stringify(sun)}, day ${JSON.stringify(day)}`);

    await call('deleteSunEntry', sun[1].id);
    sun = await call('getSunEntries', today);
    day = await call('getTodaySunLog');
    check(sun.length === 1, 'sun: the session was not removed', JSON.stringify(sun));
    check((day?.minutes ?? 0) === sun[0].minutes,
      'sun: the day total did not follow the removed session',
      `sessions ${JSON.stringify(sun)}, day ${JSON.stringify(day)}`);

    // Correcting the day outright must leave the list agreeing with the number.
    await call('correctSunLog', 60, today);
    sun = await call('getSunEntries', today);
    day = await call('getTodaySunLog');
    const sunSum = sun.reduce((n, e) => n + e.minutes, 0);
    check(sunSum === (day?.minutes ?? 0),
      'sun: after correcting the day, the sessions no longer sum to the total shown',
      `sessions ${JSON.stringify(sun)} sum ${sunSum}, day ${JSON.stringify(day)}`);

    // ── exercise: sessions are readable and removable ────────────────────────
    await call('logExercise', 30, 'walk', today, 'moderate');
    await call('logExercise', 15, 'run', today, 'vigorous');
    let ex = await call('getExerciseLogs', today);
    check(ex.length === 2, 'exercise: sessions are not readable individually', JSON.stringify(ex));

    const exTotalBefore = (await call('getTodayExercise', today)).totalMinutes;
    // getExerciseLogs is newest-first, so ex[1] is the OLDER session. Read its
    // duration rather than hardcoding one — this assertion first said "- 15",
    // the run's duration, and failed against a correct removal of the 30-minute
    // walk. An expectation written from the order you logged things in, not
    // from the order you read them back in.
    const removedEx = ex[1];
    await call('deleteExerciseLog', removedEx.id);
    ex = await call('getExerciseLogs', today);
    const exTotalAfter = (await call('getTodayExercise', today)).totalMinutes;
    check(ex.length === 1, 'exercise: the session was not removed', JSON.stringify(ex));
    check(!ex.some((r) => r.id === removedEx.id),
      'exercise: a different session was removed than the one asked for',
      `asked to remove id ${removedEx.id}; remaining ${JSON.stringify(ex)}`);
    check(exTotalAfter === exTotalBefore - removedEx.duration_minutes,
      'exercise: the day total did not move by exactly the removed session',
      `before ${exTotalBefore}, removed ${removedEx.duration_minutes}, after ${exTotalAfter}`);

    // ── the screens render what the data says ───────────────────────────────
    await gotoTab(ctx, 'Trackers');
    await ctx.page.waitForTimeout(1200);
    for (const [card, needles] of [
      ['Water', ['Daily goal', "Today's entries", 'Remove']],
      ['Sunlight', ['Daily goal', "Today's sessions", 'Last 30 days']],
      ['Exercise', ['Daily goal', "Today's sessions", 'Last 30 days']],
    ]) {
      const target = ctx.page.locator(`[aria-label^="${card} tracker"]`).first();
      if (!(await target.count())) { check(false, `Trackers has no ${card} card`); continue; }
      await target.click({ force: true });
      await ctx.page.waitForTimeout(1400);
      const body = await screenText(ctx);
      await ctx.shot(`${card.toLowerCase()}-screen`);
      check(!/went wrong/i.test(body), `${card} screen crashed into the error boundary`, body.slice(0, 300));
      for (const needle of needles) {
        check(body.includes(needle), `${card} screen does not show "${needle}"`, body.slice(0, 500));
      }
      await gotoTab(ctx, 'Trackers');
      await ctx.page.waitForTimeout(900);
      const back = ctx.page.locator('[aria-label="Go back"], [aria-label="Back"]').first();
      if (await back.count()) { await back.click({ force: true }); await ctx.page.waitForTimeout(800); }
      await gotoTab(ctx, 'Trackers');
      await ctx.page.waitForTimeout(700);
    }

    return { findings, endScreen: (await screenText(ctx)).slice(0, 600) };
  },
};
