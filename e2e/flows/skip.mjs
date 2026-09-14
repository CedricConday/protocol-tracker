// The skip path, end to end, read back from the database.
//
// The 60-day audit reported "Dose sheet Skip does not persist" for sixty days
// running. The data layer was never the problem: skipDose and
// skipDoseWithReason (queries.ts:237/:248) are correct. Skip is a TWO-STEP
// flow — handleSkipPress (DoseDetailModal.tsx:64) only opens a reason picker,
// and only handleReasonSelect reaches the database — and the harness tapped
// step one, waited, and read back a row that was of course still `upcoming`.
// The reason buttons also had no accessible name, so nothing could have tapped
// them by name even if it had tried.
//
// This flow exists so that stops costing an hour to find out. It reproduces
// the whole path in about ninety seconds and reports what the row actually
// says, not what the screen shows.
//
// It is written for BOTH shapes on purpose. Round 3 A1 makes a single tap skip
// outright with the reason as an optional second step; until that lands the
// reason step is required. The flow reports which shape it found rather than
// assuming one, so the day A1 lands the report says so instead of going quiet.
import { onboard, startDay, tapAnimated, screenText, reporter } from '../lib/prelude.mjs';

// DoseStatus has no 'skipped' member yet (types/index.ts:1, frozen until round
// 3 A2), so a skip is stored as 'missed' with logged_time stamped.
// markOverdueDoses also writes 'missed' but leaves logged_time null, so
// logged_time is the only thing separating a deliberate skip from an untouched
// dose. Both readings are accepted so this keeps meaning the same thing after
// A2 lands.
const isSkipped = (r) =>
  !!r && (/^skipped$/i.test(String(r.status ?? '')) ||
          (r.status === 'missed' && r.logged_time !== null && r.logged_time !== undefined));

export default {
  name: 'skip',
  description: 'Skipping a dose reaches the database — one tap or tap-then-reason',
  session: { stubNotificationScheduler: true },

  async run(ctx) {
    const { findings, check } = reporter();

    await onboard(ctx);
    await startDay(ctx);
    await ctx.page.waitForTimeout(3000);

    const row = async () => {
      const rows = await ctx.sql(
        'SELECT id, status, logged_time, skip_reason FROM dose_logs ORDER BY scheduled_time LIMIT 1'
      );
      return rows[0] ?? null;
    };

    const before = await row();
    check(!!before, 'No dose_logs row exists after starting the day — nothing to skip');
    if (!before) return { findings, endScreen: (await screenText(ctx)).slice(0, 600) };
    check(!isSkipped(before),
      'The dose is already skipped before the flow touched it',
      JSON.stringify(before));

    // --- open the dose sheet ---
    if (/more dose/.test(await screenText(ctx))) {
      await tapAnimated(ctx, 'more dose').catch(() => {});
      await ctx.page.waitForTimeout(900);
    }
    await tapAnimated(ctx, 'Vitamin D3').catch(() => {});
    await ctx.page.waitForTimeout(1000);
    await ctx.shot('dose-sheet');

    const labels = async () => ctx.page.evaluate(() =>
      [...document.querySelectorAll('[aria-label]')].map((e) => e.getAttribute('aria-label') || ''));
    const clickLabel = async (name) => {
      const el = ctx.page.locator(`[aria-label="${name}"]`).first();
      if (!(await el.count())) return false;
      await el.click({ force: true });
      return true;
    };

    const skipControl = (await labels()).find((l) => l.startsWith('Skip ') && !l.startsWith('Skip this dose:'));
    check(!!skipControl,
      'The dose sheet has no control whose accessible name starts with "Skip " — a skip cannot be tapped by name',
      (await labels()).filter(Boolean).join(' | ').slice(0, 500));
    if (!skipControl) return { findings, endScreen: (await screenText(ctx)).slice(0, 600) };

    // --- step one: tap Skip ---
    await clickLabel(skipControl);
    await ctx.page.waitForTimeout(1500);
    await ctx.shot('after-skip-tap');
    const afterTap = await row();

    const oneTapWrote = isSkipped(afterTap);
    const reasons = (await labels()).filter((l) => l.startsWith('Skip this dose: '));

    if (oneTapWrote) {
      // Round 3 A1 has landed. Say so — a flow that silently accepts both
      // shapes teaches nobody which one is live.
      findings.push({
        summary: 'NOTE (not a defect): a single tap on "Skip" wrote the skip — round 3 A1 is live',
        detail: `dose_logs after one tap: ${JSON.stringify(afterTap)}`,
      });
    } else {
      check(reasons.length > 0,
        'Tapping "Skip" wrote nothing and the sheet offers no reason control to finish with — the skip is unreachable',
        `row after tap: ${JSON.stringify(afterTap)}; accessible names on screen: ${(await labels()).filter(Boolean).join(' | ').slice(0, 400)}`);
      if (!reasons.length) return { findings, endScreen: (await screenText(ctx)).slice(0, 600) };

      // --- step two: tap a reason ---
      await clickLabel(reasons[0]);
      await ctx.page.waitForTimeout(1600);
      await ctx.shot('after-reason-tap');
      const afterReason = await row();

      check(isSkipped(afterReason),
        `Tapping "Skip" and then "${reasons[0]}" still did not skip the dose`,
        `row: ${JSON.stringify(afterReason)}`);
      check(afterReason?.skip_reason !== null && afterReason?.skip_reason !== undefined,
        `A reason was tapped ("${reasons[0]}") but dose_logs.skip_reason is null — the reason was discarded`,
        `row: ${JSON.stringify(afterReason)}`);
    }

    // --- the screen must agree with the row ---
    //
    // NOT by asserting the dose counter moved. "X of N doses" is a TAKEN count,
    // so a skipped dose legitimately leaves it at "0 of 1" — an assertion that
    // the counter changes would fire on a coincidence and read as a defect,
    // which is the exact class of check this lane exists to remove.
    //
    // What must be true is weaker and actually true: a dose the patient has
    // resolved is no longer offered as something to resolve. So the dose row's
    // own accessible name must stop describing a due or upcoming dose.
    await ctx.page.waitForTimeout(800);
    const stored = await row();
    if (isSkipped(stored)) {
      if (/more dose/.test(await screenText(ctx))) {
        await tapAnimated(ctx, 'more dose').catch(() => {});
        await ctx.page.waitForTimeout(900);
      }
      const doseRows = (await labels()).filter((l) => /, scheduled at /.test(l));
      await ctx.shot('after-skip-settled');
      check(doseRows.length > 0,
        'The dose row vanished from Today after the dose was skipped, rather than showing as skipped',
        `accessible names: ${(await labels()).filter(Boolean).join(' | ').slice(0, 400)}`);
      check(!doseRows.some((l) => /\b(due|upcoming)\b/i.test(l)),
        'A skipped dose is still described as due or upcoming on Today — the screen and the row disagree',
        `dose rows: ${doseRows.join(' | ')} | row: ${JSON.stringify(stored)}`);
      // Recorded either way: this is the string Build A's A2 changes when
      // 'skipped' becomes a real status, and it is worth having the before.
      findings.push({
        summary: 'NOTE (not a defect): how Today names a skipped dose',
        detail: `${doseRows.join(' | ') || '(no dose rows)'} — stored row ${JSON.stringify(stored)}`,
      });
    }

    return { findings, endScreen: (await screenText(ctx)).slice(0, 700) };
  },
};
