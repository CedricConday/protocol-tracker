'use strict';

const APP_VERSION = 'v10'; // bump with each release; shown under ⚙️ Manage to spot stale caches

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
// Relative offsets from T0 (minutes) — the day flows from when the user taps "Start my day".
const DAYPART_OFFSET = { 'on-waking': 0, 'breakfast': 45, 'mid-morning': 150, 'lunch': 300, 'afternoon': 480, 'evening': 720, 'bedtime': 900 };
const fmtTime = (ms) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

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
  return (await db.all()).find((r) => r.type === 'log' && r.date === d) || { id: 'log-' + d, type: 'log', date: d, t0: null, taken: {} };
}
const saveTodayLog = (log) => db.put(log);

/* ---------- Screen router ---------- */
const SCREENS = ['home', 'onboard-profile', 'onboard-supps', 'dashboard', 'history'];
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
  if (doseRaw === '') { toast('Enter a dose.', true); $('#supp-dose').focus(); return; }
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
async function showDashboard() {
  showScreen('dashboard');
  await renderDashboard();
}
async function startMyDay() {
  const log = await getTodayLog();
  log.t0 = Date.now();
  log.planned = orderedItems(await getSupps()).length; // denominator for adherence history
  await saveTodayLog(log);
  await renderDashboard();
  toast('Day started — follow your schedule. 🌿');
}

/* ---------- Symptoms ---------- */
const getSymptoms = async (date) => (await db.all()).filter((r) => r.type === 'symptom' && (!date || r.date === date));
async function saveSymptom() {
  const label = $('#sym-label').value.trim();
  if (!label) { toast('What are you feeling?', true); $('#sym-label').focus(); return; }
  await db.put({ id: uid(), type: 'symptom', date: todayKey(), ts: new Date().toISOString(), label, severity: Number($('#sym-sev').value), note: $('#sym-note').value.trim() });
  closeSymptomEditor();
  await renderDashboard();
  toast('Logged.');
}
function openSymptomEditor() {
  $('#sym-label').value = ''; $('#sym-sev').value = 5; $('#sym-sev-val').textContent = '5'; $('#sym-note').value = '';
  $('#symptom-editor').hidden = false; $('#symptom-add').hidden = true;
  setTimeout(() => $('#sym-label').focus(), 30);
}
function closeSymptomEditor() { $('#symptom-editor').hidden = true; $('#symptom-add').hidden = false; }
function sevClass(s) { return s >= 7 ? 'sev-hi' : s >= 4 ? 'sev-mid' : 'sev-lo'; }
async function renderSymptomsToday() {
  const list = (await getSymptoms(todayKey())).sort((a, b) => (b.ts || '').localeCompare(a.ts || ''));
  $('#symptom-list').innerHTML = list.length
    ? list.map((s) => `<div class="sym-row"><span class="sev-dot ${sevClass(s.severity)}"></span><span class="sym-main"><span class="sym-label">${esc(s.label)}</span> <span class="sym-sev">${s.severity}/10</span>${s.note ? `<span class="sym-note">${esc(s.note)}</span>` : ''}</span><button class="danger" data-symdel="${s.id}">✕</button></div>`).join('')
    : '<div class="empty" style="padding:12px 0">Nothing logged today.</div>';
}

/* ---------- Water ---------- */
const WATER_TARGET = 2500; // ml — protocol minimum 2.5 L/day
const getWater = async (date) => (await db.all()).filter((r) => r.type === 'water' && (!date || r.date === date));
async function addWater(ml) { await db.put({ id: uid(), type: 'water', date: todayKey(), ts: new Date().toISOString(), ml }); await renderWater(); toast(`+${ml} ml 💧`); }
async function undoWater() {
  const list = (await getWater(todayKey())).sort((a, b) => (b.ts || '').localeCompare(a.ts || ''));
  if (!list[0]) { toast('Nothing to undo.', true); return; }
  await db.del(list[0].id); await renderWater(); toast('Undone.');
}
async function renderWater() {
  const total = (await getWater(todayKey())).reduce((s, r) => s + (r.ml || 0), 0);
  $('#water-total').textContent = `${(total / 1000).toFixed(2)} / ${(WATER_TARGET / 1000).toFixed(1)} L`;
  $('#water-fill').style.width = `${Math.min(100, Math.round((total / WATER_TARGET) * 100))}%`;
}

/* ---------- Meals ---------- */
const getMeals = async (date) => (await db.all()).filter((r) => r.type === 'meal' && (!date || r.date === date));
function setMealKind(k) { $$('#meal-kind .chip').forEach((b) => b.classList.toggle('on', b.dataset.kind === k)); }
function selectedMealKind() { const b = $('#meal-kind .chip.on'); return b ? b.dataset.kind : 'Meal'; }
function openMealEditor() { $('#meal-note').value = ''; setMealKind('Breakfast'); $('#meal-editor').hidden = false; $('#meal-add').hidden = true; }
function closeMealEditor() { $('#meal-editor').hidden = true; $('#meal-add').hidden = false; }
async function saveMeal() {
  await db.put({ id: uid(), type: 'meal', date: todayKey(), ts: new Date().toISOString(), kind: selectedMealKind(), note: $('#meal-note').value.trim() });
  closeMealEditor(); await renderMeals(); toast('Logged.');
}
async function renderMeals() {
  const list = (await getMeals(todayKey())).sort((a, b) => (a.ts || '').localeCompare(b.ts || ''));
  $('#meal-list').innerHTML = list.length
    ? list.map((m) => `<div class="sym-row"><span class="meal-kind">${esc(m.kind)}</span><span class="sym-main">${m.note ? esc(m.note) : '<span class="opt">—</span>'}</span><button class="danger" data-mealdel="${m.id}">✕</button></div>`).join('')
    : '<div class="empty" style="padding:12px 0">No meals logged today.</div>';
}

/* ---------- History / calendar ---------- */
let calYear, calMonth; // current month shown in the calendar
async function showHistory() {
  const now = new Date(); calYear = now.getFullYear(); calMonth = now.getMonth();
  $('#hist-day-view').hidden = true; $('#hist-cal-view').hidden = false;
  showScreen('history');
  await renderCalendar();
}
async function dayMap() {
  const rows = await db.all();
  const m = {};
  const g = (d) => (m[d] = m[d] || { date: d, log: null, water: [], meals: [], symptoms: [] });
  rows.forEach((r) => {
    if (r.type === 'log') g(r.date).log = r;
    else if (r.type === 'water') g(r.date).water.push(r);
    else if (r.type === 'meal') g(r.date).meals.push(r);
    else if (r.type === 'symptom') g(r.date).symptoms.push(r);
  });
  return m;
}
const ymd = (y, mo, d) => `${y}-${String(mo + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
async function renderCalendar() {
  const m = await dayMap();
  $('#cal-month').textContent = new Date(calYear, calMonth, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const firstW = (new Date(calYear, calMonth, 1).getDay() + 6) % 7; // Monday-first offset
  const nDays = new Date(calYear, calMonth + 1, 0).getDate();
  const today = todayKey();
  let cells = '';
  for (let i = 0; i < firstW; i++) cells += '<div class="cal-cell empty"></div>';
  for (let d = 1; d <= nDays; d++) {
    const ds = ymd(calYear, calMonth, d);
    const e = m[ds];
    let cls = 'cal-cell', dots = '';
    if (e) {
      const started = !!(e.log && e.log.t0);
      const taken = e.log ? Object.keys(e.log.taken || {}).length : 0;
      const planned = e.log ? (e.log.planned || 0) : 0;
      if (started && planned && taken >= planned) cls += ' d-full';
      else if (taken > 0) cls += ' d-part';
      else if (started) cls += ' d-started';
      if (e.symptoms.length) dots += '<i class="cdot sym"></i>';
      if (e.water.length) dots += '<i class="cdot wat"></i>';
      if (e.meals.length) dots += '<i class="cdot meal"></i>';
    }
    if (ds === today) cls += ' today';
    cells += `<button class="${cls}" data-date="${ds}"><span class="cnum">${d}</span><span class="cdots">${dots}</span></button>`;
  }
  $('#cal-grid').innerHTML = cells;
}
function calShift(delta) {
  calMonth += delta;
  if (calMonth < 0) { calMonth = 11; calYear--; }
  else if (calMonth > 11) { calMonth = 0; calYear++; }
  renderCalendar();
}
async function showDay(ds) {
  const m = await dayMap();
  const e = m[ds] || { log: null, water: [], meals: [], symptoms: [] };
  const t = (ts) => { try { return new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); } catch { return ''; } };
  $('#day-title').textContent = new Date(ds + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const doses = (e.log && e.log.t0)
    ? `<div class="dd-line">${Object.keys(e.log.taken || {}).length} of ${e.log.planned || '·'} taken</div>`
    : '<div class="dd-line muted">Day not started</div>';
  const wtotal = e.water.reduce((s, r) => s + (r.ml || 0), 0);
  const water = `<div class="dd-line">${(wtotal / 1000).toFixed(2)} L${e.water.length ? ` <span class="muted">(${e.water.length} log${e.water.length > 1 ? 's' : ''})</span>` : ''}</div>`;
  const meals = e.meals.length
    ? e.meals.slice().sort((a, b) => (a.ts || '').localeCompare(b.ts || '')).map((mm) => `<div class="dd-item"><span class="dd-when">${t(mm.ts)}</span><span class="dd-body"><b>${esc(mm.kind)}</b>${mm.note ? ` — ${esc(mm.note)}` : ''}</span></div>`).join('')
    : '<div class="dd-line muted">None logged</div>';
  const syms = e.symptoms.length
    ? e.symptoms.slice().sort((a, b) => (a.ts || '').localeCompare(b.ts || '')).map((s) => `<div class="dd-item"><span class="dd-when">${t(s.ts)}</span><span class="dd-body"><span class="sev-dot ${sevClass(s.severity)}"></span><b>${esc(s.label)}</b> ${s.severity}/10${s.note ? ` — ${esc(s.note)}` : ''}</span></div>`).join('')
    : '<div class="dd-line muted">None logged</div>';
  $('#day-detail').innerHTML =
    `<div class="dd-sec"><div class="dd-h">💊 Doses</div>${doses}</div>` +
    `<div class="dd-sec"><div class="dd-h">💧 Water</div>${water}</div>` +
    `<div class="dd-sec"><div class="dd-h">🍽️ Meals</div>${meals}</div>` +
    `<div class="dd-sec"><div class="dd-h">🩹 Symptoms</div>${syms}</div>`;
  $('#hist-cal-view').hidden = true; $('#hist-day-view').hidden = false;
}
function orderedItems(supps) {
  const items = [];
  supps.forEach((s) => (s.dayParts || []).forEach((dp) => items.push({ s, dp, key: `${s.id}::${dp}`, off: DAYPART_OFFSET[dp] ?? 999 })));
  items.sort((a, b) => a.off - b.off || (a.s.name || '').localeCompare(b.s.name || ''));
  return items;
}
function groupByDayPart(items) {
  const groups = [];
  items.forEach((it) => { let g = groups.find((x) => x.dp === it.dp); if (!g) { g = { dp: it.dp, at: it.at, items: [] }; groups.push(g); } g.items.push(it); });
  return groups;
}
function doseHtml(it, taken, isDue) {
  const t = timingFor(it.s.timingKey);
  const dose = [it.s.dose, it.s.unit].filter((x) => x != null && x !== '').join(' ');
  const tags = [];
  if (t.withFood === true) tags.push('🍽️ with food');
  if (t.withFood === false) tags.push('⛔ away from food');
  if (t.water) tags.push('💧 ' + esc(t.water));
  const isTaken = !!taken[it.key];
  const due = isDue && !isTaken;
  return `<label class="dose${isTaken ? ' taken' : ''}${due ? ' due' : ''}" data-key="${esc(it.key)}">
    <input type="checkbox" class="take"${isTaken ? ' checked' : ''} />
    <span class="dose-body">
      <span class="dose-name">${esc(it.s.name)}${it.s.form ? ` <span class="supp-form">${esc(it.s.form)}</span>` : ''}${dose ? ` — ${esc(dose)}` : ''}${due ? ' <span class="nowtag">now</span>' : ''}</span>
      ${tags.length ? `<span class="dose-tags">${tags.map((x) => `<span class="tchip">${x}</span>`).join('')}</span>` : ''}
    </span>
  </label>`;
}
function renderSafety() {
  const sev = { critical: '🔴', high: '🟠', medium: '🟡' };
  $('#safety-list').innerHTML = (TIMING.protocolRules || [])
    .map((r) => `<div class="safety-row"><span>${sev[r.severity] || '•'}</span><span>${esc(r.text)}</span></div>`).join('');
  const disc = (CATALOG.meta && CATALOG.meta.disclaimer) || '';
  const attr = (CATALOG.meta && CATALOG.meta.attribution) || '';
  $('#disclaimer').innerHTML = `${esc(disc)}<br><span class="attr">${esc(attr)}</span>`;
}
async function renderDashboard() {
  const p = await getProfile();
  $('#dash-greet').textContent = p && p.name ? `${greeting()}, ${p.name}` : greeting();
  $('#dash-date').textContent = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });

  const supps = await getSupps();
  const log = await getTodayLog();
  const taken = log.taken || {};
  const items = orderedItems(supps);
  const startBox = $('#day-start'), planEl = $('#day-plan'), progWrap = $('#progress-wrap'), resetBtn = $('#dash-reset');

  renderSafety();
  closeSymptomEditor();
  closeMealEditor();
  await renderSymptomsToday();
  await renderWater();
  await renderMeals();

  if (!items.length) {
    startBox.hidden = true; progWrap.hidden = true; resetBtn.hidden = true;
    $('#plan-title').textContent = 'Your day';
    planEl.innerHTML = '<div class="empty">No supplements yet. Add some under ⚙️ Manage below.</div>';
    return;
  }

  if (!log.t0) {
    // Pre-start: the day begins when they tap the button (T0). Everything flows from there.
    $('#plan-title').textContent = 'Ready when you are';
    startBox.hidden = false; progWrap.hidden = true; resetBtn.hidden = true;
    planEl.innerHTML = '';
    const n = items.length;
    $('#day-start-sub').textContent = `${n} dose${n > 1 ? 's' : ''} across your day. Tap to begin — your schedule flows from now.`;
    $('#day-preview').innerHTML = groupByDayPart(items).map((g) =>
      `<div class="preview-slot"><div class="ps-head">${esc(dayPartLabel(g.dp))}</div>${g.items.map((it) =>
        `<div class="preview-item">${esc(it.s.name)}${it.s.dose != null && it.s.dose !== '' ? ` · ${esc([it.s.dose, it.s.unit].filter((x) => x != null && x !== '').join(' '))}` : ''}</div>`).join('')}</div>`).join('');
    return;
  }

  // Started: live schedule anchored to T0 (each dose target = T0 + its day-part offset).
  $('#plan-title').textContent = 'Your day';
  startBox.hidden = true; progWrap.hidden = false; resetBtn.hidden = false;

  const total = items.length;
  const done = items.filter((it) => taken[it.key]).length;
  $('#dash-progress').textContent = `${done}/${total} taken`;
  $('#progress-fill').style.width = `${Math.round((done / total) * 100)}%`;

  const now = Date.now();
  const timed = items.map((it) => ({ ...it, at: log.t0 + it.off * 60000 }));
  const due = timed.filter((it) => !taken[it.key] && it.at <= now + 15 * 60000);
  const dueKey = due.length ? due[due.length - 1].key : null;

  const banner = (done === total) ? '<div class="alldone">✅ All done for today — beautifully done. 💛</div>' : '';
  planEl.innerHTML = banner + groupByDayPart(timed).map((g) => `
    <div class="slot">
      <div class="slot-head">${esc(dayPartLabel(g.dp))} <span class="slot-time">${fmtTime(g.at)}</span></div>
      ${g.items.map((it) => doseHtml(it, taken, it.key === dueKey)).join('')}
    </div>`).join('');
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
  $('#day-start-btn').addEventListener('click', startMyDay);
  $('#dash-reset').addEventListener('click', async () => {
    const log = await getTodayLog(); log.taken = {}; log.t0 = null; await saveTodayLog(log); await renderDashboard(); toast('Fresh day.');
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
  // history + symptoms
  $('#dash-history').addEventListener('click', showHistory);
  $('#hist-back').addEventListener('click', showDashboard);
  $('#cal-prev').addEventListener('click', () => calShift(-1));
  $('#cal-next').addEventListener('click', () => calShift(1));
  $('#cal-grid').addEventListener('click', (e) => { const b = e.target.closest('.cal-cell'); if (b && b.dataset.date) showDay(b.dataset.date); });
  $('#day-back').addEventListener('click', () => { $('#hist-day-view').hidden = true; $('#hist-cal-view').hidden = false; });
  $('#symptom-add').addEventListener('click', openSymptomEditor);
  $('#sym-cancel').addEventListener('click', closeSymptomEditor);
  $('#sym-save').addEventListener('click', saveSymptom);
  $('#sym-sev').addEventListener('input', (e) => { $('#sym-sev-val').textContent = e.target.value; });
  $('#symptom-list').addEventListener('click', async (e) => { const id = e.target.getAttribute('data-symdel'); if (id) { await db.del(id); await renderSymptomsToday(); toast('Removed.'); } });
  // water
  $('#water-250').addEventListener('click', () => addWater(250));
  $('#water-500').addEventListener('click', () => addWater(500));
  $('#water-undo').addEventListener('click', undoWater);
  // meals
  $('#meal-add').addEventListener('click', openMealEditor);
  $('#meal-cancel').addEventListener('click', closeMealEditor);
  $('#meal-save').addEventListener('click', saveMeal);
  $('#meal-kind').addEventListener('click', (e) => { const b = e.target.closest('.chip'); if (b) setMealKind(b.dataset.kind); });
  $('#meal-list').addEventListener('click', async (e) => { const id = e.target.getAttribute('data-mealdel'); if (id) { await db.del(id); await renderMeals(); toast('Removed.'); } });
  $('#go-edit-supps').addEventListener('click', showSuppsScreen);
  $('#go-edit-profile').addEventListener('click', showProfileScreen);
  $('#export-btn').addEventListener('click', exportBackup);
  $('#restore-input').addEventListener('change', (e) => { if (e.target.files[0]) restoreBackup(e.target.files[0]); e.target.value = ''; });
}

let booted = false;
async function boot() {
  if (booted) return; // guard against a double DOMContentLoaded double-wiring listeners
  booted = true;
  wire();
  const av = $('#app-version'); if (av) av.textContent = APP_VERSION;
  await loadContent();
  showScreen('home');
}

if ('serviceWorker' in navigator) {
  // When a new SW takes control (new deploy), reload once so the fresh app applies.
  let swReloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (swReloaded) return; swReloaded = true; window.location.reload();
  });
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
document.addEventListener('DOMContentLoaded', boot);

// expose for the self-test harness (node/headless)
if (typeof window !== 'undefined') window.__pt = { encryptBackup, decryptBackup, deriveKey, aesEncrypt, aesDecrypt, VERIFY_TOKEN };
