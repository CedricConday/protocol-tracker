import { JSDOM } from 'jsdom';
import 'fake-indexeddb/auto';
import fs from 'fs';
import path from 'path';

import { fileURLToPath } from 'url';
const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(APP, p), 'utf8');

const html = read('index.html').replace('<script src="./app.js"></script>', '');
const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'http://localhost/' });
const { window } = dom;

// real browser-ish globals
const def = (o, k, v) => Object.defineProperty(o, k, { value: v, writable: true, configurable: true });
def(window, 'crypto', globalThis.crypto);
def(window, 'indexedDB', globalThis.indexedDB);
def(window, 'IDBKeyRange', globalThis.IDBKeyRange);
window.btoa = (s) => Buffer.from(s, 'binary').toString('base64');
window.atob = (s) => Buffer.from(s, 'base64').toString('binary');
window.TextEncoder = TextEncoder;
window.TextDecoder = TextDecoder;
window.fetch = async (url) => { const b = read(String(url).replace(/^\.\//, '')); return { json: async () => JSON.parse(b), text: async () => b }; };
window.HTMLElement.prototype.scrollIntoView = () => {};
window.scrollTo = () => {};
window.addEventListener('unhandledrejection', (e) => console.log('UNHANDLED REJECTION:', e.reason && (e.reason.stack || e.reason)));

const results = [];
const ok = (name, cond) => { results.push([!!cond, name]); console.log((cond ? '✅' : '❌') + ' ' + name); };
const $ = (s) => window.document.querySelector(s);
const $$ = (s) => Array.from(window.document.querySelectorAll(s));
const visible = (id) => { const e = window.document.getElementById(id); return e && !e.hidden; };
const tick = (ms = 20) => new Promise((r) => setTimeout(r, ms));
const click = (el) => (typeof el === 'string' ? $(el) : el).dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
async function waitFor(fn, ms = 5000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (fn()) return true; await tick(20); } return false; }
const rows = () => $$('#supp-list .supp-row').length;

const scriptEl = window.document.createElement('script');
scriptEl.textContent = read('app.js');           // run as a real inline script (natural scope)
window.document.body.appendChild(scriptEl);
window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
await waitFor(() => visible('home'));

try {
  // HOME
  ok('boot → home visible', visible('home'));
  ok('lock hidden at home', $('#lock').hidden);

  // LOGIN → setup
  click('#home-login');
  ok('login → lock shown', await waitFor(() => !$('#lock').hidden));
  ok('setup mode (confirm field)', !$('#lock-pass2').hidden);
  $('#lock-pass').value = 'coimbra2026';
  $('#lock-pass2').value = 'coimbra2026';
  click('#lock-btn');
  ok('setup → profile onboarding', await waitFor(() => visible('onboard-profile')));

  // PROFILE
  $('#p-name').value = 'the patient';
  $('#p-weight').value = '68';
  $('#p-condition').value = 'Multiple Sclerosis';
  click('#p-continue');
  ok('profile → supplements onboarding', await waitFor(() => visible('onboard-supps')));

  // SUPP 1 — Vitamin D3 (catalog default)
  ok('supps-done disabled at 0', $('#supps-done').disabled);
  click('#supp-add-toggle');
  await waitFor(() => !$('#supp-editor').hidden);
  ok('supp editor open', !$('#supp-editor').hidden);
  ok('catalog picker populated', $('#supp-pick').options.length > 3);
  ok('forms populated', $('#supp-form').options.length >= 1);
  ok('dayparts prefilled from timing', $$('#supp-dayparts .chip.on').length >= 1);
  $('#supp-dose').value = '40000';
  click('#supp-save');
  ok('supp 1 added', await waitFor(() => rows() === 1));
  ok('supps-done now enabled', !$('#supps-done').disabled);

  // SUPP 2 — Magnesium
  click('#supp-add-toggle');
  await waitFor(() => !$('#supp-editor').hidden);
  if ($$('#supp-pick option').some((o) => o.value === 'magnesium')) {
    $('#supp-pick').value = 'magnesium';
    $('#supp-pick').dispatchEvent(new window.Event('change'));
    await tick(40);
  }
  $('#supp-dose').value = '400';
  click('#supp-save');
  ok('supp 2 added', await waitFor(() => rows() === 2));

  // SUPP 3 — custom (tests chip toggle + custom name)
  click('#supp-add-toggle');
  await waitFor(() => !$('#supp-editor').hidden);
  $('#supp-pick').value = '__custom';
  $('#supp-pick').dispatchEvent(new window.Event('change'));
  await tick(40);
  ok('custom → name field shown', !$('#supp-custom-name').hidden);
  $('#supp-custom-name').value = 'Vitamin-C-free multivit';
  $('#supp-doseunit').value = 'cap'; $('#supp-dose').value = '1';
  click($('#supp-dayparts .chip'));            // custom has no prefilled dayparts — tap one
  ok('chip toggles on click', $('#supp-dayparts .chip').classList.contains('on'));
  click('#supp-save');
  ok('custom supp added (3 rows)', await waitFor(() => rows() === 3));
  ok('custom name in list', /C-free multivit/.test($('#supp-list').textContent));

  // EDIT an existing row
  click($('#supp-list .supp-row [data-edit]'));
  await waitFor(() => !$('#supp-editor').hidden);
  ok('editor opens for edit', !$('#supp-editor').hidden);
  $('#supp-dose').value = '999';
  click('#supp-save');
  await tick(300);
  ok('edit keeps 3 rows', rows() === 3);

  // DASHBOARD
  click('#supps-done');
  ok('dashboard visible', await waitFor(() => visible('dashboard')));
  ok('dashboard shows dose items', await waitFor(() => $$('#day-plan .dose').length >= 3));
  ok('greeting shows name', /the patient/.test($('#dash-greet').textContent));
  ok('safety reminders rendered', await waitFor(() => $$('#safety-list .safety-row').length >= 3));

  // mark one taken
  const box = $('#day-plan .dose input.take');
  box.checked = true;
  box.dispatchEvent(new window.Event('change', { bubbles: true }));
  ok('progress reflects taken dose', await waitFor(() => /^1\//.test($('#dash-progress').textContent)));

  // LOCK → UNLOCK roundtrip
  click('#dash-lock');
  ok('lock → home', await waitFor(() => visible('home')));
  click('#home-login');
  await waitFor(() => !$('#lock').hidden);
  ok('returning user → unlock mode', $('#lock-pass2').hidden);
  $('#lock-pass').value = 'coimbra2026';
  click('#lock-btn');
  ok('correct pass → dashboard', await waitFor(() => visible('dashboard')));
  ok('data persisted (supps present)', await waitFor(() => $$('#day-plan .dose').length >= 3));
  ok('taken state persisted', await waitFor(() => /^1\//.test($('#dash-progress').textContent)));

  // WRONG passphrase
  click('#dash-lock'); await waitFor(() => visible('home'));
  click('#home-login'); await waitFor(() => !$('#lock').hidden);
  $('#lock-pass').value = 'WRONG';
  click('#lock-btn');
  await tick(400);
  ok('wrong pass stays on lock', !$('#lock').hidden);
  ok('wrong pass shows error', $('#lock-msg').textContent.length > 0);
} catch (e) {
  console.log('\n💥 THREW:', (e && e.stack) || e);
  results.push([false, 'no exceptions during flow']);
}

const passed = results.filter((r) => r[0]).length;
console.log(`\n${passed}/${results.length} checks passed`);
process.exit(passed === results.length ? 0 : 1);
