import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Alert } from 'react-native';
import { Platform } from 'react-native';
import { CHECK_DOSES, registerBackgroundTask } from './backgroundTask';
import { getAnchor, getAverageStartTime, getLowStockSupplements, getPatientName, getWaterProgress, todayStr } from '../db/queries';
import { getDb } from '../db/schema';
import { navigate } from '../navigation/navigationRef';

export { registerBackgroundTask };

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
    const identifier = await Notifications.scheduleNotificationAsync({
      content: {
        title: `Time for your ${params.doseAmount} ${params.supplementName}, ${patientName}`,
        body: params.notes ?? 'Stay on schedule with the Protocol',
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
    const notifications: Promise<string>[] = [];
    const intervalMs = 90 * 60 * 1000;

    let currentTime = new Date(t0);
    while (currentTime <= endTime) {
      const progress = await getWaterProgress();
      const body = `${patientName}, 500ml now — you're at ${progress.waterMl}ml of ${progress.goalMl}ml`;
      notifications.push(
        Notifications.scheduleNotificationAsync({
          content: {
            title: 'Water Reminder',
            body,
            sound: true,
            data: { type: 'water' },
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: new Date(currentTime),
          },
        })
      );

      currentTime = new Date(currentTime.getTime() + intervalMs);
    }

    await Promise.all(notifications);
    console.log(`[Protocol Tracker Notifications] Scheduled ${notifications.length} water reminders`);
  } catch (error) {
    console.error('[Protocol Tracker Notifications] Error scheduling water reminders:', error);
    throw error;
  }
};

export const scheduleExerciseReminder = async (t0: Date): Promise<void> => {
  try {
    const exerciseTime = new Date(t0.getTime() + 4 * 60 * 60 * 1000);
    const identifier = await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Exercise Time',
        body: `30 minutes walking — your Protocol exercise for today, ${patientName}`,
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

    const avgTime = await getAverageStartTime();
    let body = avgTime
      ? `${patientName}, you usually start around ${avgTime}. Ready?`
      : `${patientName}, time to start your protocol day`;

    const lowStock = await getLowStockSupplements();
    if (lowStock.length > 0) {
      const lowNames = lowStock.map(s => `${s.name} (${s.stock_days} days)`).join(', ');
      body += ` ⚠️ Running low: ${lowNames}`;
    }

    const identifier = await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Start Your Day',
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
    const identifier = await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Missed Dose',
        body: `${patientName} — ${supplementName} window is closing`,
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
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Daily Summary Ready',
        body: `${patientName}, check your compliance for today in the Summary tab`,
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
    const now = new Date().toISOString();
    await db.runAsync(
      "UPDATE dose_logs SET status = 'taken', taken_time = ? WHERE id = ?",
      [now, doseId]
    );
    await Notifications.scheduleNotificationAsync({
      content: { title: 'Dose confirmed', body: 'Marked as taken' },
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
      "UPDATE dose_logs SET status = 'missed', skip_reason = 'notification_skip' WHERE id = ?",
      [doseId]
    );
  } catch (e) {
    console.error('[Protocol Tracker Notifications] Error skipping dose:', e);
  }
};

export const setupNotificationHandler = (): void => {
  setupAndroidChannels();

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
  ]);

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
        navigate('Calendar');
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
        navigate('Events');
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
