/**
 * The claim "none of your data goes to our servers" is a build-time fact, not a
 * permanent one.
 *
 * It holds because `EXPO_PUBLIC_API_URL` is unset, so `SYNC_ENABLED` is false
 * and `syncClient` has no endpoint to talk to. Nothing stops a future build
 * from setting that variable — at which point the sentence on the onboarding
 * screen becomes false silently, with no code change to review and nothing to
 * notice in a diff.
 *
 * This test is the thing that notices. If it ever fails, the claim has to come
 * off the first screen in the same commit that turns sync on.
 *
 * It is deliberately narrow: it says nothing about third parties. The weather
 * card sends coordinates to open-meteo.com and the MRI scanner sends an image
 * to whichever AI vendor the user configured a key for. Those are real, they
 * are disclosed separately, and they are not us.
 */
import { describe, it, expect } from 'vitest';

describe('no first-party server', () => {
  it('ships with no sync endpoint configured', () => {
    // Asserted on the environment variable directly, NOT by importing
    // syncClient. The first version of this test did import it, which drags in
    // ../db/schema and therefore expo-sqlite; that throws under vitest, the
    // test failed, and the failure message announced "EXPO_PUBLIC_API_URL is
    // set, so this build DOES talk to a server we run" — which was false and
    // alarming. The variable was undefined the whole time.
    //
    // `API_BASE = process.env.EXPO_PUBLIC_API_URL ?? null` is the whole of what
    // decides this, so read that and nothing else.
    expect(
      process.env.EXPO_PUBLIC_API_URL ?? null,
      'EXPO_PUBLIC_API_URL is set, so this build DOES talk to a server we run. ' +
      'The onboarding promise that no data reaches us is now false and must be ' +
      'changed in this same commit.'
    ).toBe(null);
  });

  it('hardcodes no first-party host anywhere in src/', async () => {
    const { readFileSync, readdirSync, statSync } = await import('node:fs');
    const { join } = await import('node:path');
    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((f) => {
        const p = join(dir, f);
        return statSync(p).isDirectory() ? walk(p) : p.endsWith('.ts') || p.endsWith('.tsx') ? [p] : [];
      });

    // Hosts the app is allowed to contact. Every one is a third party the user
    // is told about; none of them is ours.
    const ALLOWED = [
      'api.open-meteo.com',
      'air-quality-api.open-meteo.com',
      'api.anthropic.com',
      'api.openai.com',
      'api.groq.com',
      'www.facebook.com',      // community link, opened only by a deliberate tap
    ];

    const offenders: string[] = [];
    for (const file of walk('src')) {
      if (file.includes('__tests__')) continue;
      const body = readFileSync(file, 'utf8');
      for (const m of body.matchAll(/https?:\/\/([a-zA-Z0-9._-]+)/g)) {
        const host = m[1];
        if (!ALLOWED.includes(host)) offenders.push(`${file}: ${host}`);
      }
    }
    expect(
      offenders,
      'A host appeared in src/ that is not on the allowed list. If it is a server ' +
      'we run, the onboarding privacy claim is now false. If it is a new third ' +
      'party, it needs disclosing and adding to ALLOWED here.'
    ).toEqual([]);
  });
});
