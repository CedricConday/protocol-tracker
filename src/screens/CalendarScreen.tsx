import { useCallback, useEffect, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { getDaySummary } from '../db/queries';

const COLS = 6;

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function getBoxColor(compliancePct: number, totalDoses: number) {
  if (totalDoses === 0) return '#2a2a2a';
  if (compliancePct >= 80) return '#22c55e';
  if (compliancePct >= 50) return '#eab308';
  return '#ef4444';
}

function getTodayBrighter(compliancePct: number, totalDoses: number) {
  if (totalDoses === 0) return '#3a3a3a';
  if (compliancePct >= 80) return '#34d974';
  if (compliancePct >= 50) return '#f5c842';
  return '#f76060';
}

interface DayCell {
  date: string;
  dayNumber: number;
  compliancePct: number;
  totalDoses: number;
  isToday: boolean;
}

function buildLast30Days(): string[] {
  const days: string[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().split('T')[0]);
  }
  return days;
}

function getCurrentMonthYear(): string {
  const now = new Date();
  return `${MONTH_NAMES[now.getMonth()]} ${now.getFullYear()}`;
}

export default function CalendarScreen() {
  const [cells, setCells] = useState<DayCell[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const loadMonth = useCallback(async () => {
    const dateStrs = buildLast30Days();
    const todayStr = new Date().toISOString().split('T')[0];
    const results = await Promise.all(
      dateStrs.map(async (dateStr) => {
        const summary = await getDaySummary(dateStr);
        return {
          date: dateStr,
          dayNumber: new Date(dateStr).getDate(),
          compliancePct: summary.compliancePct,
          totalDoses: summary.totalDoses,
          isToday: dateStr === todayStr,
        };
      }),
    );
    setCells(results);
    setLoaded(true);
  }, []);

  useEffect(() => {
    loadMonth();
  }, [loadMonth]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadMonth();
    setRefreshing(false);
  };

  const rows: DayCell[][] = [];
  for (let i = 0; i < cells.length; i += COLS) {
    rows.push(cells.slice(i, i + COLS));
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
      <Text style={styles.heading}>History</Text>

      {/* Month / year header */}
      <Text style={styles.monthHeader}>{getCurrentMonthYear()}</Text>

      {!loaded ? null : cells.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyIcon}>📊</Text>
          <Text style={styles.emptyTitle}>No History Yet</Text>
          <Text style={styles.emptyText}>
            Start your day from the Home tab to begin tracking your compliance.
          </Text>
        </View>
      ) : (
        <View style={styles.grid}>
          {rows.map((row, ri) => (
            <View key={ri} style={styles.row}>
              {row.map((cell) => {
                const bgColor = cell.isToday
                  ? getTodayBrighter(cell.compliancePct, cell.totalDoses)
                  : getBoxColor(cell.compliancePct, cell.totalDoses);
                return (
                  <View key={cell.date} style={styles.cellWrapper}>
                    <View
                      style={[
                        styles.cell,
                        { backgroundColor: bgColor },
                        cell.isToday ? styles.cellToday : null,
                      ]}
                    >
                      <Text style={styles.cellText}>{cell.dayNumber}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          ))}
        </View>
      )}

      {/* Legend */}
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#22c55e' }]} />
          <Text style={styles.legendLabel}>≥80%</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#eab308' }]} />
          <Text style={styles.legendLabel}>50–79%</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#ef4444' }]} />
          <Text style={styles.legendLabel}>{'<'}50%</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#2a2a2a', borderWidth: 1, borderColor: '#444' }]} />
          <Text style={styles.legendLabel}>No data</Text>
        </View>
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
    marginBottom: 4,
  },
  monthHeader: {
    color: '#888888',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 20,
    letterSpacing: 0.5,
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
  grid: {
    gap: 8,
    marginBottom: 24,
  },
  row: {
    flexDirection: 'row',
    gap: 8,
  },
  cellWrapper: {
    flex: 1,
    aspectRatio: 1,
  },
  cell: {
    flex: 1,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  cellToday: {
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  cellText: {
    color: '#0d0d0d',
    fontSize: 13,
    fontWeight: '700',
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 16,
    paddingTop: 4,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendLabel: {
    color: '#666666',
    fontSize: 12,
    fontWeight: '500',
  },
});
