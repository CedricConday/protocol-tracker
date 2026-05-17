import { useCallback, useEffect, useState } from 'react';
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DoseDetailModal from '../components/DoseDetailModal';
import { confirmDose, getDoseLogs, getScheduleRules, skipDose } from '../db/queries';
import { useSimpleMode } from '../context/SimpleModeContext';
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
    skip_reason: string | null;
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
    skipReason: log.skip_reason ?? undefined,
  };
}

function formatTime12hr(date: Date): string {
  let hours = date.getHours();
  const mins = date.getMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  if (hours === 0) hours = 12;
  const minStr = mins.toString().padStart(2, '0');
  return `${hours}:${minStr}\n${ampm}`;
}

function isoWeek(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${week}`;
}

export default function ScheduleScreen() {
  const navigation = useNavigation<any>();
  const [doses, setDoses] = useState<ScheduledDose[]>([]);
  const [selectedDose, setSelectedDose] = useState<ScheduledDose | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [showHighDoseAlert, setShowHighDoseAlert] = useState(false);
  const { isSimple } = useSimpleMode();

  const loadSchedule = useCallback(async () => {
    const logs = await getDoseLogs();
    setDoses(logs.map(logToScheduledDose));
    setLoaded(true);
  }, []);

  useEffect(() => {
    (async () => {
      const rules = await getScheduleRules();
      const d3 = rules.find((r) => r.supplement_id === 'vit_d3');
      if (!d3) return;
      const amount = parseFloat(d3.dose_amount);
      if (isNaN(amount) || amount <= 40000) return;
      const thisWeek = isoWeek(new Date());
      const seen = await AsyncStorage.getItem('high_dose_alert_week');
      if (seen !== thisWeek) setShowHighDoseAlert(true);
    })();
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
      <View style={styles.headingRow}>
        <Text style={styles.heading}>Today's Schedule</Text>
        <TouchableOpacity style={styles.scanBtn} onPress={() => navigation.navigate('Scanner')} activeOpacity={0.7}>
          <Text style={styles.scanBtnText}>Scan Ingredient</Text>
        </TouchableOpacity>
      </View>

      {showHighDoseAlert ? (
        <TouchableOpacity
          style={styles.highDoseBanner}
          onPress={async () => {
            await AsyncStorage.setItem('high_dose_alert_week', isoWeek(new Date()));
            setShowHighDoseAlert(false);
          }}
          activeOpacity={0.9}
        >
          <Text style={styles.highDoseBannerText}>
            ⚠ High-dose D3 detected. Ensure adequate hydration (2.5L/day), low-calcium diet, and regular kidney function monitoring per Coimbra Protocol guidelines.
          </Text>
          <Text style={styles.highDoseBannerDismiss}>Got it</Text>
        </TouchableOpacity>
      ) : null}

      <FlatList
        data={doses}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item, index }) => {
          const timeStr = formatTime12hr(item.scheduledTime);
          const isPast = item.status === 'taken' || item.status === 'missed';
          const isDue = item.status === 'due';
          const dotColor = statusColors[item.status];
          const isFirst = index === 0;
          const isLast = index === doses.length - 1;

          return (
            <TouchableOpacity
              style={styles.row}
              onPress={() => setSelectedDose(item)}
              activeOpacity={0.7}
            >
              {/* Left: time column */}
              {!isSimple && <View style={styles.timeCol}>
                <Text
                  style={[
                    styles.timeText,
                    isPast ? styles.timeTextDimmed : null,
                    isDue ? styles.timeTextDue : null,
                  ]}
                >
                  {timeStr}
                </Text>
              </View>}

              {/* Timeline track: vertical line + dot */}
              {!isSimple && <View style={styles.trackCol}>
                {/* Top segment of line — hidden for first item */}
                <View style={[styles.lineSegment, isFirst ? styles.lineSegmentInvisible : null]} />
                {/* The status dot */}
                <View style={[styles.dot, { backgroundColor: dotColor }]} />
                {/* Bottom segment of line — hidden for last item */}
                <View style={[styles.lineSegment, isLast ? styles.lineSegmentInvisible : null]} />
              </View>}

              {/* Right: supplement info */}
              <View style={styles.info}>
                <Text style={styles.name}>{item.supplementName}</Text>
                {!isSimple && <Text style={styles.doseAmount}>{item.doseAmount}</Text>}
                {!isSimple && item.withFood && (
                  <Text style={styles.foodTag}>with food</Text>
                )}
                {item.status === 'missed' && item.logId && (
                  <Text style={styles.skipReasonText}>{item.skipReason ?? 'Skipped'}</Text>
                )}

                {isSimple && (
                  <View style={{ marginLeft: 'auto', paddingLeft: 12 }}>
                    {item.status === 'taken' ? (
                      <Text style={{ color: '#22c55e', fontWeight: '700' }}>Taken</Text>
                    ) : item.status === 'missed' ? (
                      <Text style={{ color: '#ef4444', fontWeight: '700' }}>Missed</Text>
                    ) : (
                      <View style={{ backgroundColor: item.status === 'due' ? '#22c55e' : '#1a1a1a', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, borderWidth: 1, borderColor: '#22c55e' }}>
                        <Text style={{ color: item.status === 'due' ? '#0d0d0d' : '#22c55e', fontWeight: '800', fontSize: 12 }}>{item.status === 'due' ? 'TAKE' : 'WAIT'}</Text>
                      </View>
                    )}
                  </View>
                )}
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
  headingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  heading: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '700',
  },
  scanBtn: { backgroundColor: '#1a1a1a', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  scanBtnText: { color: '#22c55e', fontSize: 13, fontWeight: '600' },
  highDoseBanner: {
    backgroundColor: '#2a1a00',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#eab30860',
    padding: 12,
    marginBottom: 12,
  },
  highDoseBannerText: {
    color: '#eab308',
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
    marginBottom: 8,
  },
  highDoseBannerDismiss: {
    color: '#eab308',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'right',
    opacity: 0.7,
  },
  list: {
    paddingBottom: 20,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'stretch',
    minHeight: 64,
  },
  timeCol: {
    width: 56,
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingRight: 12,
  },
  timeText: {
    color: '#666666',
    fontSize: 11,
    fontWeight: '500',
    textAlign: 'right',
    lineHeight: 15,
  },
  timeTextDimmed: {
    color: '#444444',
  },
  timeTextDue: {
    color: '#f97316',
  },
  trackCol: {
    width: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lineSegment: {
    flex: 1,
    width: 1,
    backgroundColor: '#2a2a2a',
  },
  lineSegmentInvisible: {
    backgroundColor: 'transparent',
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginVertical: 2,
  },
  info: {
    flex: 1,
    paddingLeft: 14,
    paddingVertical: 14,
    justifyContent: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  name: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
  doseAmount: {
    color: '#666666',
    fontSize: 13,
    marginTop: 2,
  },
  foodTag: {
    color: '#eab308',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 3,
  },
  skipReasonText: {
    color: '#888888',
    fontSize: 11,
    fontStyle: 'italic',
    marginTop: 3,
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
