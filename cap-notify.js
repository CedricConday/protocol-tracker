/* Capacitor bridge for closed-app dose reminders.
   No-op in a normal browser/PWA; only active inside the native wrapper.
   Schedules the SAME fire-times app.js already computes, as on-device
   LocalNotifications with a custom sound + high-importance channel. */
(function () {
  var Cap = window.Capacitor;
  if (!Cap || !Cap.isNativePlatform || !Cap.isNativePlatform()) { window.CapNotify = { isNative: false, schedule: function(){}, cancelAll: function(){}, testFire: function(){ return Promise.resolve({ ok: false, reason: 'web' }); } }; return; }
  var LN = Cap.Plugins.LocalNotifications;
  var permitted = false;

  async function ensurePerm() {
    if (permitted) return true;
    var s = await LN.checkPermissions();
    if (s.display !== 'granted') { var r = await LN.requestPermissions(); permitted = (r.display === 'granted'); }
    else permitted = true;
    return permitted;
  }
  async function ensureChannel() {
    if (!LN.createChannel) return; // iOS has no channels
    try {
      await LN.createChannel({ id: 'dose', name: 'Dose reminders',
        description: 'Time-for-your-dose alerts', importance: 5,
        sound: 'dose.wav', vibration: true, visibility: 1 });
    } catch (e) {}
  }

  window.CapNotify = {
    isNative: true,
    async schedule(fires) {
      if (!(await ensurePerm())) return { ok: false, reason: 'permission' };
      await ensureChannel();
      await this.cancelAll();
      var now = Date.now();
      var notifs = (fires || [])
        .filter(function (f) { return f && f.at > now; })
        .map(function (f, i) {
          return { id: 10000 + i, title: 'Protocol Tracker',
                   body: 'Time for your next dose 🌿',
                   schedule: { at: new Date(f.at), allowWhileIdle: true },
                   channelId: 'dose', sound: 'dose.wav', smallIcon: 'ic_stat_icon' };
        });
      if (notifs.length) await LN.schedule({ notifications: notifs });
      return { ok: true, count: notifs.length };
    },
    // Prove the closed-app ding: schedule one notification `seconds` out with the custom sound.
    async testFire(seconds) {
      if (!(await ensurePerm())) return { ok: false, reason: 'permission' };
      await ensureChannel();
      var at = new Date(Date.now() + (seconds || 15) * 1000);
      await LN.schedule({ notifications: [{ id: 99999, title: 'Protocol Tracker',
        body: 'Test reminder 🌿 — this is how your dose nudge will sound.',
        schedule: { at: at, allowWhileIdle: true },
        channelId: 'dose', sound: 'dose.wav', smallIcon: 'ic_stat_icon' }] });
      return { ok: true, at: at.getTime() };
    },
    async cancelAll() {
      try {
        var p = await LN.getPending();
        if (p && p.notifications && p.notifications.length)
          await LN.cancel({ notifications: p.notifications.map(function (n) { return { id: n.id }; }) });
      } catch (e) {}
    }
  };
})();
