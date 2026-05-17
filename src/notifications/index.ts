import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Alert } from 'react-native';
import { Platform } from 'react-native';
import { COIMBRA_CHECK_DOSES, registerBackgroundTask } from './backgroundTask';
import { getAnchor, todayStr } from '../db/queries';
import { navigate } from '../navigation/navigationRef';

export { registerBackgroundTask };

export const requestPermissions = async (): Promise<boolean> => {
  if (!Device.isDevice) {
    console.warn('[Coimbra Notifications] Must use physical device for push notifications');
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
    console.log('[Coimbra Notifications] Permissions granted');
  }

  return enabled;
};

export const scheduleSupplementNotification = async (params: {
  id: string;
  supplementName: string;
  doseAmount: string;
  scheduledTime: Date;
}): Promise<string> => {
  try {
    const identifier = await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Supplement Reminder',
        body: `Time to take ${params.doseAmount} ${params.supplementName}`,
        sound: true,
        data: { doseId: params.id, type: 'supplement' },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: params.scheduledTime,
      },
    });

    console.log(`[Coimbra Notifications] Scheduled supplement notification ${identifier} for ${params.scheduledTime.toISOString()}`);
    return identifier;
  } catch (error) {
    console.error('[Coimbra Notifications] Error scheduling supplement notification:', error);
    throw error;
  }
};

export const scheduleWaterReminders = async (t0: Date, endTime: Date): Promise<void> => {
  try {
    const notifications: Promise<string>[] = [];
    const intervalMs = 90 * 60 * 1000;
    const body = 'Drink 500ml of water now (Coimbra Protocol)';

    let currentTime = new Date(t0);
    while (currentTime <= endTime) {
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
    console.log(`[Coimbra Notifications] Scheduled ${notifications.length} water reminders`);
  } catch (error) {
    console.error('[Coimbra Notifications] Error scheduling water reminders:', error);
    throw error;
  }
};

export const scheduleExerciseReminder = async (t0: Date): Promise<void> => {
  try {
    const exerciseTime = new Date(t0.getTime() + 4 * 60 * 60 * 1000);
    const identifier = await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Exercise Time',
        body: '30 minutes walking — your Coimbra Protocol exercise for today',
        sound: true,
        data: { type: 'exercise' },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: exerciseTime,
      },
    });

    console.log(`[Coimbra Notifications] Scheduled exercise reminder ${identifier} for ${exerciseTime.toISOString()}`);
  } catch (error) {
    console.error('[Coimbra Notifications] Error scheduling exercise reminder:', error);
    throw error;
  }
};

export const scheduleMorningReminder = async (): Promise<void> => {
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    const alreadySet = scheduled.some(n => n.content.data?.type === 'morning');
    if (alreadySet) return;

    const identifier = await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Start Your Day',
        body: "Don't forget to take your first supplement and set your T=0",
        sound: true,
        data: { type: 'morning' },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: 9,
        minute: 0,
      },
    });

    console.log(`[Coimbra Notifications] Scheduled morning reminder ${identifier}`);
  } catch (error) {
    console.error('[Coimbra Notifications] Error scheduling morning reminder:', error);
    throw error;
  }
};

export const scheduleMissedDoseAlert = async (supplementName: string, scheduledTime: Date): Promise<string> => {
  try {
    const alertTime = new Date(scheduledTime.getTime() + 30 * 60 * 1000);
    const identifier = await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Missed Dose',
        body: `You missed ${supplementName} — last chance within your window`,
        sound: true,
        data: { type: 'missed', supplementName },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: alertTime,
      },
    });

    console.log(`[Coimbra Notifications] Scheduled missed dose alert ${identifier} for ${supplementName}`);
    return identifier;
  } catch (error) {
    console.error('[Coimbra Notifications] Error scheduling missed dose alert:', error);
    throw error;
  }
};

export const scheduleEndOfDaySummary = async (t0: Date): Promise<void> => {
  try {
    const summaryTime = new Date(t0.getTime() + 8 * 60 * 60 * 1000);
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Daily Summary Ready',
        body: 'Check your compliance for today in the Summary tab',
        sound: true,
        data: { type: 'summary' },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: summaryTime,
      },
    });
    console.log(`[Coimbra Notifications] Scheduled end-of-day summary for ${summaryTime.toISOString()}`);
  } catch (error) {
    console.error('[Coimbra Notifications] Error scheduling end-of-day summary:', error);
    throw error;
  }
};

export const cancelAllNotifications = async (): Promise<void> => {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
    console.log('[Coimbra Notifications] All pending notifications cancelled');
  } catch (error) {
    console.error('[Coimbra Notifications] Error cancelling notifications:', error);
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
    console.log('[Coimbra Notifications] Cancelled supplement notifications:', supplementIds.length);
  } catch (error) {
    console.error('[Coimbra Notifications] Error cancelling supplement notifications:', error);
    throw error;
  }
};

export const cancelNotification = async (id: string): Promise<void> => {
  try {
    await Notifications.cancelScheduledNotificationAsync(id);
    console.log(`[Coimbra Notifications] Cancelled notification ${id}`);
  } catch (error) {
    console.error('[Coimbra Notifications] Error cancelling notification:', error);
    throw error;
  }
};

export const setupNotificationHandler = (): void => {
  setupAndroidChannels();

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
        console.error('[Coimbra Notifications] Error checking water progress:', error);
      }
    }

    const { title, body } = notification.request.content;
    Alert.alert(title ?? 'Notification', body ?? '');
  });

  Notifications.addNotificationResponseReceivedListener((response) => {
    const type = response.notification.request.content.data?.type;
    switch (type) {
      case 'supplement':
        navigate('Schedule');
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
      case 'awareness':
        navigate('Awareness');
        break;
      case 'events':
        navigate('Events');
        break;
    }
  });
};

export const setupAndroidChannels = (): void => {
  if (Platform.OS !== 'android') return;

  Notifications.setNotificationChannelAsync('supplements', {
    name: 'Supplements',
    importance: Notifications.AndroidImportance.HIGH,
  }).catch(() => {});

  Notifications.setNotificationChannelAsync('water', {
    name: 'Water Reminders',
    importance: Notifications.AndroidImportance.DEFAULT,
  }).catch(() => {});

  Notifications.setNotificationChannelAsync('exercise', {
    name: 'Exercise',
    importance: Notifications.AndroidImportance.DEFAULT,
  }).catch(() => {});

  Notifications.setNotificationChannelAsync('general', {
    name: 'General',
    importance: Notifications.AndroidImportance.LOW,
  }).catch(() => {});
};