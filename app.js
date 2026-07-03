'use strict';

/* ---------- IndexedDB (local-first store; nothing leaves the device) ---------- */
const DB_NAME = 'protocol-tracker';
const STORE = 'records';
const META = 'meta';
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 2);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META, { keyPath: 'k' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
function rawTx(storeName, mode, fn) {
  return openDB().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction(storeName, mode);
    const out = fn(t.objectStore(storeName));
    t.oncomplete = () => resolve(out);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}
const rawAll = () => rawTx(STORE, 'readonly', (s) => new Promise((res) => { const r = s.getAll(); r.onsuccess = () => res(r.result || []); }));
const metaGet = (k) => rawTx(META, 'readonly', (s) => new Promise((res) => { const r = s.get(k); r.onsuccess = () => res(r.result || null); }));
const metaPut = (obj) => rawTx(META, 'readwrite', (s) => s.put(obj));

/* ---------- Crypto: PBKDF2(SHA-256) -> AES-GCM 256 ---------- */
const enc = new TextEncoder();
const dec = new TextDecoder();
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const rand = (n) => crypto.getRandomValues(new Uint8Array(n));
const KDF_ITERS = 200000;

async function deriveKey(passphrase, salt) {
  const base = await crypto.subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: KDF_ITERS, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
  );
}
async function aesEncrypt(key, obj) {
  const iv = rand(12);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(obj)));
  return { iv: b64(iv), ct: b64(ct) };
}
async function aesDecrypt(key, iv, ct) {
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, key, unb64(ct));
  return JSON.parse(dec.decode(pt));
}

/* ---------- Auth / lock (master passphrase encrypts every record at rest) ----------
   Zero-knowledge: we store a salt + a verifier (a known token encrypted with the
   derived key), never the passphrase. Correct passphrase -> verifier decrypts.
   The key lives only in memory for this session: unlock once, stays unlocked until
   the app is closed/killed (or the Lock button), then it's gone. No recovery. */
const AUTH_KEY = 'auth';
const VERIFY_TOKEN = 'protocol-tracker-verify-v1';
let sessionKey = null; // CryptoKey held for the life of this JS context; null = locked

const auth = {
  isConfigured: async () => !!(await metaGet(AUTH_KEY)),
  async setup(passphrase) {
    const salt = rand(16);
    const key = await deriveKey(passphrase, salt);
    const verifier = await aesEncrypt(key, VERIFY_TOKEN);
    await metaPut({ k: AUTH_KEY, v: 1, salt: b64(salt), iters: KDF_ITERS, verifier });
    sessionKey = key;
    await migrateEncryptExisting(); // encrypt any pre-existing plaintext records
  },
  async unlock(passphrase) {
    const meta = await metaGet(AUTH_KEY);
    if (!meta) throw new Error('No passphrase set.');
    const key = await deriveKey(passphrase, unb64(meta.salt));
    try {
      const token = await aesDecrypt(key, meta.verifier.iv, meta.verifier.ct);
      if (token !== VERIFY_TOKEN) throw new Error('bad');
    } catch { throw new Error('Wrong passphrase.'); }
    sessionKey = key;
  },
  lock() { sessionKey = null; },
  get unlocked() { return !!sessionKey; },
};

/* ---------- Record store (encrypted at rest; transparently to callers) ----------
   On disk a record is { id, enc: 1, iv, ct }; id stays plaintext (random uuid,
   not PHI) so we can put/delete by key. All PHI fields live inside the ciphertext. */
async function encRecord(rec) {
  const { iv, ct } = await aesEncrypt(sessionKey, rec);
  return { id: rec.id, enc: 1, iv, ct };
}
async function decRow(row) {
  if (!row || !row.enc) return row; // defensive: legacy plaintext passes through
  return aesDecrypt(sessionKey, row.iv, row.ct);
}
async function migrateEncryptExisting() {
  const rows = await rawAll();
  for (const row of rows) if (!row.enc) await db.put(row); // db.put re-writes encrypted
}
const db = {
  // Locked → no key → no accessible data. Re-check AFTER the async read too: the Lock
  // button can null the key mid-read, and decRow reads the (now null) key synchronously.
  all: async () => {
    if (!sessionKey) return [];
    const rows = await rawAll();
    if (!sessionKey) return [];
    return Promise.all(rows.map(decRow));
  },
  // Encrypt BEFORE opening the tx — awaiting crypto inside a live IDB tx
  // deactivates it (auto-commit), throwing TransactionInactiveError.
  put: async (rec) => { const row = await encRecord(rec); return rawTx(STORE, 'readwrite', (s) => s.put(row)); },
  del: (id) => rawTx(STORE, 'readwrite', (s) => s.delete(id)),
  clear: () => rawTx(STORE, 'readwrite', (s) => s.clear()),
};

/* ---------- Portable encrypted backup (own passphrase; works across devices) ---------- */
async function encryptBackup(passphrase, records) {
  const salt = rand(16);
  const key = await deriveKey(passphrase, salt);
  const { iv, ct } = await aesEncrypt(key, records);
  return {
    app: 'protocol-tracker', v: 1, kdf: { name: 'PBKDF2', hash: 'SHA-256', iters: KDF_ITERS },
    salt: b64(salt), iv, ciphertext: ct, createdAt: new Date().toISOString(),
  };
}
async function decryptBackup(passphrase, blob) {
  if (!blob || blob.app !== 'protocol-tracker') throw new Error('Not a Protocol Tracker backup file.');
  const key = await deriveKey(passphrase, unb64(blob.salt));
  return aesDecrypt(key, blob.iv, blob.ciphertext);
}

/* ================================================================================
   Coimbra Protocol content (supplement catalog + intake timing) — loaded at boot.
   Data derived from the CP community docs the patient shared; reference only, not
   medical advice. Users enter their own regimen.
   ================================================================================ */
let CATALOG = { supplements: [] };
let TIMING = { dayParts: [], timing: {}, referenceSchedule: { slots: [] }, protocolRules: [] };
async function loadContent() {
  try { CATALOG = await fetch('./content/coimbra/catalog.json', { cache: 'no-cache' }).then((r) => r.json()); } catch (e) {}
  try { TIMING = await fetch('./content/coimbra/timing.json', { cache: 'no-cache' }).then((r) => r.json()); } catch (e) {}
}
const catalogById = (id) => (CATALOG.supplements || []).find((s) => s.id === id) || null;
const dayParts = () => (TIMING.dayParts || []);
const dayPartIndex = (key) => { const i = dayParts().findIndex((d) => d.key === key); return i < 0 ? 99 : i; };
const dayPartLabel = (key) => (dayParts().find((d) => d.key === key) || {}).label || key;
const timingFor = (timingKey) => (TIMING.timing || {})[timingKey] || {};

/* ---------- UI helpers ---------- */
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));
let toastTimer;
function toast(msg, isErr) {
  const el = $('#toast');
  el.textContent = msg;
  el.className = 'toast show' + (isErr ? ' err' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.className = 'toast'), 2600);
}
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
const todayKey = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

/* ---------- Data-model accessors (all encrypted records live in STORE) ---------- */
async function getProfile() { return (await db.all()).find((r) => r.type === 'profile') || null; }
async function getSupps() { return (await db.all()).filter((r) => r.type === 'supp'); }
async function getTodayLog() {
  const d = todayKey();
  return (await db.all()).find((r) => r.type === 'log' && r.date === d) || { id: 'log-' + d, type: 'log', date: d, taken: {} };
}
const saveTodayLog = (log) => db.put(log);

/* ---------- Screen router ---------- */
const SCREENS = ['home', 'onboard-profile', 'onboard-supps', 'dashboard'];
function showScreen(name) {
  SCREENS.forEach((s) => { const el = document.getElementById(s); if (el) el.hidden = (s !== name); });
  $('#lock').hidden = true;
  window.scrollTo(0, 0);
}
async function routeAfterUnlock() {
  if (!(await getProfile())) return showProfileScreen();
  if (!(await getSupps()).length) return showSuppsScreen();
  return showDashboard();
}

/* ================================ ONBOARDING 1: PROFILE ================================ */
async function showProfileScreen() {
  const p = await getProfile();
  $('#p-name').value = p ? (p.name || '') : '';
  $('#p-weight').value = p && p.weight != null ? p.weight : '';
  $('#p-weight-unit').value = p ? (p.weightUnit || 'kg') : 'kg';
  const known = Array.from($('#p-condition').options).map((o) => o.value);
  if (p && p.condition && !known.includes(p.condition)) {
    $('#p-condition').value = '__custom';
    $('#p-condition-custom').hidden = false;
    $('#p-condition-custom').value = p.condition;
  } else {
    $('#p-condition').value = p ? (p.condition || 'Multiple Sclerosis') : 'Multiple Sclerosis';
    $('#p-condition-custom').hidden = $('#p-condition').value !== '__custom';
  }
  showScreen('onboard-profile');
}
async function saveProfile() {
  const name = $('#p-name').value.trim();
  if (!name) { toast('What should we call you?', true); $('#p-name').focus(); return false; }
  let condition = $('#p-condition').value;
  if (condition === '__custom') condition = $('#p-condition-custom').value.trim() || 'Other';
  const weightRaw = $('#p-weight').value.trim();
  const existing = await getProfile();
  const rec = {
    ...(existing || {}), id: existing ? existing.id : 'profile', type: 'profile',
    name, condition,
    weight: weightRaw === '' ? null : Number(weightRaw),
    weightUnit: $('#p-weight-unit').value,
    updatedAt: new Date().toISOString(),
  };
  await db.put(rec);
  return true;
}

/* ================================ ONBOARDING 2: SUPPLEMENTS ================================ */
let suppEditingId = null;

function populateCatalogPicker() {
  const sel = $('#supp-pick');
  sel.innerHTML = (CATALOG.supplements || [])
    .map((s) => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('') +
    `<option value="__custom">Other (not listed)…</option>`;
}
const GENERIC_FORMS = ['Capsule', 'Tablet', 'Softgel', 'Drops', 'Liquid', 'Powder', 'Spray', 'Other'];
function onPickChange() {
  const id = $('#supp-pick').value;
  const s = catalogById(id);
  const formSel = $('#supp-form');
  const doseList = $('#supp-dose-list');
  const custom = (id === '__custom' || !s);
  $('#supp-custom-name').hidden = !custom;
  if (custom) {
    $('#supp-role').textContent = 'Your own — set a form, dose and when you take it.';
    formSel.innerHTML = GENERIC_FORMS.map((f) => `<option value="${f}">${f}</option>`).join('');
    $('#supp-unit').textContent = '';
    $('#supp-doseunit').value = '';
    doseList.innerHTML = '';
    setDaypartChips([]);
    $('#supp-hint').innerHTML = '';
    return;
  }
  $('#supp-role').textContent = s.role || '';
  formSel.innerHTML = (s.forms || []).map((f) => `<option value="${esc(f)}">${esc(f)}</option>`).join('');
  $('#supp-unit').textContent = s.unit ? `(${s.unit})` : '';
  $('#supp-doseunit').value = s.unit || '';
  doseList.innerHTML = (s.commonDoses || []).map((d) => `<option value="${d}">`).join('');
  const t = timingFor(s.timingKey);
  setDaypartChips(t.defaultDayParts || []);
  renderTimingHint(s);
}
function renderTimingHint(s) {
  const t = timingFor(s.timingKey);
  if (!t || (!t.notes && t.withFood == null)) { $('#supp-hint').innerHTML = ''; return; }
  const bits = [];
  if (t.withFood === true) bits.push('🍽️ with food');
  if (t.withFood === false) bits.push('⛔🍽️ away from food' + (t.spacing ? ` (${esc(t.spacing)})` : ''));
  if (t.water) bits.push('💧 ' + esc(t.water));
  const chips = bits.map((b) => `<span class="tchip">${b}</span>`).join('');
  $('#supp-hint').innerHTML = `${chips}${t.notes ? `<p class="hint">${esc(t.notes)}</p>` : ''}`;
}
function setDaypartChips(active) {
  const wrap = $('#supp-dayparts');
  const set = new Set(active || []);
  wrap.innerHTML = dayParts().map((d) =>
    `<button type="button" class="chip${set.has(d.key) ? ' on' : ''}" data-dp="${esc(d.key)}">${esc(d.label)}</button>`).join('');
  wrap.querySelectorAll('.chip').forEach((b) => b.addEventListener('click', () => b.classList.toggle('on')));
}
function selectedDayparts() { return $$('#supp-dayparts .chip.on').map((b) => b.dataset.dp); }

function openSuppEditor(rec) {
  suppEditingId = rec ? rec.id : null;
  $('#supp-editor-title').textContent = rec ? 'Edit supplement' : 'Add a supplement';
  $('#supp-save').textContent = rec ? 'Save' : 'Add to my list';
  populateCatalogPicker();
  if (rec) {
    const isCat = !!catalogById(rec.suppId);
    $('#supp-pick').value = isCat ? rec.suppId : '__custom';
    onPickChange();
    if (!isCat) $('#supp-custom-name').value = rec.name || '';
    if (rec.form) $('#supp-form').value = rec.form;
    $('#supp-dose').value = rec.dose != null ? rec.dose : '';
    $('#supp-doseunit').value = rec.unit || '';
    setDaypartChips(rec.dayParts || []);
    const s = catalogById(rec.suppId); if (s) renderTimingHint(s);
  } else {
    $('#supp-pick').selectedIndex = 0;
    onPickChange();
    $('#supp-dose').value = '';
  }
  $('#supp-editor').hidden = false;
  $('#supp-add-toggle').hidden = true;
  $('#supp-editor').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
function closeSuppEditor() {
  $('#supp-editor').hidden = true;
  $('#supp-add-toggle').hidden = false;
  suppEditingId = null;
}
async function saveSupp() {
  const pickId = $('#supp-pick').value;
  const cat = catalogById(pickId);
  let name;
  if (cat) { name = cat.name; }
  else { name = $('#supp-custom-name').value.trim(); if (!name) { toast('Give your supplement a name.', true); $('#supp-custom-name').focus(); return; } }
  const form = $('#supp-form').value || '';
  const doseRaw = $('#supp-dose').value.trim();
  const dayPartsSel = selectedDayparts();
  if (!dayPartsSel.length) { toast('When do you take it? Tap at least one time.', true); return; }
  const existing = suppEditingId ? (await getSupps()).find((r) => r.id === suppEditingId) : null;
  const rec = {
    ...(existing || {}),
    id: existing ? existing.id : uid(), type: 'supp',
    suppId: cat ? cat.id : '__custom',
    name: cat ? cat.name : name,
    form,
    dose: doseRaw === '' ? null : Number(doseRaw),
    unit: $('#supp-doseunit').value.trim(),
    dayParts: dayPartsSel,
    timingKey: cat ? cat.timingKey : 'with-food',
    updatedAt: new Date().toISOString(),
  };
  await db.put(rec);
  closeSuppEditor();
  await renderSuppList();
  toast(existing ? 'Updated.' : `${rec.name} added.`);
}
async function renderSuppList() {
  const supps = (await getSupps()).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  const list = $('#supp-list');
  if (!supps.length) {
    list.innerHTML = '<div class="empty">No supplements yet. Add the ones you take.</div>';
  } else {
    list.innerHTML = supps.map((r) => {
      const when = (r.dayParts || []).map(dayPartLabel).join(' · ');
      const dose = [r.dose, r.unit].filter((x) => x != null && x !== '').join(' ');
      return `<div class="supp-row" data-id="${r.id}">
        <div class="supp-main">
          <div class="supp-name">${esc(r.name)}${r.form ? ` <span class="supp-form">${esc(r.form)}</span>` : ''}</div>
          <div class="supp-sub">${dose ? esc(dose) + ' · ' : ''}${esc(when)}</div>
        </div>
        <div class="supp-acts">
          <button class="ghost mini" data-edit="${r.id}">Edit</button>
          <button class="danger" data-del="${r.id}">✕</button>
        </div>
      </div>`;
    }).join('');
  }
  $('#supps-done').disabled = supps.length === 0;
}
async function showSuppsScreen() {
  showScreen('onboard-supps');
  closeSuppEditor();
  await renderSuppList();
}

/* ================================ DASHBOARD ================================ */
function greeting() {
  const h = new Date().getHours();
  if (h < 5) return 'Good night';
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}
function currentDayPartKey() {
  const h = new Date().getHours();
  const bands = [['on-waking', 5], ['breakfast', 8], ['mid-morning', 10], ['lunch', 12], ['afternoon', 14], ['evening', 18], ['bedtime', 21]];
  let key = 'bedtime';
  if (h >= 5) for (const [k, start] of bands) if (h >= start) key = k;
  return dayParts().some((d) => d.key === key) ? key : null;
}
async function showDashboard() {
  showScreen('dashboard');
  await renderDashboard();
}
async function renderDashboard() {
  const p = await getProfile();
  $('#dash-greet').textContent = p && p.name ? `${greeting()}, ${p.name}` : greeting();
  $('#dash-date').textContent = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });

  const supps = await getSupps();
  const log = await getTodayLog();
  const taken = log.taken || {};

  // Build (supp, dayPart) items, grouped by dayPart in chronological order.
  const items = [];
  supps.forEach((s) => (s.dayParts || []).forEach((dp) => items.push({ s, dp, key: `${s.id}::${dp}` })));
  items.sort((a, b) => dayPartIndex(a.dp) - dayPartIndex(b.dp) || a.s.name.localeCompare(b.s.name));

  const total = items.length;
  const done = items.filter((it) => taken[it.key]).length;
  $('#dash-progress').textContent = total ? `${done}/${total} taken` : 'no supplements yet';
  $('#progress-fill').style.width = total ? `${Math.round((done / total) * 100)}%` : '0%';

  // group
  const groups = [];
  items.forEach((it) => {
    let g = groups.find((x) => x.dp === it.dp);
    if (!g) { g = { dp: it.dp, items: [] }; groups.push(g); }
    g.items.push(it);
  });

  const plan = $('#day-plan');
  const cur = currentDayPartKey();
  const banner = (total && done === total) ? '<div class="alldone">✅ All done for today — beautifully done. 💛</div>' : '';
  if (!total) {
    plan.innerHTML = '<div class="empty">No supplements yet. Add some under ⚙️ Manage.</div>';
  } else {
    plan.innerHTML = banner + groups.map((g) => `
      <div class="slot${g.dp === cur ? ' now' : ''}">
        <div class="slot-head">${esc(dayPartLabel(g.dp))}${g.dp === cur ? ' <span class="nowtag">now</span>' : ''}</div>
        ${g.items.map((it) => {
          const t = timingFor(it.s.timingKey);
          const dose = [it.s.dose, it.s.unit].filter((x) => x != null && x !== '').join(' ');
          const tags = [];
          if (t.withFood === true) tags.push('🍽️ with food');
          if (t.withFood === false) tags.push('⛔ away from food');
          if (t.water) tags.push('💧 ' + esc(t.water));
          const checked = taken[it.key] ? ' checked' : '';
          return `<label class="dose${checked ? ' taken' : ''}" data-key="${esc(it.key)}">
            <input type="checkbox" class="take"${checked} />
            <span class="dose-body">
              <span class="dose-name">${esc(it.s.name)}${it.s.form ? ` <span class="supp-form">${esc(it.s.form)}</span>` : ''}${dose ? ` — ${esc(dose)}` : ''}</span>
              ${tags.length ? `<span class="dose-tags">${tags.map((x) => `<span class="tchip">${x}</span>`).join('')}</span>` : ''}
            </span>
          </label>`;
        }).join('')}
      </div>`).join('');
  }

  // safety reminders
  const sev = { critical: '🔴', high: '🟠', medium: '🟡' };
  $('#safety-list').innerHTML = (TIMING.protocolRules || [])
    .map((r) => `<div class="safety-row"><span>${sev[r.severity] || '•'}</span><span>${esc(r.text)}</span></div>`).join('');

  const disc = (CATALOG.meta && CATALOG.meta.disclaimer) || '';
  const attr = (CATALOG.meta && CATALOG.meta.attribution) || '';
  $('#disclaimer').innerHTML = `${esc(disc)}<br><span class="attr">${esc(attr)}</span>`;
}

/* ---------- Backup / restore (UI) ---------- */
async function exportBackup() {
  const pass = $('#f-pass').value;
  if (pass.length < 6) { toast('Passphrase needs 6+ characters.', true); return; }
  const records = await db.all();
  if (!records.length) { toast('Nothing to back up yet.', true); return; }
  const blob = await encryptBackup(pass, records);
  const file = new Blob([JSON.stringify(blob, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  a.href = url; a.download = `protocol-tracker-backup-${stamp}.ptbackup`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast(`Encrypted backup of ${records.length} record(s) downloaded.`);
}
async function restoreBackup(file) {
  const pass = $('#f-pass').value;
  if (!pass) { toast('Enter the passphrase used for the backup.', true); return; }
  try {
    const text = await file.text();
    const blob = JSON.parse(text);
    const records = await decryptBackup(pass, blob);
    if (!Array.isArray(records)) throw new Error('Corrupt backup contents.');
    await db.clear();
    for (const r of records) await db.put(r);
    toast(`Restored ${records.length} record(s).`);
    await routeAfterUnlock();
  } catch (e) {
    toast('Restore failed: wrong passphrase or bad file.', true);
  }
}

/* ---------- Lock screen ---------- */
function showLock(mode) {
  // mode: 'setup' (first run) | 'unlock'
  const setup = mode === 'setup';
  SCREENS.forEach((s) => { const el = document.getElementById(s); if (el) el.hidden = true; });
  $('#lock').hidden = false;
  $('#lock-sub').textContent = setup
    ? 'Create a passphrase to protect your data on this device.'
    : 'Enter your passphrase to unlock.';
  $('#lock-pass2').hidden = !setup;
  $('#lock-note').hidden = !setup;
  $('#lock-btn').textContent = setup ? 'Create passphrase' : 'Unlock';
  $('#lock-msg').textContent = '';
  $('#lock-pass').value = '';
  $('#lock-pass2').value = '';
  $('#lock').dataset.mode = mode;
  setTimeout(() => $('#lock-pass').focus(), 50);
}
async function submitLock() {
  const mode = $('#lock').dataset.mode;
  const pass = $('#lock-pass').value;
  const msg = $('#lock-msg');
  if (mode === 'setup') {
    if (pass.length < 6) { msg.textContent = 'Passphrase needs 6+ characters.'; return; }
    if (pass !== $('#lock-pass2').value) { msg.textContent = 'Passphrases do not match.'; return; }
    $('#lock-btn').disabled = true;
    try { await auth.setup(pass); toast('Passphrase set. Your data is encrypted.'); await routeAfterUnlock(); }
    catch (e) { msg.textContent = 'Could not set passphrase.'; }
    finally { $('#lock-btn').disabled = false; }
  } else {
    if (!pass) { msg.textContent = 'Enter your passphrase.'; return; }
    $('#lock-btn').disabled = true;
    try { await auth.unlock(pass); await routeAfterUnlock(); }
    catch (e) { msg.textContent = e.message || 'Wrong passphrase.'; $('#lock-pass').select(); }
    finally { $('#lock-btn').disabled = false; }
  }
}
async function goLogin() {
  showLock((await auth.isConfigured()) ? 'unlock' : 'setup');
}
function lockNow() {
  auth.lock();
  suppEditingId = null;
  showScreen('home');
  toast('Locked.');
}

/* ---------- Wiring ---------- */
function wire() {
  // home
  $('#home-login').addEventListener('click', goLogin);
  // lock
  $('#lock-btn').addEventListener('click', submitLock);
  $('#lock-back').addEventListener('click', () => showScreen('home'));
  $('#lock-pass').addEventListener('keydown', (e) => { if (e.key === 'Enter' && $('#lock-pass2').hidden) submitLock(); });
  $('#lock-pass2').addEventListener('keydown', (e) => { if (e.key === 'Enter') submitLock(); });
  // profile
  $('#p-condition').addEventListener('change', (e) => { $('#p-condition-custom').hidden = e.target.value !== '__custom'; });
  $('#p-continue').addEventListener('click', async () => { if (await saveProfile()) await showSuppsScreen(); });
  // supplements
  $('#supp-add-toggle').addEventListener('click', () => openSuppEditor(null));
  $('#supp-cancel').addEventListener('click', closeSuppEditor);
  $('#supp-save').addEventListener('click', saveSupp);
  $('#supp-pick').addEventListener('change', onPickChange);
  $('#supp-list').addEventListener('click', async (e) => {
    const del = e.target.getAttribute('data-del');
    const edit = e.target.getAttribute('data-edit');
    if (del) { await db.del(del); await renderSuppList(); toast('Removed.'); }
    if (edit) { const r = (await getSupps()).find((x) => x.id === edit); if (r) openSuppEditor(r); }
  });
  $('#supps-done').addEventListener('click', showDashboard);
  // dashboard
  $('#dash-lock').addEventListener('click', lockNow);
  $('#dash-reset').addEventListener('click', async () => {
    const log = await getTodayLog(); log.taken = {}; await saveTodayLog(log); await renderDashboard(); toast('Fresh day.');
  });
  $('#day-plan').addEventListener('change', async (e) => {
    const label = e.target.closest('.dose'); if (!label) return;
    const key = label.dataset.key;
    const log = await getTodayLog();
    log.taken = log.taken || {};
    if (e.target.checked) log.taken[key] = true; else delete log.taken[key];
    await saveTodayLog(log);
    await renderDashboard();
  });
  $('#go-edit-supps').addEventListener('click', showSuppsScreen);
  $('#go-edit-profile').addEventListener('click', showProfileScreen);
  $('#export-btn').addEventListener('click', exportBackup);
  $('#restore-input').addEventListener('change', (e) => { if (e.target.files[0]) restoreBackup(e.target.files[0]); e.target.value = ''; });
}

async function boot() {
  wire();
  await loadContent();
  showScreen('home');
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
document.addEventListener('DOMContentLoaded', boot);

// expose for the self-test harness (node/headless)
if (typeof window !== 'undefined') window.__pt = { encryptBackup, decryptBackup, deriveKey, aesEncrypt, aesDecrypt, VERIFY_TOKEN };
