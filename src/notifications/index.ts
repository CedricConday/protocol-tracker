import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Alert } from 'react-native';
import { Platform } from 'react-native';
import { CHECK_DOSES, registerBackgroundTask } from './backgroundTask';
import { getAverageStartTime, getLowStockSupplements, getPatientName, getWaterProgress, getMiscFlag, setMiscFlag } from '../db/queries';
import { getDb } from '../db/schema';
import { navigate } from '../navigation/navigationRef';
import { isQuietAt } from './quietHours';
import { waterReminderTimes, WATER_NUDGE_ML } from './waterCadence';
import { t } from '../i18n';

export { registerBackgroundTask };
export * from './quietHours';

let patientName = 'there';

export async function loadPatientName(): Promise<void> {
  try {
    patientName = await getPatientName();
  } catch {
    patientName = 'there';
  }
}

export const requestPermissions = async (): Promise<boolean> => {
  if (!Device.isDevice) {
    console.warn('[Protocol Tracker Notifications] Must use physical device for push notifications');
    return false;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  const enabled = finalStatus === 'granted';

  if (enabled) {
    console.log('[Protocol Tracker Notifications] Permissions granted');
  }

  return enabled;
};

export const clearAppBadge = async (): Promise<void> => {
  try {
    await Notifications.setBadgeCountAsync(0);
  } catch {
    // badge not supported on this platform
  }
};

/**
 * Android channel ids. Bumped to `-v2` on 2026-09-20 when the sound was added,
 * because a channel cannot be changed after the device has seen it — see the
 * note in `configureNotificationChannels`. Anything scheduled on Android must
 * name one of these; a notification with no channel lands in a default channel
 * this app does not control.
 */
/**
 * Fire one real reminder, now, so the sound can be heard before it matters.
 *
 * Added 2026-09-20: reminders were arriving silently and there was no way to
 * check a fix without waiting for a scheduled dose. This goes through the same
 * channel, the same content shape and the same handler as a supplement
 * reminder, so what it sounds like is what a real one will sound like — a test
 * that took a different path would prove nothing.
 *
 * Five seconds rather than immediately, on purpose: it gives you time to lock
 * the phone, which is also the state a real reminder arrives in and the one
 * where a silent channel is easiest to miss.
 */
/**
 * What Android actually believes about the reminder channel.
 *
 * Added 2026-09-20 because "still silent" has at least four causes that look
 * identical from the outside: a channel with no sound, a channel whose
 * importance the user or the system dropped, the app allowed but the channel
 * blocked, or a phone whose notification volume is simply down. Guessing
 * between them from a laptop is how an afternoon disappears; the phone already
 * knows, so this asks it and puts the answer on screen.
 *
 * Android only — iOS has no channels, and returns a line that says so rather
 * than an empty object that reads as a fault.
 */
export const describeReminderChannel = async (): Promise<string> => {
  if (Platform.OS !== 'android') return 'iOS: no channels — sound follows the ringer switch and Settings → Notifications.';
  try {
    const ch = await Notifications.getNotificationChannelAsync(CHANNEL.supplements);
    if (!ch) return `Channel ${CHANNEL.supplements} does not exist on this device.`;
    const importance = Notifications.AndroidImportance[ch.importance] ?? String(ch.importance);
    return [
      `channel: ${ch.id}`,
      `sound: ${ch.sound ?? 'none'}`,
      `importance: ${importance}`,
      `vibration: ${ch.vibrationPattern ? 'yes' : 'no'}`,
      `bypasses DND: ${ch.bypassDnd ? 'yes' : 'no'}`,
    ].join('\n');
  } catch (e) {
    return `Could not read the channel: ${String(e)}`;
  }
};

export const fireTestReminder = async (delaySeconds = 10): Promise<string> => {
  return Notifications.scheduleNotificationAsync({
    content: {
      title: t('notifTestTitle'),
      body: t('notifTestBody'),
      sound: true,
      data: { type: 'test' },
      ...android(CHANNEL.supplements),
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: Math.max(1, delaySeconds),
    },
  });
};

/**
 * Lock-screen privacy, on both platforms rather than one (2026-09-20).
 *
 * Android has hidden notification content on the lock screen since these
 * channels existed: `lockscreenVisibility: PRIVATE` shows the app's name on the
 * lock screen and the detail only after unlocking. iOS has no equivalent the app
 * can set — previews are a user-side setting the app cannot reach — so every
 * reminder has been putting the patient's NAME and the SUPPLEMENT on the lock
 * screen of every iPhone, in full, by default. "Time for your 40,000 IU Vitamin
 * D3, the first user" read by whoever picks the phone up.
 *
 * Parity is therefore not a matter of copying Android's flag: on iOS the only
 * thing the app controls is what it puts in the notification. So when this is on
 * — and it is on by default, because the safe side is the default for medical
 * content — iOS reminders carry no name and no supplement, just enough to bring
 * the patient into the app, where the detail is behind the biometric gate.
 *
 * Android keeps its full text, because PRIVATE already hides it until unlock and
 * that is strictly better: the detail is there the moment it is safe to show.
 * Same guarantee, different mechanism, which is what parity means here.
 */
export const PRIVATE_NOTIF_FLAG = 'notif_hide_details';

let hideDetailsCache: boolean | null = null;

export const hideNotificationDetails = async (): Promise<boolean> => {
  if (hideDetailsCache !== null) return hideDetailsCache;
  try {
    const flag = await getMiscFlag(PRIVATE_NOTIF_FLAG);
    hideDetailsCache = flag === null ? true : flag === '1';
  } catch {
    // Unreadable setting: assume the private side. A reminder that says too
    // little is a nuisance; one that says too much cannot be taken back.
    hideDetailsCache = true;
  }
  return hideDetailsCache;
};

export const setHideNotificationDetails = async (on: boolean): Promise<void> => {
  hideDetailsCache = on;
  await setMiscFlag(PRIVATE_NOTIF_FLAG, on ? '1' : '0');
};

/**
 * The title and body as they should reach the lock screen.
 *
 * Only iOS is rewritten — see the note above. Everything else passes through
 * untouched, so a change to the copy lands in one place rather than five.
 */
const forLockScreen = async (title: string, body: string): Promise<{ title: string; body: string }> => {
  if (Platform.OS !== 'ios') return { title, body };
  if (!(await hideNotificationDetails())) return { title, body };
  return { title: t('notifPrivateTitle'), body: t('notifPrivateBody') };
};

export const CHANNEL = {
  supplements: 'supplements-v2',
  water: 'water-v2',
  exercise: 'exercise-v2',
  general: 'general-v2',
} as const;

const android = (channelId: string) => (Platform.OS === 'android' ? { channelId } : {});

export const scheduleSupplementNotification = async (params: {
  id: string;
  supplementName: string;
  doseAmount: string;
  scheduledTime: Date;
  notes?: string;
  pendingCount?: number;
}): Promise<string> => {
  try {
    if (await isQuietAt(params.scheduledTime)) {
      console.log('[Protocol Tracker Notifications] Supplement reminder falls in quiet hours — not scheduled');
      return '';
    }
    const shown = await forLockScreen(
      t('notifDoseTitle', { dose: params.doseAmount, supplement: params.supplementName, name: patientName }),
      params.notes ?? t('notifDoseBody'),
    );
    const identifier = await Notifications.scheduleNotificationAsync({
      content: {
        title: shown.title,
        body: shown.body,
        sound: true,
        categoryIdentifier: 'supplement',
        data: { doseId: params.id, type: 'supplement' },
        badge: Math.min(params.pendingCount ?? 1, 9),
        ...android(CHANNEL.supplements),
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: params.scheduledTime,
      },
    });

    console.log(`[Protocol Tracker Notifications] Scheduled supplement notification ${identifier} for ${params.scheduledTime.toISOString()}`);
    return identifier;
  } catch (error) {
    console.error('[Protocol Tracker Notifications] Error scheduling supplement notification:', error);
    throw error;
  }
};

/**
 * Drops every water reminder still pending.
 *
 * `startDay` cancelled supplement notifications and nothing else, so opening the
 * day a second time — after an account reset, or a day re-anchored on purpose —
 * stacked a fresh set on top of the set already scheduled.
 */
export const cancelWaterReminders = async (): Promise<void> => {
  try {
    const all = await Notifications.getAllScheduledNotificationsAsync();
    const ids = all.filter((n) => n.content.data?.type === 'water').map((n) => n.identifier);
    await Promise.all(ids.map((id) => Notifications.cancelScheduledNotificationAsync(id)));
    if (ids.length) {
      console.log('[Protocol Tracker Notifications] Cancelled water reminders:', ids.length);
    }
  } catch (error) {
    console.error('[Protocol Tracker Notifications] Error cancelling water reminders:', error);
  }
};

export const scheduleWaterReminders = async (t0: Date, endTime: Date): Promise<void> => {
  try {
    // Replace, never add to. See cancelWaterReminders.
    await cancelWaterReminders();

    const progress = await getWaterProgress();
    const times = waterReminderTimes(t0, endTime, progress.goalMl, progress.waterMl);
    if (times.length === 0) {
      console.log('[Protocol Tracker Notifications] No water reminders needed — the goal is already met');
      return;
    }

    // The body cannot say how much has been drunk: a DATE-triggered notification
    // carries the text it was written with, and these are written hours ahead.
    // The old body interpolated the progress at SCHEDULE time, so every reminder
    // for the rest of the day reported the same stale figure — usually "0 ml".
    // It states the ask and the goal, both of which are still true when it fires.
    const body = t('notifWaterBody', { name: patientName, amount: WATER_NUDGE_ML, goal: progress.goalMl });
    const water = await forLockScreen(t('notifWaterTitle'), body);

    let skipped = 0;
    const notifications: Promise<string | null>[] = [];
    for (const at of times) {
      // Checked per reminder, not once: a 12-hour window can start outside quiet
      // hours and cross into them.
      if (await isQuietAt(at)) {
        skipped++;
        continue;
      }
      // The catch goes on at push time, not at the Promise.all below: `isQuietAt`
      // yields on every pass, so a promise parked in this array with no handler
      // yet rejects into an unhandled rejection before the loop finishes.
      notifications.push(
        Notifications.scheduleNotificationAsync({
          content: {
            title: water.title,
            body: water.body,
            sound: true,
            data: { type: 'water' },
            // Without this the reminder lands on the default channel instead of
            // the DEFAULT-importance 'water' one declared in setupAndroidChannels,
            // so it arrived with a dose reminder's urgency. Ignored on iOS.
            ...android(CHANNEL.water),
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: at,
          },
        }).catch(() => null)
      );
    }

    const results = await Promise.all(notifications);
    const scheduled = results.filter((id) => id !== null).length;
    if (scheduled < results.length) {
      console.warn(
        `[Protocol Tracker Notifications] ${results.length - scheduled} water reminders failed to schedule`,
      );
    }
    console.log(`[Protocol Tracker Notifications] Scheduled ${scheduled} water reminders${skipped ? ` (${skipped} in quiet hours)` : ''}`);
  } catch (error) {
    console.error('[Protocol Tracker Notifications] Error scheduling water reminders:', error);
    throw error;
  }
};

export const scheduleExerciseReminder = async (t0: Date): Promise<void> => {
  try {
    const exerciseTime = new Date(t0.getTime() + 4 * 60 * 60 * 1000);
    if (await isQuietAt(exerciseTime)) {
      console.log('[Protocol Tracker Notifications] Exercise reminder falls in quiet hours — not scheduled');
      return;
    }
    const ex = await forLockScreen(
      t('notifExerciseTitle'),
      t('notifExerciseBody', { name: patientName }),
    );
    const identifier = await Notifications.scheduleNotificationAsync({
      content: {
        title: ex.title,
        body: ex.body,
        sound: true,
        data: { type: 'exercise' },
        ...android(CHANNEL.exercise),
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: exerciseTime,
      },
    });

    console.log(`[Protocol Tracker Notifications] Scheduled exercise reminder ${identifier} for ${exerciseTime.toISOString()}`);
  } catch (error) {
    console.error('[Protocol Tracker Notifications] Error scheduling exercise reminder:', error);
    throw error;
  }
};

export const scheduleMorningReminder = async (): Promise<void> => {
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    const alreadySet = scheduled.some(n => n.content.data?.type === 'morning');
    if (alreadySet) return;

    const morning = new Date();
    morning.setHours(9, 0, 0, 0);
    if (await isQuietAt(morning)) {
      console.log('[Protocol Tracker Notifications] 09:00 start reminder falls in quiet hours — not scheduled');
      return;
    }

    const avgTime = await getAverageStartTime();
    let body = avgTime
      ? t('notifMorningKnown', { name: patientName, time: avgTime })
      : t('notifMorningUnknown', { name: patientName });

    const lowStock = await getLowStockSupplements();
    if (lowStock.length > 0) {
      const lowNames = lowStock.map((s) => t('notifLowStockDays', { name: s.name, days: s.stock_days })).join(', ');
      body += t('notifLowStock', { names: lowNames });
    }

    const morningShown = await forLockScreen(t('notifMorningTitle'), body);
    const identifier = await Notifications.scheduleNotificationAsync({
      content: {
        title: morningShown.title,
        body: morningShown.body,
        sound: true,
        data: { type: 'morning' },
        ...android(CHANNEL.supplements),
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: 9,
        minute: 0,
      },
    });

    console.log(`[Protocol Tracker Notifications] Scheduled morning reminder ${identifier}`);
  } catch (error) {
    console.error('[Protocol Tracker Notifications] Error scheduling morning reminder:', error);
    throw error;
  }
};

export const scheduleMissedDoseAlert = async (supplementName: string, scheduledTime: Date): Promise<string> => {
  try {
    const alertTime = new Date(scheduledTime.getTime() + 30 * 60 * 1000);
    if (await isQuietAt(alertTime)) {
      console.log('[Protocol Tracker Notifications] Missed-dose alert falls in quiet hours — not scheduled');
      return '';
    }
    const missed = await forLockScreen(
      t('notifMissedTitle'),
      t('notifMissedBody', { name: patientName, supplement: supplementName }),
    );
    const identifier = await Notifications.scheduleNotificationAsync({
      content: {
        title: missed.title,
        body: missed.body,
        sound: true,
        data: { type: 'missed', supplementName },
        ...android(CHANNEL.supplements),
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: alertTime,
      },
    });

    console.log(`[Protocol Tracker Notifications] Scheduled missed dose alert ${identifier} for ${supplementName}`);
    return identifier;
  } catch (error) {
    console.error('[Protocol Tracker Notifications] Error scheduling missed dose alert:', error);
    throw error;
  }
};

export const scheduleEndOfDaySummary = async (t0: Date): Promise<void> => {
  try {
    const summaryTime = new Date(t0.getTime() + 8 * 60 * 60 * 1000);
    if (await isQuietAt(summaryTime)) {
      console.log('[Protocol Tracker Notifications] End-of-day summary falls in quiet hours — not scheduled');
      return;
    }
    await Notifications.scheduleNotificationAsync({
      content: {
        title: t('notifSummaryTitle'),
        body: t('notifSummaryBody', { name: patientName }),
        sound: true,
        data: { type: 'summary' },
        ...android(CHANNEL.general),
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: summaryTime,
      },
    });
    console.log(`[Protocol Tracker Notifications] Scheduled end-of-day summary for ${summaryTime.toISOString()}`);
  } catch (error) {
    console.error('[Protocol Tracker Notifications] Error scheduling end-of-day summary:', error);
    throw error;
  }
};

export const cancelAllNotifications = async (): Promise<void> => {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
    console.log('[Protocol Tracker Notifications] All pending notifications cancelled');
  } catch (error) {
    console.error('[Protocol Tracker Notifications] Error cancelling notifications:', error);
    throw error;
  }
};

export const cancelSupplementNotifications = async (): Promise<void> => {
  try {
    const all = await Notifications.getAllScheduledNotificationsAsync();
    const supplementIds = all
      .filter(n => n.content.data?.type === 'supplement')
      .map(n => n.identifier);
    await Promise.all(supplementIds.map(id => Notifications.cancelScheduledNotificationAsync(id)));
    console.log('[Protocol Tracker Notifications] Cancelled supplement notifications:', supplementIds.length);
  } catch (error) {
    console.error('[Protocol Tracker Notifications] Error cancelling supplement notifications:', error);
    throw error;
  }
};

export const cancelNotification = async (id: string): Promise<void> => {
  try {
    await Notifications.cancelScheduledNotificationAsync(id);
    console.log(`[Protocol Tracker Notifications] Cancelled notification ${id}`);
  } catch (error) {
    console.error('[Protocol Tracker Notifications] Error cancelling notification:', error);
    throw error;
  }
};

export const confirmDoseFromNotification = async (doseId: number): Promise<void> => {
  try {
    const db = await getDb();
    const now = Date.now();
    await db.runAsync(
      "UPDATE dose_logs SET status = 'taken', logged_time = ? WHERE id = ?",
      [now, doseId]
    );
    await Notifications.scheduleNotificationAsync({
      content: { title: t('notifDoseConfirmed'), body: t('notifMarkedTaken') },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 1 },
    });
  } catch (e) {
    console.error('[Protocol Tracker Notifications] Error confirming dose:', e);
  }
};

export const skipDoseFromNotification = async (doseId: number): Promise<void> => {
  try {
    const db = await getDb();
    await db.runAsync(
      "UPDATE dose_logs SET status = 'skipped', skip_reason = 'notification_skip' WHERE id = ?",
      [doseId]
    );
  } catch (e) {
    console.error('[Protocol Tracker Notifications] Error skipping dose:', e);
  }
};

export const setupNotificationHandler = (): void => {
  setupAndroidChannels();

  // Fire-and-forget like the Android channels above, and guarded the same way:
  // action buttons are a nicety, not a reason to reject into nothing.
  Notifications.setNotificationCategoryAsync('supplement', [
    {
      identifier: 'taken',
      buttonTitle: '✓ Taken',
      options: { opensAppToForeground: false },
    },
    {
      identifier: 'skip',
      buttonTitle: 'Skip',
      options: { opensAppToForeground: false },
    },
  ]).catch(() => {});

  // `shouldShowAlert` was split into banner + list in SDK 53 and is deprecated.
  // Both are set alongside it (2026-09-20) so a notification arriving while the
  // app is open still presents — and still makes a sound — on a build where the
  // old key is ignored.
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    } as Notifications.NotificationBehavior),
  });

  Notifications.addNotificationReceivedListener(async (notification) => {
    const data = notification.request.content.data;
    const notificationType = data?.type;

    if (notificationType === 'water') {
      try {
        // Against the user's own goal. This read a hardcoded 2500 while the goal
        // has been editable on the Water screen since 2026-09-13, so anyone who
        // raised or lowered it was measured against a number they had replaced.
        const progress = await getWaterProgress();
        if (progress.waterMl >= progress.goalMl) {
          // The rest of the day goes with it. Cancelling only the notification
          // that just arrived left every later one to fire, which is the
          // complaint this whole path exists to answer.
          await cancelWaterReminders();
          await cancelNotification(notification.request.identifier);
          return;
        }
      } catch (error) {
        console.error('[Protocol Tracker Notifications] Error checking water progress:', error);
      }
    }

    const { title, body } = notification.request.content;
    Alert.alert(title ?? 'Notification', body ?? '');
  });

  Notifications.addNotificationResponseReceivedListener((response) => {
    const actionId = response.actionIdentifier;
    const data = response.notification.request.content.data;
    const doseId = data?.doseId as number | undefined;
    const type = data?.type as string | undefined;

    if (actionId === 'taken' && doseId) {
      confirmDoseFromNotification(doseId);
      return;
    }
    if (actionId === 'skip' && doseId) {
      skipDoseFromNotification(doseId);
      return;
    }

    switch (type) {
      case 'supplement':
        // A dose reminder belongs on Today, where the dose can be confirmed —
        // the History tab only shows what already happened.
        navigate('Home');
        break;
      case 'water':
        navigate('Home');
        break;
      case 'exercise':
        navigate('Home');
        break;
      case 'summary':
        navigate('Summary');
        break;
      case 'morning':
        navigate('Home');
        break;
      case 'events':
        // The event log is absorbed into the Journal screen itself (no more
        // separate Relapse route) — land on Journal and let the user expand
        // "+ Log Event" from there.
        navigate('Journal', { screen: 'JournalMain' });
        break;
    }
  });
};

export const setupAndroidChannels = (): void => {
  if (Platform.OS !== 'android') return;

  // PRIVATE lockscreen visibility hides notification content when the device
  // is locked — supplement names + patient name are not displayed until the
  // user unlocks. iOS users should set Show Previews → When Unlocked in iOS
  // Settings → Notifications → Protocol Tracker for the equivalent effect.
  const PRIVATE = Notifications.AndroidNotificationVisibility.PRIVATE;

  // Every channel names its sound explicitly (2026-09-20).
  //
  // Reminders fired and were silent. `sound: true` in the notification content
  // is an iOS instruction; on Android the CHANNEL owns the sound, and these four
  // were created without one — so Android took the channel at its word and
  // played nothing, on every reminder, for as long as the channels have existed.
  //
  // The `-v2` suffixes are not tidiness. **A channel is immutable once created**:
  // Android ignores changes to the sound, importance or vibration of a channel
  // id that already exists on the device, so adding `sound` to `supplements`
  // would have fixed nothing on any phone that had already run the app — which
  // is every phone that matters. New ids are the only way the setting reaches an
  // existing install. The old silent channels are deleted so the system settings
  // screen does not list eight channels, four of which do nothing.
  const OLD_CHANNELS = ['supplements', 'water', 'exercise', 'general'];
  OLD_CHANNELS.forEach((id) => { Notifications.deleteNotificationChannelAsync(id).catch(() => {}); });

  Notifications.setNotificationChannelAsync(CHANNEL.supplements, {
    name: 'Supplements',
    importance: Notifications.AndroidImportance.HIGH,
    lockscreenVisibility: PRIVATE,
    sound: 'default',
    vibrationPattern: [0, 250, 250, 250],
  }).catch(() => {});

  Notifications.setNotificationChannelAsync(CHANNEL.water, {
    name: 'Water Reminders',
    importance: Notifications.AndroidImportance.DEFAULT,
    lockscreenVisibility: PRIVATE,
    sound: 'default',
    vibrationPattern: [0, 200],
  }).catch(() => {});

  Notifications.setNotificationChannelAsync(CHANNEL.exercise, {
    name: 'Exercise',
    importance: Notifications.AndroidImportance.DEFAULT,
    lockscreenVisibility: PRIVATE,
    sound: 'default',
    vibrationPattern: [0, 200],
  }).catch(() => {});

  // Deliberately silent: the end-of-day summary is a note to read later, not
  // something to interrupt an evening. LOW importance makes no sound by design
  // on Android, so this one is quiet on purpose rather than by omission.
  Notifications.setNotificationChannelAsync(CHANNEL.general, {
    name: 'General',
    importance: Notifications.AndroidImportance.LOW,
    lockscreenVisibility: PRIVATE,
  }).catch(() => {});
};
