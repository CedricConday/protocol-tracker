import { useCallback, useEffect, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { getDaySummary, getWeekSummary } from '../db/queries';
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

export default function SummaryScreen() {
  const [summary, setSummary] = useState<DaySummary | null>(null);
  const [weekData, setWeekData] = useState<{ date: string; compliancePct: number; totalDoses: number }[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    const daySummary = await getDaySummary();
    setSummary(daySummary);

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

      <View style={styles.complianceCard}>
        <Text style={styles.complianceValue}>{compliancePct}%</Text>
        <Text style={styles.complianceLabel}>Compliance</Text>
        <View style={styles.barBg}>
          <View
            style={[
              styles.barFill,
              {
                width: `${Math.min(compliancePct, 100)}%` as unknown as number,
                backgroundColor: getBoxColor(compliancePct, total),
              },
            ]}
          />
        </View>
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
                  isToday && styles.dayBoxToday,
                ]}
              />
              <Text style={[styles.dayLabel, isToday && styles.dayLabelToday]}>
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
    marginBottom: 24,
  },
  complianceValue: {
    color: '#22c55e',
    fontSize: 40,
    fontWeight: '800',
  },
  complianceLabel: {
    color: '#888888',
    fontSize: 13,
    marginTop: 2,
    marginBottom: 12,
  },
  barBg: {
    width: '100%',
    height: 8,
    backgroundColor: '#333333',
    borderRadius: 4,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 4,
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
