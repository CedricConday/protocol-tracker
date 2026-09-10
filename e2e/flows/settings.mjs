// Settings tab: the profile editor, the save footer, and every sub-screen the
// menu links to. Also probes what happens when a required numeric field is
// cleared before saving.
import { onboard, gotoTab, refillInput, hasInputValue, screenText, reporter } from '../lib/prelude.mjs';

const SUBSCREENS = [
  ['Schedule & reminders', /Schedule|Reminder|dose/i],
  ['Reminder tone', /tone|coach|gentle|style/i],
  ['Send feedback', /feedback/i],
  ['About', /About|version|v1/i],
];

export default {
  name: 'settings',
  description: 'Settings tab — profile edit and save, sub-screens, danger zone visibility',

  async run(ctx) {
    const { findings, check } = reporter();

    await onboard(ctx);
    await gotoTab(ctx, 'Settings');
    await ctx.page.waitForTimeout(1200);
    await ctx.shot('settings');

    const s = await screenText(ctx);
    check(s.includes('Testuser'), 'Settings does not show the profile name from onboarding', s.slice(0, 500));
    check(/danger zone/i.test(s), 'Settings danger zone is missing', s.slice(-600));
    check(!s.includes('Save'), 'The save footer is visible before anything has been edited',
      s.split('\n').filter((l) => l.includes('Save')).join(' | '));

    // --- Edit the name ---
    await ctx.tap('You', { exact: true });
    await ctx.page.waitForTimeout(700);
    const nameFound = await refillInput(ctx, 'Testuser', 'Renamed');
    check(nameFound, 'The profile expander does not expose the name field',
      JSON.stringify(await ctx.page.$$eval('input', (els) => els.map((e) => e.value))));
    if (nameFound) {
      await ctx.page.waitForTimeout(500);
      await ctx.shot('name-edited');

      const dirty = await screenText(ctx);
      check(dirty.includes('Save'), 'Editing the name did not raise the save footer', dirty.slice(-500));

      await ctx.tap('Save', { exact: true });
      await ctx.page.waitForTimeout(900);
      await ctx.shot('name-saved');
      const savedText = await screenText(ctx);
      check(/Saved/.test(savedText), 'Saving the profile gave no confirmation', savedText.slice(-400));

      // The name is the greeting on Today.
      await gotoTab(ctx, 'Today');
      await ctx.page.waitForTimeout(1500);
      const home = await screenText(ctx);
      check(home.includes('Hello, Renamed'),
        'A profile rename does not reach the Today greeting', home.slice(0, 300));
      await gotoTab(ctx, 'Settings');
      await ctx.page.waitForTimeout(1200);
    }

    // --- Clearing the required weight field, then saving ---
    await ctx.tap('You', { exact: true }).catch(() => {});
    await ctx.page.waitForTimeout(700);
    const weightFound = await refillInput(ctx, '72', '');
    if (weightFound) {
      await ctx.page.waitForTimeout(400);
      const errorsBefore = ctx.errors.length;
      await ctx.tap('Save', { exact: true }).catch(() => {});
      await ctx.page.waitForTimeout(2000);
      await ctx.shot('empty-weight-save');
      const after = await screenText(ctx);
      const newErrors = ctx.errors.slice(errorsBefore);
      check(!/Saved/.test(after) || newErrors.length === 0,
        'Saving Settings with the weight field cleared reports success while the write throws',
        `errors after save: ${JSON.stringify(newErrors.map((e) => e.text).slice(0, 3))}\nfooter text: ${after.slice(-200)}`);
      check(newErrors.length === 0,
        'Clearing the weight field and saving raises a runtime error with no user-facing message',
        JSON.stringify(newErrors.map((e) => `${e.kind}: ${e.text}`).slice(0, 3)));
      // Put it back so later steps see a sane profile.
      const w2 = ctx.page.getByPlaceholder('70').first();
      if (await w2.count()) { await w2.fill('72'); await ctx.tap('Save', { exact: true }).catch(() => {}); await ctx.page.waitForTimeout(1200); }
    }

    // --- Sub-screens ---
    for (const [label, marker] of SUBSCREENS) {
      await gotoTab(ctx, 'Settings');
      await ctx.page.waitForTimeout(1000);
      const ok = await ctx.tap(label).then(() => true).catch(() => false);
      if (!ok) {
        findings.push({ summary: `Settings row "${label}" was not tappable` });
        continue;
      }
      await ctx.page.waitForTimeout(1400);
      await ctx.shot(`sub-${label.toLowerCase().replace(/[^a-z]+/g, '-')}`);
      const sub = await screenText(ctx);
      check(!/went wrong/i.test(sub), `"${label}" crashed into the error boundary`, sub.slice(0, 400));
      check(marker.test(sub), `"${label}" did not render its own content`, sub.slice(0, 400));
    }

    return { findings, endScreen: (await screenText(ctx)).slice(0, 700) };
  },
};
