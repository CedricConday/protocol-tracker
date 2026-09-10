// Walks a brand-new user from the permission primer through onboarding into the
// app proper, asserting each step lands where it should.
export default {
  name: 'onboarding',
  description: 'Fresh install → permission primer → profile → condition → notifications → home',

  async run(ctx) {
    const findings = [];
    const check = (ok, summary, detail) => {
      if (!ok) findings.push({ summary, detail });
      return ok;
    };

    await ctx.shot('boot');

    // Permission priming modal comes before onboarding on a fresh install.
    if (await ctx.sees('Stay on Track')) {
      await ctx.tap('Not now');
      await ctx.shot('after-primer');
    }

    // --- Step 0: profile ---
    check(await ctx.sees('Set Up Your Profile'), 'Onboarding did not open on the profile step',
      (await ctx.text()).slice(0, 400));

    // Next must be blocked while the required fields are empty.
    await ctx.tap('Next').catch(() => {});
    check(await ctx.sees('Set Up Your Profile'),
      'Next advanced past the profile step with name and weight empty');

    await ctx.fill('e.g. Alex', 'Testuser');
    await ctx.fill('e.g. 70', '72');
    await ctx.fill('e.g. 5000', '10000');
    await ctx.shot('profile-filled');

    await ctx.tap('Next');

    // --- Step 1: condition ---
    check(await ctx.sees('Your Condition'),
      'Profile step did not advance to Your Condition',
      (await ctx.text()).slice(0, 400));
    check(!(await ctx.sees('How do you want to use this app')),
      'The removed track-selection step is still reachable');

    await ctx.shot('condition');
    await ctx.tap('Multiple Sclerosis').catch(async () => {
      // Fall back to whatever the first condition card is called.
      const first = ctx.page.locator('div[role="button"]').nth(0);
      await first.click();
    });
    await ctx.tap('Next');

    // --- Step 2: notifications / done ---
    check(await ctx.sees('Almost Ready'),
      'Condition step did not advance to Almost Ready',
      (await ctx.text()).slice(0, 400));
    await ctx.shot('almost-ready');

    await ctx.tap("Let's begin");
    await ctx.page.waitForTimeout(4000);
    await ctx.shot('home');

    const home = await ctx.text();
    check(!home.includes('Almost Ready'),
      'Finishing onboarding did not leave the onboarding screen', home.slice(0, 400));

    return { findings, endScreen: home.slice(0, 600) };
  },
};
