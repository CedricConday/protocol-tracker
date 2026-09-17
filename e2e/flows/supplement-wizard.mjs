// Trackers → Doses → Add several: entering a protocol as a chain of gaps
// instead of a column of minutes-after-T0.
//
// What this flow is actually watching for is the flattening. The patient types
// gaps; the database stores absolute offsets; if those two ever disagree the
// doses land at the wrong hour and nothing on screen says so. So it reads the
// rows back out of the app's own SQLite at the end rather than trusting the
// labels.
import { onboard, gotoTab, screenText, reporter } from '../lib/prelude.mjs';

export default {
  name: 'supplement-wizard',
  description: 'Supplement wizard — gaps in, absolute offsets out',
  session: { stubNotificationScheduler: true },

  async run(ctx) {
    const { findings, check } = reporter();

    await onboard(ctx);
    await gotoTab(ctx, 'Trackers');
    await ctx.tap('Doses', { exact: true });
    await ctx.page.waitForTimeout(1200);

    const editor = await screenText(ctx);
    check(editor.includes('Add several'),
      'The editor offers no way into the wizard', editor.slice(0, 500));

    await ctx.tap('Add several');
    await ctx.page.waitForTimeout(1200);
    await ctx.shot('wizard-open');

    const opened = await screenText(ctx);
    // Onboarding already created Vitamin D3, so the first question the wizard
    // asks should name it rather than the start of the day.
    check(/How long after/.test(opened),
      'The wizard does not ask the gap question', opened.slice(0, 600));
    check(/How long after Vitamin D3/.test(opened),
      'The wizard measures against the start of the day instead of the supplement before it',
      (opened.match(/How long after[^\n]*/) ?? ['(no question found)'])[0]);

    // --- Magnesium, 2 h after the D3 ---
    await ctx.fill('e.g. Magnesium Glycinate', 'Magnesium Glycinate');
    // The fields are bubbles that open one control at a time (2026-09-17). The
    // When bubble is labelled with the wizard's own question, which is also
    // what makes it findable here.
    await ctx.page.locator('[aria-label^="Dose: "]').first().click();
    await ctx.page.waitForTimeout(400);
    await ctx.page.getByPlaceholder('400', { exact: true }).first().fill('400');
    await ctx.fill('mg · IU · mcg', 'mg');
    await ctx.page.locator('[aria-label^="How long after"]').first().click();
    await ctx.page.waitForTimeout(400);
    await ctx.tap('2 h', { exact: true });
    await ctx.page.waitForTimeout(300);
    await ctx.shot('wizard-first-filled');

    await ctx.tap('Save and next');
    await ctx.page.waitForTimeout(1600);

    const afterFirst = await screenText(ctx);
    check(afterFirst.includes('Magnesium Glycinate'),
      'A supplement saved in the wizard does not show up in the running chain',
      afterFirst.slice(0, 700));
    check(/How long after Magnesium/.test(afterFirst),
      'The next question is not anchored to the supplement just entered',
      (afterFirst.match(/How long after[^\n]*/) ?? ['(no question found)'])[0]);

    // --- Zinc, 30 min after the magnesium ---
    await ctx.fill('e.g. Magnesium Glycinate', 'Zinc');
    await ctx.page.locator('[aria-label^="How long after"]').first().click();
    await ctx.page.waitForTimeout(400);
    await ctx.tap('30 min', { exact: true });
    await ctx.page.waitForTimeout(300);
    await ctx.tap('Save and next');
    await ctx.page.waitForTimeout(1600);
    await ctx.shot('wizard-chain');

    // --- The flattening, read from the database rather than the screen ---
    const rows = await ctx.sql(
      `SELECT s.name, sr.offset_minutes
         FROM supplements s JOIN schedule_rules sr ON sr.supplement_id = s.id
        ORDER BY sr.offset_minutes, s.id`,
    );
    const shape = rows.map((r) => `${r.name}=${r.offset_minutes}`).join(', ');

    const mag = rows.find((r) => /Magnesium/i.test(r.name));
    const zinc = rows.find((r) => /Zinc/i.test(r.name));
    check(mag?.offset_minutes === 120,
      'A 2 h gap after the first supplement did not store as 120 minutes after T0', shape);
    check(zinc?.offset_minutes === 150,
      'A 30 min gap after a supplement at 120 did not store as 150 — the chain did not flatten',
      shape);

    // --- The review step ---
    await ctx.tap('Review');
    await ctx.page.waitForTimeout(1200);
    await ctx.shot('wizard-review');

    const review = await screenText(ctx);
    check(/Your day, in order/.test(review), 'The review step did not open', review.slice(0, 500));
    check(review.includes('Zinc') && review.includes('Magnesium Glycinate'),
      'The review does not list what was entered', review.slice(0, 700));
    check(/starts the day/.test(review),
      'The review does not mark which supplement anchors the day', review.slice(0, 700));

    return { findings, endScreen: review.slice(0, 700) };
  },
};
