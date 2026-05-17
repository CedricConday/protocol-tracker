import { useCallback, useEffect, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Notifications from 'expo-notifications';
import { getDb } from '../db/schema';

interface AwarenessEvent {
  id: string;
  title: string;
  month: number;
  day: number;
  message: string;
  notified: number;
  daysUntil: number;
  dateObj: Date;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function calcDaysUntil(month: number, day: number): { daysUntil: number; dateObj: Date } {
  const now = new Date();
  const currentYear = now.getFullYear();
  let target = new Date(currentYear, month - 1, day);
  if (target < now) {
    target = new Date(currentYear + 1, month - 1, day);
  }
  const diffMs = target.getTime() - now.getTime();
  const daysUntil = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  return { daysUntil, dateObj: target };
}

async function scheduleAwarenessNotification(event: AwarenessEvent): Promise<void> {
  const triggerDate = new Date(event.dateObj);
  triggerDate.setHours(9, 0, 0, 0);

  if (triggerDate <= new Date()) return;

  await Notifications.scheduleNotificationAsync({
    content: {
      title: event.title,
      body: event.message,
      sound: true,
      data: { type: 'awareness', eventId: event.id },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: triggerDate,
    },
  });

  const db = await getDb();
  await db.runAsync('UPDATE awareness_dates SET notified = 1 WHERE id = ?', [event.id]);
}

export default function AwarenessScreen() {
  const [events, setEvents] = useState<AwarenessEvent[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const loadEvents = useCallback(async () => {
    const db = await getDb();
    const rows = await db.getAllAsync<AwarenessEvent>(
      'SELECT * FROM awareness_dates ORDER BY month, day'
    );

    const withDays = rows.map((r) => {
      const { daysUntil, dateObj } = calcDaysUntil(r.month, r.day);
      return { ...r, daysUntil, dateObj };
    });

    withDays.sort((a, b) => a.daysUntil - b.daysUntil);

    for (const event of withDays) {
      if (event.daysUntil <= 7 && event.daysUntil >= 0 && event.notified === 0) {
        try {
          await scheduleAwarenessNotification(event);
        } catch {
          // notification scheduling may fail silently
        }
      }
    }

    setEvents(withDays);
  }, []);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadEvents();
    setRefreshing(false);
  };

  function formatDateLabel(month: number, day: number): string {
    return `${MONTHS[month - 1]} ${day}`;
  }

  function countdownLabel(daysUntil: number): { text: string; color: string } {
    if (daysUntil === 0) return { text: 'TODAY', color: '#22c55e' };
    if (daysUntil < 0) return { text: 'passed', color: '#555555' };
    return { text: `in ${daysUntil} day${daysUntil === 1 ? '' : 's'}`, color: '#888888' };
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#22c55e" />
      }
    >
      <Text style={styles.heading}>Awareness Calendar</Text>

      {events.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyIcon}>📅</Text>
          <Text style={styles.emptyTitle}>No Upcoming Events</Text>
          <Text style={styles.emptyText}>
            Awareness dates will appear here once added by your doctor.
          </Text>
        </View>
      ) : (
        events.map((event) => {
          const countdown = countdownLabel(event.daysUntil);
          return (
            <View key={event.id} style={styles.card}>
              <View style={styles.cardTop}>
                <View style={styles.cardLeft}>
                  <Text style={styles.eventTitle}>{event.title}</Text>
                  <Text style={styles.eventDate}>
                    {formatDateLabel(event.month, event.day)}
                  </Text>
                </View>
                <Text style={[styles.countdown, { color: countdown.color }]}>
                  {countdown.text}
                </Text>
              </View>
              <Text style={styles.eventMessage}>{event.message}</Text>
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0d0d0d',
  },
  content: {
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  heading: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 20,
  },
  emptyWrap: {
    alignItems: 'center',
    marginTop: 60,
    paddingHorizontal: 20,
  },
  emptyIcon: {
    fontSize: 40,
    marginBottom: 12,
  },
  emptyTitle: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 6,
  },
  emptyText: {
    color: '#888888',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  card: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  cardLeft: {
    flex: 1,
    marginRight: 12,
  },
  eventTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  eventDate: {
    color: '#888888',
    fontSize: 13,
    marginTop: 2,
  },
  countdown: {
    fontSize: 13,
    fontWeight: '700',
  },
  eventMessage: {
    color: '#999999',
    fontSize: 13,
    marginTop: 6,
    lineHeight: 18,
  },
});
