'use strict';
/* Protocol Tracker — minimal Web Push scheduler.
   Zero-PHI: stores only a push subscription + a list of fire-timestamps. No
   supplement names, no doses, no identity. The client computes the day's dose
   times (T0 + offsets) and registers them here on "Start my day"; this service
   fires a GENERIC push at each time ("Time for your next dose"), and the app
   fills in the details on-device. */
const http = require('http');
const fs = require('fs');
const path = require('path');
const webpush = require('web-push');

const PORT = process.env.PORT || 8091;
const ORIGIN = process.env.ALLOW_ORIGIN || 'https://protocoltracker.condaydigital.com';
const DATA = path.join(__dirname, 'schedules.json');
const { VAPID_PUBLIC, VAPID_PRIVATE } = process.env;
if (!VAPID_PUBLIC || !VAPID_PRIVATE) { console.error('FATAL: set VAPID_PUBLIC and VAPID_PRIVATE'); process.exit(1); }
webpush.setVapidDetails('mailto:cedric@condaydigital.com', VAPID_PUBLIC, VAPID_PRIVATE);

let store = {};
try { store = JSON.parse(fs.readFileSync(DATA, 'utf8')); } catch { store = {}; }
let saveTimer = null;
const save = () => { clearTimeout(saveTimer); saveTimer = setTimeout(() => fs.writeFile(DATA, JSON.stringify(store), () => {}), 200); };

const cors = { 'Access-Control-Allow-Origin': ORIGIN, 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };
const send = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json', ...cors }); res.end(JSON.stringify(obj)); };
const readBody = (req) => new Promise((resolve) => { let b = ''; req.on('data', (c) => { b += c; if (b.length > 1e5) req.destroy(); }); req.on('end', () => { try { resolve(JSON.parse(b || '{}')); } catch { resolve({}); } }); });

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204, {});
  const url = (req.url || '').split('?')[0];
  if (url === '/health') return send(res, 200, { ok: true, schedules: Object.keys(store).length });
  if (url === '/vapid') return send(res, 200, { publicKey: VAPID_PUBLIC });
  if (url === '/schedule' && req.method === 'POST') {
    const { subscription, fires } = await readBody(req);
    if (!subscription || !subscription.endpoint || !Array.isArray(fires)) return send(res, 400, { error: 'bad request' });
    store[subscription.endpoint] = { subscription, fires: fires.filter((f) => f && f.at).map((f) => ({ at: +f.at, sent: false })), updated: Date.now() };
    save();
    return send(res, 200, { ok: true, count: store[subscription.endpoint].fires.length });
  }
  if (url === '/cancel' && req.method === 'POST') {
    const { endpoint } = await readBody(req);
    if (endpoint && store[endpoint]) { delete store[endpoint]; save(); }
    return send(res, 200, { ok: true });
  }
  return send(res, 404, { error: 'not found' });
});
server.listen(PORT, '127.0.0.1', () => console.log(`[push] listening on 127.0.0.1:${PORT}`));

// Fire loop: every 30s, send any due-but-unsent pushes (skip >2h stale so a
// downtime doesn't blast old reminders). Prune schedules fully in the past.
const PAYLOAD = JSON.stringify({ title: 'Protocol Tracker', body: 'Time for your next dose 🌿', tag: 'dose', url: './' });
setInterval(async () => {
  const now = Date.now();
  for (const [ep, rec] of Object.entries(store)) {
    let changed = false;
    for (const f of rec.fires) {
      if (!f.sent && f.at <= now && f.at > now - 2 * 3600 * 1000) {
        f.sent = true; changed = true;
        try { await webpush.sendNotification(rec.subscription, PAYLOAD, { urgency: 'high', TTL: 3600 }); }
        catch (e) { if (e.statusCode === 404 || e.statusCode === 410) { delete store[ep]; changed = true; break; } }
      }
    }
    if (store[ep] && rec.fires.length && rec.fires.every((f) => f.at < now - 6 * 3600 * 1000)) { delete store[ep]; changed = true; }
    if (changed) save();
  }
}, 30000);
