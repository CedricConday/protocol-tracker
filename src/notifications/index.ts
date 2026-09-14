import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Alert } from 'react-native';
import { Platform } from 'react-native';
import { CHECK_DOSES, registerBackgroundTask } from './backgroundTask';
import { getAnchor, getAverageStartTime, getLowStockSupplements, getPatientName, getWaterProgress, todayStr } from '../db/queries';
import { getDb } from '../db/schema';
import { navigate } from '../navigation/navigationRef';
import { isQuietAt } from './quietHours';
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
    const identifier = await Notifications.scheduleNotificationAsync({
      content: {
        title: t('notifDoseTitle', { dose: params.doseAmount, supplement: params.supplementName, name: patientName }),
        body: params.notes ?? t('notifDoseBody'),
        sound: true,
        categoryIdentifier: 'supplement',
        data: { doseId: params.id, type: 'supplement' },
        badge: Math.min(params.pendingCount ?? 1, 9),
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

export const scheduleWaterReminders = async (t0: Date, endTime: Date): Promise<void> => {
  try {
    const notifications: Promise<string | null>[] = [];
    const intervalMs = 90 * 60 * 1000;

    let currentTime = new Date(t0);
    let skipped = 0;
    while (currentTime <= endTime) {
      // Checked per reminder, not once: the 12-hour run can start outside the
      // window and cross into it.
      if (await isQuietAt(currentTime)) {
        skipped++;
        currentTime = new Date(currentTime.getTime() + intervalMs);
        continue;
      }
      const progress = await getWaterProgress();
      const body = t('notifWaterBody', { name: patientName, ml: progress.waterMl, goal: progress.goalMl });
      // The catch goes on at push time, not at the Promise.allSettled below:
      // getWaterProgress() yields on every pass, so a promise parked in this array
      // with no handler yet rejects into an unhandled rejection before the loop
      // ever finishes.
      notifications.push(
        Notifications.scheduleNotificationAsync({
          content: {
            title: t('notifWaterTitle'),
            body,
            sound: true,
            data: { type: 'water' },
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: new Date(currentTime),
          },
        }).catch(() => null)
      );

      currentTime = new Date(currentTime.getTime() + intervalMs);
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
    const identifier = await Notifications.scheduleNotificationAsync({
      content: {
        title: t('notifExerciseTitle'),
        body: t('notifExerciseBody', { name: patientName }),
        sound: true,
        data: { type: 'exercise' },
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

    const identifier = await Notifications.scheduleNotificationAsync({
      content: {
        title: t('notifMorningTitle'),
        body,
        sound: true,
        data: { type: 'morning' },
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
    const identifier = await Notifications.scheduleNotificationAsync({
      content: {
        title: t('notifMissedTitle'),
        body: t('notifMissedBody', { name: patientName, supplement: supplementName }),
        sound: true,
        data: { type: 'missed', supplementName },
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

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    } as Notifications.NotificationBehavior),
  });

  Notifications.addNotificationReceivedListener(async (notification) => {
    const data = notification.request.content.data;
    const notificationType = data?.type;

    if (notificationType === 'water') {
      try {
        const anchor = await getAnchor(todayStr());
        if ((anchor?.water_ml ?? 0) >= 2500) {
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

  Notifications.setNotificationChannelAsync('supplements', {
    name: 'Supplements',
    importance: Notifications.AndroidImportance.HIGH,
    lockscreenVisibility: PRIVATE,
  }).catch(() => {});

  Notifications.setNotificationChannelAsync('water', {
    name: 'Water Reminders',
    importance: Notifications.AndroidImportance.DEFAULT,
    lockscreenVisibility: PRIVATE,
  }).catch(() => {});

  Notifications.setNotificationChannelAsync('exercise', {
    name: 'Exercise',
    importance: Notifications.AndroidImportance.DEFAULT,
    lockscreenVisibility: PRIVATE,
  }).catch(() => {});

  Notifications.setNotificationChannelAsync('general', {
    name: 'General',
    importance: Notifications.AndroidImportance.LOW,
    lockscreenVisibility: PRIVATE,
  }).catch(() => {});
};
