// The Today tab up to and including "Start My Day".
//
// This flow runs WITHOUT the notification-scheduler stub on purpose: it is the
// one that catches what actually happens when the notification cleanup inside
// startDay() rejects. `day.mjs` picks up on the other side of that with the stub
// installed, so the active-day surface still gets walked.
import { onboard, startDay, tapAnimated, screenText, reporter } from '../lib/prelude.mjs';

export default {
  name: 'home',
  description: 'Today tab — pre-day view and the Start My Day transition (unstubbed)',

  async run(ctx) {
    const { findings, check } = reporter();

    await onboard(ctx);
    await ctx.shot('pre-day');

    const pre = await screenText(ctx);
    check(pre.includes('Start My Day'),
      'Today did not show the Start My Day button on a fresh account', pre.slice(0, 400));
    check(pre.includes('Hello, Testuser'),
      'Today greeting did not pick up the name entered during onboarding', pre.slice(0, 200));
    check(pre.includes("Ready for today's doses?"),
      'Today pre-day view is missing its subtitle', pre.slice(0, 300));

    // --- Start My Day ---
    const logsBefore = ctx.console.length;
    await startDay(ctx);
    await ctx.page.waitForTimeout(3000);
    await ctx.shot('after-start');

    const day = await screenText(ctx);
    // session.mjs filters "not available on web" out of ctx.errors as native
    // noise, so read the raw console here — the reason startDay aborted is
    // exactly one of those messages, and that is the point.
    const newErrors = ctx.console
      .slice(logsBefore)
      .filter((m) => m.type === 'error')
      .map((m) => m.text)
      .join('\n');
    const stillPreDay = day.includes('Start My Day');

    check(!stillPreDay,
      'Start My Day leaves the screen unchanged: no T=0 is set, no dose is scheduled, and the failure is swallowed into an Alert that never appears',
      `console after the tap:\n${newErrors.slice(0, 900) || '(none captured)'}`);

    if (stillPreDay) {
      check(!/cancelling supplement notifications/i.test(newErrors),
        'startDay() aborts on the notification cleanup before it writes the T=0 anchor — a notification failure blocks the day entirely',
        newErrors.slice(0, 900));
      // Nothing further on this screen is reachable; day.mjs covers it.
      return { findings, endScreen: day.slice(0, 600) };
    }

    // If it did start, the same assertions day.mjs makes apply here too.
    check(/\b0 of 1 doses\b|\b1 of 1 doses\b/.test(day),
      'Dose counter does not report the single scheduled dose', day.slice(0, 600));
    if (day.includes('more dose')) await tapAnimated(ctx, 'more dose').catch(() => {});
    return { findings, endScreen: (await screenText(ctx)).slice(0, 700) };
  },
};
