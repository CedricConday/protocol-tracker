import { useCallback, useEffect, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { getDaySummary, getWeekSummary, getStreak } from '../db/queries';
import type { DaySummary } from '../types';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function todayDayIndex(): number {
  return ((new Date().getDay() + 6) % 7);
}

function getBoxColor(compliancePct: number, totalDoses: number) {
  if (totalDoses === 0) return '#333333';
  if (compliancePct >= 80) return '#22c55e';
  if (compliancePct >= 50) return '#eab308';
  return '#ef4444';
}

function getComplianceColor(compliancePct: number) {
  if (compliancePct >= 80) return '#22c55e';
  if (compliancePct >= 50) return '#eab308';
  return '#ef4444';
}

export default function SummaryScreen() {
  const [summary, setSummary] = useState<DaySummary | null>(null);
  const [weekData, setWeekData] = useState<{ date: string; compliancePct: number; totalDoses: number }[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [streak, setStreak] = useState(0);

  const loadData = useCallback(async () => {
    const daySummary = await getDaySummary();
    setSummary(daySummary);
    const s = await getStreak();
    setStreak(s);

    const week = await getWeekSummary();
    const enriched = await Promise.all(
      week.map(async (d) => {
        const full = await getDaySummary(d.date);
        return { ...d, totalDoses: full.totalDoses };
      }),
    );
    setWeekData(enriched);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const taken = summary?.takenDoses ?? 0;
  const total = summary?.totalDoses ?? 0;
  const compliancePct = summary?.compliancePct ?? 0;
  const waterMl = summary?.waterMl ?? 0;
  const ringColor = getComplianceColor(compliancePct);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#22c55e" />
      }
    >
      <Text style={styles.heading}>Summary</Text>

      <View style={styles.statRow}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>
            {taken}/{total}
          </Text>
          <Text style={styles.statLabel}>Doses Taken</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{waterMl}</Text>
          <Text style={styles.statLabel}>Water (ml)</Text>
        </View>
      </View>

      {/* Compliance Ring Card */}
      <View style={styles.complianceCard}>
        <Text style={styles.cardDayLabel}>Today</Text>

        {/* Ring */}
        <View style={styles.ringContainer}>
          <View style={[styles.ringOuter, { borderColor: '#2a2a2a' }]}>
            <View style={[styles.ringInnerAccent, { borderColor: ringColor }]} />
            <View style={styles.ringCenter}>
              <Text style={[styles.ringNumber, { color: ringColor }]}>
                {compliancePct}
              </Text>
              <Text style={styles.ringPercent}>%</Text>
            </View>
          </View>
        </View>

        <Text style={styles.complianceLabel}>Compliance</Text>

        {/* Progress bar */}
        <View style={styles.barBg}>
          <View
            style={[
              styles.barFill,
              {
                width: `${Math.min(compliancePct, 100)}%` as `${number}%`,
                backgroundColor: ringColor,
              },
            ]}
          />
        </View>
      </View>

      {/* Streak Card */}
      <View style={styles.streakCard}>
        <Text style={styles.streakValue}>
          {streak === 0 ? '—' : `${streak}`}
          {streak >= 3 ? ' 🔥' : ''}
        </Text>
         <Text style={[styles.streakLabel, streak === 0 ? styles.streakNoData : null]}>
          {streak === 0 ? 'no streak yet' : 'day streak'}
        </Text>
      </View>

      <Text style={styles.sectionTitle}>This Week</Text>
      <View style={styles.weekRow}>
        {weekData.map((d, i) => {
          const isToday = i === todayDayIndex();
          return (
            <View key={d.date} style={styles.dayCol}>
               <View
                 style={[
                   styles.dayBox,
                   { backgroundColor: getBoxColor(d.compliancePct, d.totalDoses) },
                   isToday ? styles.dayBoxToday : null,
                 ]}
               />
               <Text style={[styles.dayLabel, isToday ? styles.dayLabelToday : null]}>
                {WEEKDAYS[i]}
              </Text>
            </View>
          );
        })}
      </View>
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
    marginBottom: 24,
  },
  statRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
  },
  statValue: {
    color: '#ffffff',
    fontSize: 32,
    fontWeight: '800',
  },
  statLabel: {
    color: '#888888',
    fontSize: 13,
    marginTop: 4,
  },
  complianceCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    marginBottom: 16,
  },
  cardDayLabel: {
    color: '#888888',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 16,
  },
  ringContainer: {
    marginBottom: 8,
  },
  ringOuter: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 8,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  ringInnerAccent: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 8,
    borderTopColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: 'transparent',
    transform: [{ rotate: '-45deg' }],
  },
  ringCenter: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  ringNumber: {
    fontSize: 36,
    fontWeight: '800',
    lineHeight: 40,
  },
  ringPercent: {
    color: '#888888',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  complianceLabel: {
    color: '#888888',
    fontSize: 13,
    marginTop: 4,
    marginBottom: 16,
  },
  barBg: {
    width: '100%',
    height: 6,
    backgroundColor: '#2a2a2a',
    borderRadius: 3,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 3,
  },
  streakCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    marginBottom: 24,
  },
  streakValue: {
    color: '#22c55e',
    fontSize: 32,
    fontWeight: '800',
  },
  streakLabel: {
    color: '#888888',
    fontSize: 13,
    marginTop: 4,
  },
  streakNoData: {
    color: '#555555',
  },
  sectionTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  weekRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  dayCol: {
    alignItems: 'center',
    gap: 6,
  },
  dayBox: {
    width: 36,
    height: 36,
    borderRadius: 8,
  },
  dayBoxToday: {
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  dayLabel: {
    color: '#888888',
    fontSize: 11,
    fontWeight: '600',
  },
  dayLabelToday: {
    color: '#ffffff',
  },
});
