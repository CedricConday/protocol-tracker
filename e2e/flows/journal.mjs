// Journal tab: pick a mood, write a note, save, and check the entry survives a
// tab round-trip. Also opens the "+ Log Event" (Relapse) modal it links to.
import { onboard, gotoTab, hasInputValue, screenText, reporter } from '../lib/prelude.mjs';

const NOTE = 'Slept badly, otherwise fine.';

export default {
  name: 'journal',
  description: 'Journal tab — mood, note, save, persistence, and the Log Event modal',

  async run(ctx) {
    const { findings, check } = reporter();

    await onboard(ctx);
    await gotoTab(ctx, 'Journal');
    await ctx.shot('journal');

    const body = await screenText(ctx);
    check(body.includes('How are you feeling?'), 'Journal did not render the mood picker', body.slice(0, 500));
    check(body.includes('Save Entry'), 'Journal has no Save Entry button', body.slice(0, 500));
    check(body.includes('+ Log Event'), 'Journal has no "+ Log Event" entry point', body.slice(0, 300));

    // Two sections in a row both titled "This Week" reads as a duplicate header.
    const weekHeadings = (body.match(/This Week/g) || []).length;
    check(weekHeadings <= 1,
      'Journal renders two sections both headed "This Week" (mood strip and past entries)',
      body.split('\n').filter((l) => l.includes('This Week')).join(' | '));

    // --- Pick a mood and write a note ---
    await ctx.tap('Good');
    await ctx.page.waitForTimeout(400);

    const noteInput = ctx.page.getByPlaceholder('How are you feeling today?').first();
    check(await noteInput.count() > 0, 'Journal note input not found');
    if (await noteInput.count()) {
      await noteInput.fill(NOTE);
      await ctx.page.waitForTimeout(300);
    }
    await ctx.shot('journal-filled');

    await ctx.tap('Save Entry');
    await ctx.page.waitForTimeout(800);
    await ctx.shot('journal-saved');

    const saved = await screenText(ctx);
    check(saved.includes('Saved ✓') || saved.includes('Saved'),
      'Saving a journal entry gave no confirmation', saved.slice(0, 400));

    // --- Does it survive leaving and coming back? ---
    await gotoTab(ctx, 'Today');
    await gotoTab(ctx, 'Journal');
    await ctx.page.waitForTimeout(1200);
    await ctx.shot('journal-return');

    const back = await screenText(ctx);
    const noteStillThere = await hasInputValue(ctx, NOTE);
    check(noteStillThere, 'The saved note is not restored when returning to the Journal tab', back.slice(0, 600));

    // Today's entry is filtered out of the past-entry list on purpose, so an
    // account with one entry should still show the empty state there — but the
    // mood strip must show today's mood.
    check(back.includes('🙂'), "Today's mood is not reflected on the Journal week strip", back.slice(0, 500));

    // --- Log Event modal ---
    await ctx.tap('+ Log Event');
    await ctx.page.waitForTimeout(1400);
    await ctx.shot('log-event');
    const relapse = await screenText(ctx);
    check(!/went wrong/i.test(relapse), 'The Log Event screen crashed into the error boundary', relapse.slice(0, 400));
    check(relapse.length > 60, 'The Log Event screen rendered blank', JSON.stringify(relapse.slice(0, 200)));

    return { findings, endScreen: relapse.slice(0, 700) };
  },
};
