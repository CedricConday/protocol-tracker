import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Alert } from 'react-native';
import { COIMBRA_CHECK_DOSES, registerBackgroundTask } from './backgroundTask';

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

export const cancelAllNotifications = async (): Promise<void> => {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
    console.log('[Coimbra Notifications] All pending notifications cancelled');
  } catch (error) {
    console.error('[Coimbra Notifications] Error cancelling notifications:', error);
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
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    } as Notifications.NotificationBehavior),
  });

  Notifications.addNotificationReceivedListener((notification) => {
    const { title, body } = notification.request.content;
    Alert.alert(title ?? 'Notification', body ?? '');
  });

  Notifications.addNotificationResponseReceivedListener((response) => {
    console.log('[Coimbra Notifications] User tapped notification:', response);
  });
};