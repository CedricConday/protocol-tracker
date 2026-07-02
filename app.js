'use strict';

/* ---------- IndexedDB (local-first store; nothing leaves the device) ---------- */
const DB_NAME = 'protocol-tracker';
const STORE = 'records';
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function tx(mode, fn) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const store = t.objectStore(STORE);
    const out = fn(store);
    t.oncomplete = () => resolve(out);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}
const db = {
  all: () => tx('readonly', (s) => new Promise((res) => { const r = s.getAll(); r.onsuccess = () => res(r.result || []); })),
  put: (rec) => tx('readwrite', (s) => s.put(rec)),
  del: (id) => tx('readwrite', (s) => s.delete(id)),
  clear: () => tx('readwrite', (s) => s.clear()),
};

/* ---------- Crypto: PBKDF2(SHA-256) -> AES-GCM 256. Backup is encrypted at rest. ---------- */
const enc = new TextEncoder();
const dec = new TextDecoder();
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const KDF_ITERS = 200000;

async function deriveKey(passphrase, salt) {
  const base = await crypto.subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: KDF_ITERS, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
  );
}
async function encryptBackup(passphrase, records) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt);
  const plain = enc.encode(JSON.stringify(records));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain);
  return {
    app: 'protocol-tracker', v: 1, kdf: { name: 'PBKDF2', hash: 'SHA-256', iters: KDF_ITERS },
    salt: b64(salt), iv: b64(iv), ciphertext: b64(ct), createdAt: new Date().toISOString(),
  };
}
async function decryptBackup(passphrase, blob) {
  if (!blob || blob.app !== 'protocol-tracker') throw new Error('Not a Protocol Tracker backup file.');
  const key = await deriveKey(passphrase, unb64(blob.salt));
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(blob.iv) }, key, unb64(blob.ciphertext));
  return JSON.parse(dec.decode(pt));
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

/* ---------- Backup / restore ---------- */
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

/* ---------- Wiring ---------- */
function wire() {
  $('#save-btn').addEventListener('click', saveRecord);
  $('#cancel-btn').addEventListener('click', resetForm);
  $('#export-btn').addEventListener('click', exportBackup);
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
  resetForm();
  render();
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
document.addEventListener('DOMContentLoaded', wire);

// expose for the self-test harness (node/headless)
if (typeof window !== 'undefined') window.__pt = { encryptBackup, decryptBackup };
