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
  all: async () => Promise.all((await rawAll()).map(decRow)),
  put: async (rec) => rawTx(STORE, 'readwrite', (s) => encRecord(rec).then((row) => s.put(row))),
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

/* ---------- UI helpers ---------- */
const $ = (sel) => document.querySelector(sel);
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));
let toastTimer;
function toast(msg, isErr) {
  const el = $('#toast');
  el.textContent = msg;
  el.className = 'toast show' + (isErr ? ' err' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.className = 'toast'), 2600);
}
function fmt(iso) { try { return new Date(iso).toLocaleString(); } catch { return iso; } }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

let editingId = null;

async function render() {
  const list = $('#list');
  const records = (await db.all()).sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  $('#count').textContent = records.length ? `${records.length} record${records.length > 1 ? 's' : ''}` : '';
  if (!records.length) { list.innerHTML = '<div class="empty">No records yet. Add one above — it saves only on this device.</div>'; return; }
  list.innerHTML = records.map((r) => `
    <div class="rec" data-id="${r.id}">
      <div class="top">
        <div>
          <div class="name">${esc(r.patient) || '(no name)'}</div>
          <div class="proto">${esc(r.protocol) || '—'}</div>
        </div>
        <span class="pill ${r.status}">${esc(r.status)}</span>
      </div>
      ${r.notes ? `<div class="notes">${esc(r.notes)}</div>` : ''}
      <div class="meta">updated ${fmt(r.updatedAt)}</div>
      <div class="actions">
        <button class="ghost mini" data-edit="${r.id}">Edit</button>
        <button class="danger" data-del="${r.id}">Delete</button>
      </div>
    </div>`).join('');
}

function readForm() {
  return {
    patient: $('#f-patient').value.trim(),
    protocol: $('#f-protocol').value.trim(),
    status: $('#f-status').value,
    notes: $('#f-notes').value.trim(),
  };
}
function fillForm(r) {
  $('#f-patient').value = r ? r.patient : '';
  $('#f-protocol').value = r ? r.protocol : '';
  $('#f-status').value = r ? r.status : 'active';
  $('#f-notes').value = r ? r.notes : '';
}
function resetForm() { editingId = null; fillForm(null); $('#save-btn').textContent = 'Add record'; $('#cancel-btn').style.display = 'none'; }

async function saveRecord() {
  const data = readForm();
  if (!data.patient && !data.protocol) { toast('Enter a name or a protocol.', true); return; }
  const now = new Date().toISOString();
  let rec;
  if (editingId) {
    const existing = (await db.all()).find((x) => x.id === editingId) || {};
    rec = { ...existing, ...data, id: editingId, updatedAt: now };
  } else {
    rec = { ...data, id: uid(), createdAt: now, updatedAt: now };
  }
  await db.put(rec);
  resetForm();
  await render();
  toast(editingId ? 'Saved.' : 'Added.');
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
    await render();
    toast(`Restored ${records.length} record(s).`);
  } catch (e) {
    toast('Restore failed: wrong passphrase or bad file.', true);
  }
}

/* ---------- Lock screen ---------- */
function showLock(mode) {
  // mode: 'setup' (first run) | 'unlock'
  const setup = mode === 'setup';
  $('#lock').hidden = false;
  $('#app').hidden = true;
  $('#lock-sub').textContent = setup
    ? 'Set a passphrase to protect the records on this device.'
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
function enterApp() {
  $('#lock').hidden = true;
  $('#app').hidden = false;
  render();
}
async function submitLock() {
  const mode = $('#lock').dataset.mode;
  const pass = $('#lock-pass').value;
  const msg = $('#lock-msg');
  if (mode === 'setup') {
    if (pass.length < 6) { msg.textContent = 'Passphrase needs 6+ characters.'; return; }
    if (pass !== $('#lock-pass2').value) { msg.textContent = 'Passphrases do not match.'; return; }
    $('#lock-btn').disabled = true;
    try { await auth.setup(pass); enterApp(); toast('Passphrase set. Records are now encrypted.'); }
    catch (e) { msg.textContent = 'Could not set passphrase.'; }
    finally { $('#lock-btn').disabled = false; }
  } else {
    if (!pass) { msg.textContent = 'Enter your passphrase.'; return; }
    $('#lock-btn').disabled = true;
    try { await auth.unlock(pass); enterApp(); }
    catch (e) { msg.textContent = e.message || 'Wrong passphrase.'; $('#lock-pass').select(); }
    finally { $('#lock-btn').disabled = false; }
  }
}
function lockNow() {
  auth.lock();
  resetForm();
  showLock('unlock');
  toast('Locked.');
}

/* ---------- Wiring ---------- */
function wire() {
  $('#save-btn').addEventListener('click', saveRecord);
  $('#cancel-btn').addEventListener('click', resetForm);
  $('#export-btn').addEventListener('click', exportBackup);
  $('#lock-now').addEventListener('click', lockNow);
  $('#lock-btn').addEventListener('click', submitLock);
  $('#lock-pass').addEventListener('keydown', (e) => { if (e.key === 'Enter' && $('#lock-pass2').hidden) submitLock(); });
  $('#lock-pass2').addEventListener('keydown', (e) => { if (e.key === 'Enter') submitLock(); });
  $('#restore-input').addEventListener('change', (e) => { if (e.target.files[0]) restoreBackup(e.target.files[0]); e.target.value = ''; });
  $('#list').addEventListener('click', async (e) => {
    const del = e.target.getAttribute('data-del');
    const edit = e.target.getAttribute('data-edit');
    if (del) { await db.del(del); if (editingId === del) resetForm(); await render(); toast('Deleted.'); }
    if (edit) {
      const r = (await db.all()).find((x) => x.id === edit);
      if (r) { editingId = edit; fillForm(r); $('#save-btn').textContent = 'Save changes'; $('#cancel-btn').style.display = 'inline-block'; window.scrollTo({ top: 0, behavior: 'smooth' }); }
    }
  });
}

async function boot() {
  wire();
  resetForm();
  showLock((await auth.isConfigured()) ? 'unlock' : 'setup');
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
document.addEventListener('DOMContentLoaded', boot);

// expose for the self-test harness (node/headless)
if (typeof window !== 'undefined') window.__pt = { encryptBackup, decryptBackup, deriveKey, aesEncrypt, aesDecrypt, VERIFY_TOKEN };
