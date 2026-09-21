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
//   3. an npx-cached copy under ~/.npm/_npx/*/node_modules/playwright.
//
// See e2e/README.md.
import { homedir } from 'node:os';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

async function npxCached() {
  const root = join(homedir(), '.npm', '_npx');
  let entries;
  try {
    entries = await readdir(root);
  } catch {
    return null;
  }
  for (const entry of entries) {
    const candidate = join(root, entry, 'node_modules', 'playwright', 'index.mjs');
    try {
      return (await import(pathToFileURL(candidate).href)).chromium ? candidate : null;
    } catch {
      // not this one
    }
  }
  return null;
}

async function resolve() {
  const override = process.env.PT_PLAYWRIGHT;
  if (override) return import(pathToFileURL(override).href);
  try {
    return await import('playwright');
  } catch {
    // fall through
  }
  const cached = await npxCached();
  if (cached) return import(pathToFileURL(cached).href);
  throw new Error(
    'Playwright not found. Install it (`npm i -D playwright && npx playwright install chromium`) ' +
      'or point $PT_PLAYWRIGHT at an existing index.mjs.',
  );
}

export const { chromium } = await resolve();
