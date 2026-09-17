// Trackers → Doses: the only place a user can build the protocol this app
// exists to track. Add one, check it lists, edit it, check the edit sticks, and
// check it reaches the next day's schedule.
//
// It was Settings → Manage supplements until 2026-09-14, when the Protocol
// group moved to the Trackers grid (SettingsScreen.tsx:318). The flow kept
// walking to Settings and crashed there before reaching its own subject.
import { onboard, gotoTab, startDay, tapAnimated, refillInput, screenText, screenLine, visibleTouchables, reporter } from '../lib/prelude.mjs';

export default {
  name: 'supplements',
  description: 'Manage supplements — add, list, edit, and feed the schedule',
  session: { stubNotificationScheduler: true },

  async run(ctx) {
    const { findings, check } = reporter();

    await onboard(ctx);
    await gotoTab(ctx, 'Trackers');
    await ctx.shot('trackers');

    const trackers = await screenText(ctx);
    check(trackers.includes('Doses'),
      'The Trackers grid has no "Doses" card to reach the supplement editor', trackers.slice(0, 600));

    await ctx.tap('Doses', { exact: true });
    await ctx.page.waitForTimeout(1200);
    await ctx.shot('editor');

    const editor = await screenText(ctx);
    check(editor.includes('Supplements'), 'Supplement editor did not open', editor.slice(0, 400));
    check(editor.includes('Vitamin D3'),
      'The supplement created during onboarding is not listed in the editor', editor.slice(0, 500));

    // --- Add a supplement ---
    // The add control is icon-only in the visual sense, but it IS named:
    // SupplementEditorScreen.tsx:264 renders accessibilityRole="button" and
    // accessibilityLabel={showAddForm ? 'Close the add supplement form' : 'Add
    // a supplement'}. This flow used to assert the opposite unconditionally —
    // it pushed "no accessibilityLabel and no accessibilityRole" as a finding on
    // every run without ever looking, and hunted the button by pixel geometry
    // because of the same wrong premise.
    //
    // Ask for the name first, which is what a screen reader has. Geometry stays
    // as a fallback, and the a11y finding is filed only when the name really is
    // missing.
    const addName = await ctx.page.evaluate(() => {
      const el = [...document.querySelectorAll('[aria-label]')]
        .find((e) => /^(add a supplement|close the add supplement form)$/i.test((e.getAttribute('aria-label') || '').trim()));
      return el ? { label: el.getAttribute('aria-label'), role: el.getAttribute('role') } : null;
    });

    let addBtn = addName ? ctx.page.locator(`[aria-label="${addName.label}"]`).first() : null;
    const candidates = [];
    if (!addBtn) {
      for (const el of await visibleTouchables(ctx)) {
        const box = await el.boundingBox();
        if (!box) continue;
        // An icon-only control still has "text": the glyph from the icon font,
        // which lives in the Unicode private-use area. Strip that to decide
        // whether a human-readable label exists.
        const raw = await el.evaluate((e) => e.innerText.trim());
        const label = raw.replace(/[\p{Private_Use}\s]/gu, '');
        candidates.push(`${label ? JSON.stringify(label.slice(0, 20)) : '(icon only)'}@${Math.round(box.x)},${Math.round(box.y)} ${Math.round(box.width)}x${Math.round(box.height)}`);
        if (!addBtn && !label && box.y > 40 && box.y < 160 && box.width <= 60 && box.height <= 60) addBtn = el;
      }
      findings.push({
        summary: 'The "add supplement" button has no accessible name — a screen reader announces an unlabelled control and nothing but pixel position identifies it',
        detail: `visible touchables on the editor: ${candidates.join(' | ')}`,
      });
    }

    check(addBtn !== null,
      'Could not locate the "add supplement" button in the editor header',
      addName ? `accessible name present ("${addName.label}") but the element could not be resolved` : `visible touchables: ${candidates.join(' | ')}`);

    let opened = false;
    if (addBtn) {
      await addBtn.click({ force: true });
      await ctx.page.waitForTimeout(900);
      opened = (await screenText(ctx)).includes('New Supplement');
    }
    check(opened, 'Could not open the "New Supplement" form from the editor header',
      (await screenText(ctx)).slice(0, 400));

    if (opened) {
      await ctx.fill('e.g. Magnesium Glycinate', 'Magnesium Glycinate');
      // '0' is a substring of the '400' dose placeholder, so both of these need
      // an exact match to land in the right box.
      await ctx.page.getByPlaceholder('400', { exact: true }).first().fill('400');
      await ctx.fill('mg · IU · mcg', 'mg');
      // Timing is no longer a minutes box. The presets are the fast path and
      // "2 h" is 120 minutes, which is what the row label is checked against
      // below. Tapping the chip also covers the control the wizard shares.
      await ctx.tap('2 h', { exact: true });
      await ctx.page.waitForTimeout(300);
      await ctx.shot('add-form-filled');

      await ctx.tap('Add Supplement');
      await ctx.page.waitForTimeout(1500);
      await ctx.shot('after-add');

      const listed = await screenText(ctx);
      check(listed.includes('Magnesium Glycinate'),
        'A newly added supplement does not appear in the list', listed.slice(0, 600));
      check(!listed.includes('New Supplement'),
        'The add form stayed open after a successful save', listed.slice(0, 300));
      check(/400 mg/.test(listed),
        'The saved dose amount/unit is not shown on the supplement row',
        listed.split('\n').filter((l) => /Magnesium|mg|after start/.test(l)).join(' | '));
      check(/2 h after start/.test(listed),
        'The saved timing is not shown on the supplement row in hours',
        listed.split('\n').filter((l) => /after start|Magnesium/.test(l)).join(' | '));
      check(!/T0/.test(listed),
        'The supplement row still says "T0" at the patient',
        listed.split('\n').filter((l) => /T0/.test(l)).join(' | '));

      // --- Edit it ---
      await ctx.tap('Magnesium Glycinate');
      await ctx.page.waitForTimeout(900);
      const renamed = await refillInput(ctx, 'Magnesium Glycinate', 'Magnesium Bisglycinate');
      if (renamed) {
        await ctx.tap('Save');
        await ctx.page.waitForTimeout(1500);
        const edited = await screenText(ctx);
        check(edited.includes('Magnesium Bisglycinate'),
          'Editing a supplement name did not persist', edited.slice(0, 500));
        await ctx.shot('after-edit');
      } else {
        findings.push({ summary: 'Expanding a supplement row did not reveal an editable name field' });
      }
    }

    // --- Does the new supplement reach the schedule? ---
    await gotoTab(ctx, 'Today');
    await startDay(ctx);
    await ctx.page.waitForTimeout(2500);

    // The first-day explainer covers the dose list on the run that starts a
    // day for the first time, so the check below was reading the modal and
    // reporting the supplement missing from a schedule it was actually on.
    if (await ctx.sees("Got it, let's start")) {
      await ctx.tap("Got it, let's start");
      await ctx.page.waitForTimeout(900);
    }
    await ctx.shot('today-after-add');

    let today = await screenText(ctx);
    // The teaser reads "N doses left today - tap to view all" (homeDosesLeft);
    // it has not said "more doses" for a while, so this never expanded and the
    // check below read a collapsed list as a missing supplement.
    if (/doses left today/.test(today)) {
      await tapAnimated(ctx, 'doses left today').catch(() => {});
      await ctx.page.waitForTimeout(900);
      today = await screenText(ctx);
    }
    check(today.includes('Magnesium') || today.includes('Bisglycinate'),
      'A supplement added before Start My Day never appears in the day schedule',
      today.slice(0, 700));
    const line = await screenLine(ctx);
    check(/\bof 2 doses\b/.test(line),
      'Today does not count both supplements after adding a second one',
      (line.match(/.{0,40}of \d+ doses/) ?? ['(no dose counter)'])[0]);

    return { findings, endScreen: today.slice(0, 700) };
  },
};
