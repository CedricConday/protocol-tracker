import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Alert,
} from 'react-native';
import * as Sharing from 'expo-sharing';
import * as Print from 'expo-print';
import { getDaySummary, getDayDetail, type DayDetail } from '../db/queries';
import SkeletonCard from '../components/SkeletonCard';

const AWARENESS_DATES: Record<string, { label: string; message: string }> = {
  '05-30': {
    label: 'World MS Day',
    message: 'May 30 — World MS Day. You are not alone. 2.9 million people live with MS worldwide.',
  },
  '03-07': {
    label: 'MS Awareness Month',
    message: 'March 7 — Multiple Sclerosis Awareness Month. Raise awareness, share your story.',
  },
  '03-31': {
    label: 'MS Awareness Month End',
    message: 'March 31 — End of MS Awareness Month. Keep spreading knowledge about MS.',
  },
};

function getAwarenessDate(dateStr: string): { label: string; message: string } | null {
  const d = new Date(dateStr + 'T00:00:00');
  const key = `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return AWARENESS_DATES[key] ?? null;
}

const COLS = 6;

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function getBoxColor(compliancePct: number, totalDoses: number) {
  if (totalDoses === 0) return '#E8E0D8';
  if (compliancePct >= 80) return '#5A8A5A';
  if (compliancePct >= 50) return '#C4882A';
  return '#C04040';
}

function getYearColor(compliancePct: number, totalDoses: number) {
  if (totalDoses === 0) return '#E8E0D8';
  if (compliancePct >= 80) return '#22c55e';
  if (compliancePct >= 50) return '#eab308';
  return '#ef4444';
}

function getTodayBrighter(compliancePct: number, totalDoses: number) {
  if (totalDoses === 0) return '#D8CFC8';
  if (compliancePct >= 80) return '#6FA06F';
  if (compliancePct >= 50) return '#D4982A';
  return '#D05050';
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

function buildLast365Days(): string[] {
  const days: string[] = [];
  for (let i = 364; i >= 0; i--) {
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

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function formatFullDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return `${WEEKDAYS[d.getDay()]}, ${MONTH_NAMES[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

function fmtTime(ts: number | null): string {
  if (!ts) return '';
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

const DOSE_STATUS_COLOR: Record<string, string> = {
  taken: '#5A8A5A', missed: '#C04040', due: '#C4882A', upcoming: '#7A6A62',
};

const EVENT_LABEL: Record<string, string> = {
  relapse: 'Relapse', cortisone: 'Cortisone', symptom: 'Symptom', pain: 'Pain',
};

export default function CalendarScreen() {
  const [cells, setCells] = useState<DayCell[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [viewMode, setViewMode] = useState<'30d' | '12m'>('30d');
  const [detailDate, setDetailDate] = useState<string | null>(null);
  const [detail, setDetail] = useState<DayDetail | null>(null);

  const loadData = useCallback(async (mode: '30d' | '12m') => {
    const dateStrs = mode === '30d' ? buildLast30Days() : buildLast365Days();
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

  useFocusEffect(useCallback(() => { loadData(viewMode); }, [loadData, viewMode]));

  useEffect(() => {
    loadData(viewMode);
  }, [viewMode, loadData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData(viewMode);
    setRefreshing(false);
  };

  const openDay = useCallback(async (date: string) => {
    setDetailDate(date);
    setDetail(null);
    try {
      setDetail(await getDayDetail(date));
    } catch {
      setDetail(null);
    }
  }, []);

  const closeDay = useCallback(() => {
    setDetailDate(null);
    setDetail(null);
  }, []);

  const stepDay = useCallback((delta: number) => {
    if (!detailDate) return;
    const d = new Date(detailDate + 'T00:00:00');
    d.setDate(d.getDate() + delta);
    const next = d.toISOString().split('T')[0];
    const today = new Date().toISOString().split('T')[0];
    if (next > today) return;
    openDay(next);
  }, [detailDate, openDay]);

  const rows: DayCell[][] = [];
  for (let i = 0; i < cells.length; i += COLS) {
    rows.push(cells.slice(i, i + COLS));
  }

  // Build year grid data
  const yearMonthRows: { month: number; days: DayCell[] }[] = (() => {
    if (cells.length !== 365) return [];
    const months: { month: number; days: DayCell[] }[] = [];
    for (let i = 0; i < 12; i++) {
      const m = new Date();
      m.setMonth(m.getMonth() - 11 + i);
      const month = m.getMonth();
      const year = m.getFullYear();
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const monthCells = cells.filter((c) => {
        const d = new Date(c.date);
        return d.getMonth() === month && d.getFullYear() === year;
      });
      // Pad to fill the row
      months.push({ month, days: monthCells });
    }
    return months;
  })();

    const handleShare = async () => {
      try {
        const htmlRows = cells
          .map((c) => {
            const date = new Date(c.date);
            const dayName = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][date.getDay()];
            return `<tr>
              <td style="border:1px solid #333;padding:8px;text-align:center;">${dayName}<br/>${c.date}</td>
              <td style="border:1px solid #333;padding:8px;text-align:center;background-color:${getBoxColor(c.compliancePct, c.totalDoses)};color:white;">
                ${c.compliancePct}%<br/>${c.totalDoses} doses
              </td>
            </tr>`;
          })
          .join('');
        
        const html = `
          <html><body style="background:#FAF7F4;color:#2C2420;font-family:sans-serif;padding:20px">
            <h1 style="color:#C96A50">Compliance Calendar</h1>
            <p style="color:#7A6A62;margin-bottom:16px">Last ${viewMode === '30d' ? '30 days' : '12 months'}</p>
            <table style="width:100%;border-collapse:collapse;font-size:14px">
              <thead>
                <tr style="background:#F2EDE8">
                  <th style="border:1px solid #D8CFC8;padding:8px;">Date</th>
                  <th style="border:1px solid #333;padding:8px;">Compliance / Doses</th>
                </tr>
              </thead>
              <tbody>${htmlRows}</tbody>
            </table>
          </body></html>`;
        
        const { uri } = await Print.printToFileAsync({ html });
        await Sharing.shareAsync(uri, { mimeType: 'text/html' });
      } catch (e) {
        Alert.alert('Share Failed', e instanceof Error ? e.message : 'Unknown error');
      }
    };

    return (
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#C96A50" />
        }
      >
        <View style={styles.headerRow}>
          <Text style={styles.heading}>History</Text>
          <TouchableOpacity style={styles.shareButton} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); handleShare(); }} activeOpacity={0.8} accessibilityLabel="Share calendar" accessibilityRole="button">
            <Text style={styles.shareButtonText}>Share</Text>
          </TouchableOpacity>
        </View>

      {/* View Toggle */}
      <View style={styles.toggleRow}>
        <TouchableOpacity
          style={[styles.toggleBtn, viewMode === '30d' && styles.toggleBtnActive]}
          onPress={() => setViewMode('30d')}
          activeOpacity={0.7}
          accessibilityLabel="Show last 30 days"
          accessibilityRole="button"
        >
          <Text style={[styles.toggleBtnText, viewMode === '30d' && styles.toggleBtnTextActive]}>30 Days</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.toggleBtn, viewMode === '12m' && styles.toggleBtnActive]}
          onPress={() => setViewMode('12m')}
          activeOpacity={0.7}
          accessibilityLabel="Show last 12 months"
          accessibilityRole="button"
        >
          <Text style={[styles.toggleBtnText, viewMode === '12m' && styles.toggleBtnTextActive]}>12 Months</Text>
        </TouchableOpacity>
      </View>

      {/* Month / year header */}
      <Text style={styles.monthHeader}>{viewMode === '30d' ? getCurrentMonthYear() : 'Last 12 Months'}</Text>

      {!loaded ? (
        <View style={styles.grid}>
          {Array.from({ length: 5 }).map((_, ri) => (
            <View key={ri} style={styles.row}>
              {Array.from({ length: 6 }).map((_, ci) => (
                <View key={ci} style={styles.cellWrapper}>
                  <SkeletonCard height={48} borderRadius={10} />
                </View>
              ))}
            </View>
          ))}
        </View>
      ) : cells.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyIcon}>📊</Text>
          <Text style={styles.emptyTitle}>No History Yet</Text>
          <Text style={styles.emptyText}>
            Start your day from the Home tab to begin tracking your compliance.
          </Text>
        </View>
      ) : viewMode === '30d' ? (
        <View style={styles.grid}>
          {rows.map((row, ri) => (
            <View key={ri} style={styles.row}>
              {row.map((cell) => {
                const bgColor = cell.isToday
                  ? getTodayBrighter(cell.compliancePct, cell.totalDoses)
                  : getBoxColor(cell.compliancePct, cell.totalDoses);
                const awareness = getAwarenessDate(cell.date);
                return (
                  <TouchableOpacity
                    key={cell.date}
                    style={styles.cellWrapper}
                    onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); openDay(cell.date); }}
                    activeOpacity={0.7}
                    accessibilityLabel={`${cell.date}, ${cell.compliancePct} percent compliance, ${cell.totalDoses} doses${cell.isToday ? ', today' : ''}${awareness ? `, ${awareness.label}` : ''}. Tap for details.`}
                    accessibilityRole="button"
                  >
                    <View
                      style={[
                        styles.cell,
                        { backgroundColor: bgColor },
                        cell.isToday ? styles.cellToday : null,
                      ]}
                    >
                      <Text style={styles.cellText}>{cell.dayNumber}</Text>
                    </View>
                    {awareness && <View style={styles.awarenessDot} />}
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}
        </View>
      ) : (
        <View style={styles.yearGrid}>
          {yearMonthRows.map((m) => (
            <View key={m.month} style={styles.yearRow}>
              <Text style={styles.yearMonthLabel}>{MONTH_ABBR[m.month]}</Text>
              <View style={styles.yearCells}>
                {m.days.map((d) => (
                  <View
                    key={d.date}
                    style={[styles.yearCell, { backgroundColor: getYearColor(d.compliancePct, d.totalDoses) }]}
                  />
                ))}
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Legend */}
      {viewMode === '12m' ? (
        <View style={styles.legend}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#22c55e' }]} />
            <Text style={styles.legendLabel}>Good</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#eab308' }]} />
            <Text style={styles.legendLabel}>Fair</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#ef4444' }]} />
            <Text style={styles.legendLabel}>Missed</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#E8E0D8', borderWidth: 1, borderColor: '#D8CFC8' }]} />
            <Text style={styles.legendLabel}>No data</Text>
          </View>
        </View>
      ) : (
        <View style={styles.legend}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#5A8A5A' }]} />
            <Text style={styles.legendLabel}>≥80%</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#C4882A' }]} />
            <Text style={styles.legendLabel}>50–79%</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#C04040' }]} />
            <Text style={styles.legendLabel}>{'<'}50%</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#E8E0D8', borderWidth: 1, borderColor: '#D8CFC8' }]} />
            <Text style={styles.legendLabel}>No data</Text>
          </View>
        </View>
      )}

      <Modal visible={detailDate !== null} animationType="slide" transparent onRequestClose={closeDay}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.detailHeader}>
              <TouchableOpacity onPress={() => stepDay(-1)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityLabel="Previous day" accessibilityRole="button">
                <Text style={styles.detailArrow}>‹</Text>
              </TouchableOpacity>
              <Text style={styles.detailDate}>{detailDate ? formatFullDate(detailDate) : ''}</Text>
              <TouchableOpacity onPress={() => stepDay(1)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityLabel="Next day" accessibilityRole="button">
                <Text style={styles.detailArrow}>›</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.detailBody} contentContainerStyle={{ paddingBottom: 12 }}>
              {!detail ? (
                <Text style={styles.detailMuted}>Loading…</Text>
              ) : (
                <>
                  <Text style={styles.detailSection}>💊 Pills</Text>
                  {detail.totalDoses === 0 ? (
                    <Text style={styles.detailMuted}>No doses scheduled.</Text>
                  ) : (
                    <>
                      <Text style={styles.detailSummary}>{detail.takenDoses}/{detail.totalDoses} taken · {detail.compliancePct}%</Text>
                      {detail.doses.map((d, i) => (
                        <View key={i} style={styles.detailRow}>
                          <View style={[styles.detailDot, { backgroundColor: DOSE_STATUS_COLOR[d.status] ?? '#7A6A62' }]} />
                          <Text style={styles.detailRowText}>{d.name}</Text>
                          <Text style={styles.detailRowMeta}>{d.status === 'taken' && d.logged_time ? fmtTime(d.logged_time) : d.status}</Text>
                        </View>
                      ))}
                    </>
                  )}

                  <Text style={styles.detailSection}>📓 Journal</Text>
                  {detail.journal ? (
                    <View style={styles.detailRow}>
                      <Text style={styles.detailMood}>{detail.journal.mood}</Text>
                      <Text style={styles.detailRowText}>{detail.journal.note || 'No note'}</Text>
                    </View>
                  ) : (
                    <Text style={styles.detailMuted}>No journal entry.</Text>
                  )}

                  <Text style={styles.detailSection}>📌 Events</Text>
                  {detail.events.length === 0 ? (
                    <Text style={styles.detailMuted}>No events logged.</Text>
                  ) : (
                    detail.events.map((e) => (
                      <View key={e.id} style={styles.detailEvent}>
                        <Text style={styles.detailEventTitle}>
                          {EVENT_LABEL[e.type] ?? e.type}{e.severity ? ` · severity ${e.severity}` : ''}{e.cortisone_dose_mg ? ` · ${e.cortisone_dose_mg}mg` : ''}
                        </Text>
                        {!!e.notes && <Text style={styles.detailRowText}>{e.notes}</Text>}
                      </View>
                    ))
                  )}
                </>
              )}
            </ScrollView>

            <TouchableOpacity style={styles.detailClose} onPress={closeDay} accessibilityLabel="Close" accessibilityRole="button">
              <Text style={styles.detailCloseText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAF7F4',
  },
  content: {
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  heading: {
    color: '#2C2420',
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 4,
  },
  monthHeader: {
    color: '#7A6A62',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 20,
    letterSpacing: 0.3,
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
    color: '#2C2420',
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 6,
  },
  emptyText: {
    color: '#7A6A62',
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
    minHeight: 48,
    minWidth: 48,
  },
  cellToday: {
    borderWidth: 2,
    borderColor: '#C96A50',
  },
  awarenessDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#F97316',
    position: 'absolute',
    bottom: 4,
  },
  cellText: {
    color: '#FAF7F4',
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
    color: '#7A6A62',
    fontSize: 12,
    fontWeight: '500',
  },
  toggleRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  toggleBtn: { flex: 1, borderRadius: 10, borderWidth: 1, borderColor: '#D8CFC8', paddingVertical: 10, alignItems: 'center', backgroundColor: '#F2EDE8' },
  toggleBtnActive: { borderColor: '#C96A50', backgroundColor: '#FBF0ED' },
  toggleBtnText: { color: '#7A6A62', fontSize: 14, fontWeight: '600' },
  toggleBtnTextActive: { color: '#C96A50', fontWeight: '700' },
  yearGrid: { gap: 4, marginBottom: 24 },
  yearRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  yearMonthLabel: { width: 32, color: '#7A6A62', fontSize: 10, fontWeight: '600', textAlign: 'right' },
  yearCells: { flexDirection: 'row', flexWrap: 'wrap', gap: 2 },
  yearCell: { width: 8, height: 8, borderRadius: 2 },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  shareButton: {
    backgroundColor: '#F2EDE8',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#D8CFC8',
  },
  shareButtonText: {
    color: '#C96A50',
    fontSize: 15,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#FAF7F4',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 16,
    paddingHorizontal: 20,
    paddingBottom: 24,
    maxHeight: '80%',
  },
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  detailArrow: {
    color: '#C96A50',
    fontSize: 30,
    fontWeight: '700',
    paddingHorizontal: 8,
  },
  detailDate: {
    color: '#2C2420',
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
    textAlign: 'center',
  },
  detailBody: {
    marginBottom: 12,
  },
  detailSection: {
    color: '#2C2420',
    fontSize: 15,
    fontWeight: '700',
    marginTop: 14,
    marginBottom: 6,
  },
  detailSummary: {
    color: '#7A6A62',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    gap: 8,
  },
  detailDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  detailRowText: {
    color: '#2C2420',
    fontSize: 14,
    flex: 1,
  },
  detailRowMeta: {
    color: '#7A6A62',
    fontSize: 12,
  },
  detailMood: {
    fontSize: 20,
  },
  detailMuted: {
    color: '#B0A098',
    fontSize: 13,
    fontStyle: 'italic',
    paddingVertical: 2,
  },
  detailEvent: {
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: '#EFE9E3',
  },
  detailEventTitle: {
    color: '#2C2420',
    fontSize: 14,
    fontWeight: '600',
  },
  detailClose: {
    backgroundColor: '#C96A50',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  detailCloseText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
