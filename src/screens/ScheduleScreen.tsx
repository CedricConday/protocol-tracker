import { useCallback, useEffect, useState } from 'react';
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import DoseDetailModal from '../components/DoseDetailModal';
import { confirmDose, getDoseLogs, skipDose } from '../db/queries';
import { formatDoseTime } from '../engine/scheduler';
import type { DoseLog, DoseStatus, ScheduledDose } from '../types';

const statusColors: Record<string, string> = {
  upcoming: '#3b82f6',
  due: '#f97316',
  taken: '#22c55e',
  missed: '#ef4444',
};

function logToScheduledDose(
  log: DoseLog & {
    supplement_name: string;
    supplement_form: string;
    dose_amount: string;
    with_food: number;
    tolerance_window: number;
  },
): ScheduledDose {
  const scheduledTime = new Date(log.scheduled_time);
  const toleranceMs = log.tolerance_window * 60 * 1000;

  let status = log.status as DoseStatus;
  if (status === 'upcoming') {
    const minsUntil = (log.scheduled_time - Date.now()) / 60000;
    if (minsUntil <= 10 && minsUntil > -log.tolerance_window) {
      status = 'due';
    }
  }

  return {
    id: log.id,
    supplement_id: log.supplement_id,
    supplementName: log.supplement_name,
    form: log.supplement_form,
    scheduledTime,
    earliestTime: new Date(log.scheduled_time - toleranceMs),
    latestTime: new Date(log.scheduled_time + toleranceMs),
    status,
    toleranceMinutes: log.tolerance_window,
    doseAmount: log.dose_amount,
    withFood: log.with_food === 1,
    logId: log.id,
  };
}

export default function ScheduleScreen() {
  const [doses, setDoses] = useState<ScheduledDose[]>([]);
  const [selectedDose, setSelectedDose] = useState<ScheduledDose | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const loadSchedule = useCallback(async () => {
    const logs = await getDoseLogs();
    setDoses(logs.map(logToScheduledDose));
    setLoaded(true);
  }, []);

  useEffect(() => {
    loadSchedule();
    const interval = setInterval(loadSchedule, 60_000);
    return () => clearInterval(interval);
  }, [loadSchedule]);

  const handleTook = async (dose: ScheduledDose) => {
    if (dose.logId) {
      await confirmDose(dose.logId);
    }
    setSelectedDose(null);
    await loadSchedule();
  };

  const handleSkip = async (dose: ScheduledDose) => {
    if (dose.logId) {
      await skipDose(dose.logId);
    }
    setSelectedDose(null);
    await loadSchedule();
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadSchedule();
    setRefreshing(false);
  };

  if (loaded && doses.length === 0) {
    return (
      <View style={styles.container}>
        <Text style={styles.heading}>Today's Schedule</Text>
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>
            Start your day from the Home tab to see your schedule.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Today's Schedule</Text>
      <FlatList
        data={doses}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => {
          const timeLabel = formatDoseTime(item.scheduledTime);
          return (
            <TouchableOpacity
              style={styles.row}
              onPress={() => setSelectedDose(item)}
              activeOpacity={0.7}
            >
              <View style={styles.info}>
                <Text style={styles.name}>{item.supplementName}</Text>
                <Text style={styles.meta}>
                  {timeLabel} &middot; {item.doseAmount}
                </Text>
                {item.withFood && (
                  <Text style={styles.foodTag}>with food</Text>
                )}
              </View>
              <View
                style={[
                  styles.badge,
                  { backgroundColor: statusColors[item.status] },
                ]}
              >
                <Text style={styles.badgeText}>{item.status}</Text>
              </View>
            </TouchableOpacity>
          );
        }}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#22c55e" />
        }
      />

      <DoseDetailModal
        visible={selectedDose !== null}
        dose={selectedDose}
        onClose={() => setSelectedDose(null)}
        onTook={handleTook}
        onSkip={handleSkip}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0d0d0d',
    paddingTop: 60,
    paddingHorizontal: 20,
  },
  heading: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 16,
  },
  list: {
    paddingBottom: 20,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
  },
  info: {
    flex: 1,
    marginRight: 12,
  },
  name: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  meta: {
    color: '#888888',
    fontSize: 13,
    marginTop: 4,
  },
  foodTag: {
    color: '#eab308',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 4,
  },
  badge: {
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  badgeText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  emptyText: {
    color: '#888888',
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },
});
