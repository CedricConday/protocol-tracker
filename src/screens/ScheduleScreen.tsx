import { useCallback, useEffect, useState } from 'react';
import {
  FlatList,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DoseDetailModal from '../components/DoseDetailModal';
import { confirmDose, getDoseLogs, getDaySummary, getScheduleRules, skipDose } from '../db/queries';
import { useSimpleMode } from '../context/SimpleModeContext';
import { formatDoseTime } from '../engine/scheduler';
import type { DoseLog, DoseStatus, ScheduledDose } from '../types';
import EmptyState from '../components/EmptyState';

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

interface DayCell { date: string; dayNumber: number; compliancePct: number; totalDoses: number; isToday: boolean; }

function buildLast30Days(): string[] {
  const days: string[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    days.push(d.toISOString().split('T')[0]);
  }
  return days;
}

function getCellColor(pct: number, total: number) {
  if (total === 0) return '#E8E0D8';
  if (pct >= 80) return '#5A8A5A';
  if (pct >= 50) return '#C4882A';
  return '#C04040';
}

const statusColors: Record<string, string> = {
  upcoming: '#4A7A9B',
  due: '#C96A50',
  taken: '#5A8A5A',
  missed: '#C04040',
};

const statusLabels: Record<string, string> = {
  upcoming: 'Upcoming',
  due: 'Due now',
  taken: 'Done',
  missed: 'Missed',
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
  const [activeView, setActiveView] = useState<'today' | 'history'>('today');
  const [calCells, setCalCells] = useState<DayCell[]>([]);
  const [calLoaded, setCalLoaded] = useState(false);
  const { isSimple } = useSimpleMode();

  const loadCalendar = useCallback(async () => {
    const dateStrs = buildLast30Days();
    const todayStr = new Date().toISOString().split('T')[0];
    const results = await Promise.all(
      dateStrs.map(async (dateStr) => {
        const summary = await getDaySummary(dateStr);
        return { date: dateStr, dayNumber: new Date(dateStr + 'T12:00:00').getDate(), compliancePct: summary.compliancePct, totalDoses: summary.totalDoses, isToday: dateStr === todayStr };
      }),
    );
    setCalCells(results);
    setCalLoaded(true);
  }, []);

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

  useEffect(() => {
    if (activeView === 'history') loadCalendar();
  }, [activeView, loadCalendar]);

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

  const renderToggle = () => (
    <View style={styles.toggleRow}>
      <TouchableOpacity style={[styles.toggleBtn, activeView === 'today' ? styles.toggleBtnActive : null]} onPress={() => setActiveView('today')} activeOpacity={0.7}>
        <Text style={[styles.toggleBtnText, activeView === 'today' ? styles.toggleBtnTextActive : null]}>Today</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[styles.toggleBtn, activeView === 'history' ? styles.toggleBtnActive : null]} onPress={() => setActiveView('history')} activeOpacity={0.7}>
        <Text style={[styles.toggleBtnText, activeView === 'history' ? styles.toggleBtnTextActive : null]}>History</Text>
      </TouchableOpacity>
    </View>
  );

  if (activeView === 'history') {
    const now = new Date();
    const rows: DayCell[][] = [];
    for (let i = 0; i < calCells.length; i += 6) rows.push(calCells.slice(i, i + 6));
    return (
      <View style={styles.container}>
        <View style={styles.headingRow}>
          <Text style={styles.heading}>{MONTH_NAMES[now.getMonth()]} {now.getFullYear()}</Text>
        </View>
        {renderToggle()}
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
          {calLoaded && rows.map((row, ri) => (
            <View key={ri} style={styles.calRow}>
              {row.map((cell) => {
                const bg = cell.isToday
                  ? (cell.totalDoses === 0 ? '#B0A098' : cell.compliancePct >= 80 ? '#4A7A4A' : cell.compliancePct >= 50 ? '#B07820' : '#A03030')
                  : getCellColor(cell.compliancePct, cell.totalDoses);
                return (
                  <View key={cell.date} style={styles.calCellWrapper}>
                    <View style={[styles.calCell, { backgroundColor: bg }, cell.isToday ? styles.calCellToday : null]}>
                      <Text style={styles.calCellText}>{cell.dayNumber}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          ))}
          <View style={styles.legend}>
            {[['#5A8A5A','≥80%'],['#C4882A','50–79%'],['#C04040','<50%'],['#E8E0D8','No data']].map(([color, label]) => (
              <View key={label} style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: color, borderWidth: color === '#2a2a2a' ? 1 : 0, borderColor: '#444' }]} />
                <Text style={styles.legendLabel}>{label}</Text>
              </View>
            ))}
          </View>
        </ScrollView>
      </View>
    );
  }

  if (loaded && doses.length === 0) {
    return (
      <View style={styles.container}>
        <Text style={styles.heading}>Today's Schedule</Text>
        {renderToggle()}
        <EmptyState
          icon="⏱"
          title="No doses scheduled yet"
          subtitle="Tap 'Start Day' on the Home tab to anchor your schedule and activate dose reminders."
        />
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
      {renderToggle()}

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
          const dotLabel = statusLabels[item.status] ?? item.status;
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

              {/* Timeline track: vertical line + dot + accessible label */}
              {!isSimple && <View style={styles.trackCol}>
                <View style={[styles.lineSegment, isFirst ? styles.lineSegmentInvisible : null]} />
                <View
                  style={[styles.dot, { backgroundColor: dotColor }]}
                  accessibilityLabel={dotLabel}
                  accessibilityRole="image"
                />
                <View style={[styles.lineSegment, isLast ? styles.lineSegmentInvisible : null]} />
              </View>}

              {/* Right: supplement info */}
              <View style={styles.info}>
                <Text style={styles.name}>{item.supplementName}</Text>
                {!isSimple && <Text style={styles.doseAmount}>{item.doseAmount}</Text>}
                {!isSimple && item.withFood && (
                  <Text style={styles.foodTag}>with food</Text>
                )}
                {!isSimple && (
                  <Text style={[styles.statusLabel, { color: dotColor }]}>{dotLabel}</Text>
                )}
                {item.status === 'missed' && item.logId && (
                  <Text style={styles.skipReasonText}>{item.skipReason ?? 'Skipped'}</Text>
                )}

                {isSimple && (
                  <View style={{ marginLeft: 'auto', paddingLeft: 12 }}>
                    {item.status === 'taken' ? (
                      <Text style={{ color: '#5A8A5A', fontWeight: '700' }}>Taken</Text>
                    ) : item.status === 'missed' ? (
                      <Text style={{ color: '#C04040', fontWeight: '700' }}>Missed</Text>
                    ) : (
                      <View style={{ backgroundColor: item.status === 'due' ? '#C96A50' : '#F2EDE8', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, borderWidth: 1, borderColor: '#C96A50' }}>
                        <Text style={{ color: item.status === 'due' ? '#FAF7F4' : '#C96A50', fontWeight: '800', fontSize: 12 }}>{item.status === 'due' ? 'TAKE' : 'WAIT'}</Text>
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
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#C96A50" />
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
    backgroundColor: '#FAF7F4',
    paddingTop: 60,
    paddingHorizontal: 20,
  },
  headingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  heading: {
    color: '#2C2420',
    fontSize: 22,
    fontWeight: '700',
  },
  scanBtn: { backgroundColor: '#F2EDE8', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: '#C96A50' },
  scanBtnText: { color: '#C96A50', fontSize: 13, fontWeight: '600' },
  highDoseBanner: {
    backgroundColor: '#FDF3E0',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#C4882A60',
    padding: 12,
    marginBottom: 12,
  },
  highDoseBannerText: {
    color: '#C4882A',
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
    marginBottom: 8,
  },
  highDoseBannerDismiss: {
    color: '#C4882A',
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
    color: '#7A6A62',
    fontSize: 11,
    fontWeight: '500',
    textAlign: 'right',
    lineHeight: 15,
  },
  timeTextDimmed: {
    color: '#B0A098',
  },
  timeTextDue: {
    color: '#C96A50',
  },
  trackCol: {
    width: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lineSegment: {
    flex: 1,
    width: 1,
    backgroundColor: '#D8CFC8',
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
    borderBottomColor: '#E8E0D8',
  },
  name: {
    color: '#2C2420',
    fontSize: 15,
    fontWeight: '600',
  },
  doseAmount: {
    color: '#7A6A62',
    fontSize: 13,
    marginTop: 2,
  },
  foodTag: {
    color: '#C4882A',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 3,
  },
  skipReasonText: {
    color: '#B0A098',
    fontSize: 11,
    fontStyle: 'italic',
    marginTop: 3,
  },
  statusLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
    marginTop: 4,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  emptyText: {
    color: '#7A6A62',
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },
  toggleRow: { flexDirection: 'row', backgroundColor: '#F2EDE8', borderRadius: 10, padding: 3, marginBottom: 16, borderWidth: 1, borderColor: '#D8CFC8' },
  toggleBtn: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  toggleBtnActive: { backgroundColor: '#FAF7F4' },
  toggleBtnText: { color: '#B0A098', fontSize: 13, fontWeight: '700' },
  toggleBtnTextActive: { color: '#C96A50' },
  calRow: { flexDirection: 'row', gap: 6, marginBottom: 6 },
  calCellWrapper: { flex: 1, aspectRatio: 1 },
  calCell: { flex: 1, borderRadius: 8, alignItems: 'center', justifyContent: 'center', minHeight: 42 },
  calCellToday: { borderWidth: 2, borderColor: '#2C2420' },
  calCellText: { color: '#FAF7F4', fontSize: 12, fontWeight: '700' },
  legend: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: 14, paddingTop: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 9, height: 9, borderRadius: 5 },
  legendLabel: { color: '#7A6A62', fontSize: 11, fontWeight: '500' },
});
