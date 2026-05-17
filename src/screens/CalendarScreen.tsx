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

function getBoxColor(compliancePct: number, totalDoses: number) {
  if (totalDoses === 0) return '#333333';
  if (compliancePct >= 80) return '#22c55e';
  if (compliancePct >= 50) return '#eab308';
  return '#ef4444';
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

      {!loaded ? null : cells.length === 0 ? (
        <Text style={styles.emptyText}>No data yet.</Text>
      ) : (
        <View style={styles.grid}>
          {rows.map((row, ri) => (
            <View key={ri} style={styles.row}>
              {row.map((cell) => (
                <View key={cell.date} style={styles.cellWrapper}>
                  <View
                    style={[
                      styles.cell,
                      { backgroundColor: getBoxColor(cell.compliancePct, cell.totalDoses) },
                      cell.isToday && styles.cellToday,
                    ]}
                  >
                    <Text style={styles.cellText}>{cell.dayNumber}</Text>
                  </View>
                </View>
              ))}
            </View>
          ))}
        </View>
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
    marginBottom: 24,
  },
  emptyText: {
    color: '#888888',
    fontSize: 15,
    textAlign: 'center',
    marginTop: 40,
  },
  grid: {
    gap: 8,
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
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
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
});
