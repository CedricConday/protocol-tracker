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
  ok('timing hint cites a source', await waitFor(() => /Source:/.test($('#supp-hint').textContent)));
  ok('dose-safety note surfaced (Vit D >10,000 IU)', /10,000/.test($('#supp-hint').textContent));
  ok('dose-safety note styled as caution', !!$('#supp-hint .caution'));
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
  ok('pre-start shows Start-my-day', await waitFor(() => !$('#day-start').hidden));
  ok('pre-start: loggers hidden (hero focus)', $('#card-water').hidden === true && $('#card-meal').hidden === true);
  ok('pre-start: preview shows projected times', /\d/.test($('#day-preview').textContent));
  click('#day-start-btn');                       // set T0 — the schedule flows from here
  ok('dashboard shows dose items', await waitFor(() => $$('#day-plan .dose').length >= 3));
  ok('started: loggers now shown', $('#card-water').hidden === false);
  ok('started: slot shows a live status/time', /(now|min|\d:\d|:\d\d)/.test($('#day-plan .slot-head').textContent));
  ok('greeting shows name', /the patient/.test($('#dash-greet').textContent));
  ok('safety reminders rendered', await waitFor(() => $$('#safety-list .safety-row').length >= 3));
  ok('sources & references rendered', await waitFor(() => $$('#refs-list .ref-row').length >= 3));
  ok('safety reminders cite a source', /Source:/.test($('#safety-src').textContent));
  ok('references footer attributes sharing', /the patient/.test($('#refs-foot').textContent));
  ok('computeFires: one nudge per future slot', (() => {
    const f = window.__pt.computeFires(1000000, [{ dp: 'breakfast' }, { dp: 'breakfast' }, { dp: 'lunch' }], 0);
    return f.length === 2 && f[0].at < f[1].at && f.every((x) => x.at > 0);
  })());
  ok('computeFires: drops past slots', window.__pt.computeFires(0, [{ dp: 'breakfast' }], 9e12).length === 0);
  ok('reminders toggle hidden when push unsupported', $('#reminders-wrap').hidden === true);
  ok('slotStatus: done/upcoming/due/overdue', (() => {
    const s = window.__pt.slotStatus;
    return s(1000, 30, 0, true) === 'done'
      && s(60 * 60000, 30, 0, false) === 'upcoming'
      && s(5 * 60000, 30, 0, false) === 'due'
      && s(0, 30, 40 * 60000, false) === 'overdue';
  })());
  ok('formatRelative: now / in 23 min / 20 min ago', (() => {
    const f = window.__pt.formatRelative;
    return f(0, 0) === 'now' && f(23 * 60000, 0) === 'in 23 min' && f(0, 20 * 60000) === '20 min ago';
  })());
  ok('bedtimeAdvisory: fires past bedtime, null without / early', (() => {
    const ba = window.__pt.bedtimeAdvisory, items = [{ off: 300 }];
    const late = new Date(); late.setHours(23, 0, 0, 0);
    const early = new Date(); early.setHours(8, 0, 0, 0);
    return !!ba({ bedtime: '22:00' }, items, late.getTime())
      && ba({}, items, early.getTime()) === null
      && ba({ bedtime: '22:00' }, items, early.getTime()) === null;
  })());

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

  // BACKUP / RESTORE round-trip — the encrypted backup is the ONLY recovery path
  // (no passphrase reset), so it has to be loss-less and reject bad input.
  const pt = window.__pt;
  const sample = [
    { id: 'profile', type: 'profile', name: 'the patient', weight: 68, weightUnit: 'kg', condition: 'Multiple Sclerosis' },
    { id: 'log-2026-07-04', type: 'log', date: '2026-07-04', t0: 1751000000000, planned: 3, taken: { 'vitamin-d3::breakfast': true } },
    { id: 'sym-1', type: 'symptom', date: '2026-07-04', ts: '2026-07-04T09:00:00.000Z', label: 'Fatigue', severity: 4, note: 'mild' },
  ];
  const backup = await pt.encryptBackup('backup-pass-42', sample);
  ok('backup blob is self-describing (app/v/kdf/salt/iv/ciphertext)',
    backup.app === 'protocol-tracker' && backup.v === 1 && backup.kdf && backup.kdf.iters === 200000
    && !!backup.salt && !!backup.iv && !!backup.ciphertext);
  ok('backup leaks no plaintext PHI', !/the patient|Fatigue|Multiple Sclerosis/.test(JSON.stringify(backup)));
  let restored = null;
  try { restored = await pt.decryptBackup('backup-pass-42', backup); } catch (e) { restored = e; }
  ok('restore returns an array', Array.isArray(restored));
  ok('round-trip is loss-less (deep-equal)', JSON.stringify(restored) === JSON.stringify(sample));
  let wrongRejected = false;
  try { await pt.decryptBackup('wrong-pass', backup); } catch { wrongRejected = true; }
  ok('wrong backup passphrase is rejected', wrongRejected);
  let foreignRejected = false;
  try { await pt.decryptBackup('backup-pass-42', { app: 'not-us', v: 1 }); } catch { foreignRejected = true; }
  ok('foreign/corrupt blob is rejected', foreignRejected);
} catch (e) {
  console.log('\n💥 THREW:', (e && e.stack) || e);
  results.push([false, 'no exceptions during flow']);
}

const passed = results.filter((r) => r[0]).length;
console.log(`\n${passed}/${results.length} checks passed`);
process.exit(passed === results.length ? 0 : 1);
