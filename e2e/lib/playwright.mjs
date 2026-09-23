// Resolve Playwright without hard-coding anyone's home directory.
//
// Playwright is not a dependency of this app — it is ~400 MB of browsers that
// nothing in the shipped bundle touches, so it stays out of package.json and the
// e2e harness borrows whatever copy the machine already has. Three sources, in
// order:
//
//   1. $PT_PLAYWRIGHT — an absolute path to playwright's index.mjs. Set this if
//      the harness cannot find your copy.
//   2. a normal resolution, i.e. `npm i -D playwright` in this repo.
//   3. a shared per-user install at ~/.local/share/playwright/node_modules/playwright
//      (`npm i --prefix ~/.local/share/playwright playwright`).
//
// See e2e/README.md.
import { homedir } from 'node:os';
import { access } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

async function sharedInstall() {
  const candidate = join(homedir(), '.local', 'share', 'playwright', 'node_modules', 'playwright', 'index.mjs');
  try {
    await access(candidate);
    return candidate;
  } catch {
    return null;
  }
}

async function resolve() {
  const override = process.env.PT_PLAYWRIGHT;
  if (override) return import(pathToFileURL(override).href);
  try {
    return await import('playwright');
  } catch {
    // fall through
  }
  const shared = await sharedInstall();
  if (shared) return import(pathToFileURL(shared).href);
  throw new Error(
    'Playwright not found. Install it (`npm i -D playwright && npx playwright install chromium`) ' +
      'or point $PT_PLAYWRIGHT at an existing index.mjs.',
  );
}

export const { chromium } = await resolve();
