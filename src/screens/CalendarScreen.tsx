import * as Haptics from 'expo-haptics';
import { useCallback, useState } from 'react';
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
import { getCalendarMonth, getDayDetail, localDateStr, todayStr, type CalendarDay, type DayDetail } from '../db/queries';
import SkeletonCard from '../components/SkeletonCard';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// Monday-first, matching the PWA calendar.
const WEEKDAY_HEADERS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Monday-first offset for the 1st of the month (0 = Monday … 6 = Sunday).
function mondayOffset(year: number, month: number): number {
  return (new Date(year, month, 1).getDay() + 6) % 7;
}

const AWARENESS_DATES: Record<string, { label: string; message: string }> = {
  '05-30': { label: 'World MS Day', message: 'May 30 — World MS Day.' },
  '03-07': { label: 'MS Awareness Month', message: 'March 7 — MS Awareness Month.' },
  '03-31': { label: 'MS Awareness Month End', message: 'March 31 — End of MS Awareness Month.' },
};
function getAwarenessDate(dateStr: string): { label: string; message: string } | null {
  const d = new Date(dateStr + 'T00:00:00');
  const key = `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return AWARENESS_DATES[key] ?? null;
}

// Dose-compliance cell background.
function getBoxColor(compliancePct: number, totalDoses: number) {
  if (totalDoses === 0) return '#E8E0D8';
  if (compliancePct >= 80) return '#5A8A5A';
  if (compliancePct >= 50) return '#C4882A';
  return '#C04040';
}
function getTodayBrighter(compliancePct: number, totalDoses: number) {
  if (totalDoses === 0) return '#D8CFC8';
  if (compliancePct >= 80) return '#6FA06F';
  if (compliancePct >= 50) return '#D4982A';
  return '#D05050';
}

const EVENT_DOT = '#C04040';
const JOURNAL_DOT = '#7C6FB8';
const WATER_DOT = '#3B9AE1';

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

// One slot in the month grid — either a real day or a leading/trailing blank.
type Slot = { date: string; day: number } | null;

export default function CalendarScreen() {
  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());
  const [data, setData] = useState<Map<string, CalendarDay>>(new Map());
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [detailDate, setDetailDate] = useState<string | null>(null);
  const [detail, setDetail] = useState<DayDetail | null>(null);

  const loadMonth = useCallback(async (year: number, month: number) => {
    const map = await getCalendarMonth(year, month);
    setData(map);
    setLoaded(true);
  }, []);

  useFocusEffect(useCallback(() => { loadMonth(viewYear, viewMonth); }, [loadMonth, viewYear, viewMonth]));

  const onRefresh = async () => {
    setRefreshing(true);
    await loadMonth(viewYear, viewMonth);
    setRefreshing(false);
  };

  const shiftMonth = (delta: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    let m = viewMonth + delta;
    let y = viewYear;
    if (m < 0) { m = 11; y -= 1; }
    else if (m > 11) { m = 0; y += 1; }
    // Don't page past the current month (no future data).
    if (y > now.getFullYear() || (y === now.getFullYear() && m > now.getMonth())) return;
    setViewYear(y);
    setViewMonth(m);
  };
  const canGoNext = !(viewYear === now.getFullYear() && viewMonth === now.getMonth());

  const openDay = useCallback(async (date: string) => {
    setDetailDate(date);
    setDetail(null);
    try { setDetail(await getDayDetail(date)); } catch { setDetail(null); }
  }, []);
  const closeDay = useCallback(() => { setDetailDate(null); setDetail(null); }, []);
  const stepDay = useCallback((delta: number) => {
    if (!detailDate) return;
    const d = new Date(detailDate + 'T00:00:00');
    d.setDate(d.getDate() + delta);
    const next = localDateStr(d);
    if (next > todayStr()) return;
    openDay(next);
  }, [detailDate, openDay]);

  // Build the month grid: leading blanks + each day.
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const offset = mondayOffset(viewYear, viewMonth);
  const mm = String(viewMonth + 1).padStart(2, '0');
  const today = todayStr();
  const slots: Slot[] = [];
  for (let i = 0; i < offset; i++) slots.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    slots.push({ date: `${viewYear}-${mm}-${String(d).padStart(2, '0')}`, day: d });
  }
  while (slots.length % 7 !== 0) slots.push(null);
  const weeks: Slot[][] = [];
  for (let i = 0; i < slots.length; i += 7) weeks.push(slots.slice(i, i + 7));

  const handleShare = async () => {
    try {
      const rows = Array.from(data.values())
        .filter((c) => c.totalDoses > 0 || c.eventCount > 0 || c.hasJournal || c.hasWater)
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((c) => {
          const d = new Date(c.date + 'T00:00:00');
          const bits = [
            c.totalDoses > 0 ? `${c.compliancePct}% (${c.takenDoses}/${c.totalDoses})` : '—',
            c.eventCount > 0 ? `${c.eventCount} event(s)` : '',
            c.hasJournal ? 'journal' : '',
          ].filter(Boolean).join(' · ');
          return `<tr><td style="border:1px solid #333;padding:8px">${WEEKDAYS[d.getDay()]} ${c.date}</td><td style="border:1px solid #333;padding:8px">${bits}</td></tr>`;
        })
        .join('');
      const html = `<html><body style="background:#FAF7F4;color:#2C2420;font-family:sans-serif;padding:20px">
        <h1 style="color:#C96A50">${MONTH_NAMES[viewMonth]} ${viewYear}</h1>
        <table style="width:100%;border-collapse:collapse;font-size:14px"><tbody>${rows || '<tr><td>No data this month</td></tr>'}</tbody></table>
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
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#C96A50" />}
    >
      <View style={styles.headerRow}>
        <Text style={styles.heading}>History</Text>
        <TouchableOpacity style={styles.shareButton} onPress={handleShare} activeOpacity={0.8} accessibilityLabel="Share this month" accessibilityRole="button">
          <Text style={styles.shareButtonText}>Share</Text>
        </TouchableOpacity>
      </View>

      {/* Month navigation */}
      <View style={styles.monthNav}>
        <TouchableOpacity onPress={() => shiftMonth(-1)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} accessibilityLabel="Previous month" accessibilityRole="button">
          <Text style={styles.navArrow}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.monthTitle}>{MONTH_NAMES[viewMonth]} {viewYear}</Text>
        <TouchableOpacity onPress={() => shiftMonth(1)} disabled={!canGoNext} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} accessibilityLabel="Next month" accessibilityRole="button">
          <Text style={[styles.navArrow, !canGoNext && styles.navArrowDisabled]}>›</Text>
        </TouchableOpacity>
      </View>

      {/* Weekday header */}
      <View style={styles.weekHeader}>
        {WEEKDAY_HEADERS.map((w) => (
          <Text key={w} style={styles.weekHeaderCell}>{w}</Text>
        ))}
      </View>

      {!loaded ? (
        <View style={{ gap: 6 }}>
          {Array.from({ length: 5 }).map((_, ri) => (
            <View key={ri} style={styles.week}>
              {Array.from({ length: 7 }).map((_, ci) => (
                <View key={ci} style={styles.slot}><SkeletonCard height={44} borderRadius={8} /></View>
              ))}
            </View>
          ))}
        </View>
      ) : (
        <View style={{ gap: 6 }}>
          {weeks.map((week, wi) => (
            <View key={wi} style={styles.week}>
              {week.map((slot, si) => {
                if (!slot) return <View key={`b${si}`} style={styles.slot} />;
                const c = data.get(slot.date);
                const isToday = slot.date === today;
                const hasDoses = !!c && c.totalDoses > 0;
                const hasData = !!c && (c.totalDoses > 0 || c.eventCount > 0 || c.hasJournal || c.hasWater || c.started);
                const bg = hasDoses
                  ? (isToday ? getTodayBrighter(c!.compliancePct, c!.totalDoses) : getBoxColor(c!.compliancePct, c!.totalDoses))
                  : (hasData ? '#F2EDE8' : 'transparent');
                const textColor = hasDoses ? '#FAF7F4' : (hasData ? '#2C2420' : '#B7ABA2');
                const awareness = getAwarenessDate(slot.date);
                return (
                  <TouchableOpacity
                    key={slot.date}
                    style={styles.slot}
                    onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); openDay(slot.date); }}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={`${slot.date}${hasDoses ? `, ${c!.compliancePct}% compliance` : ''}${c && c.eventCount > 0 ? `, ${c.eventCount} event${c.eventCount > 1 ? 's' : ''}` : ''}${c && c.hasJournal ? ', journal entry' : ''}${isToday ? ', today' : ''}. Tap for details.`}
                  >
                    <View style={[styles.cell, { backgroundColor: bg }, isToday && styles.cellToday]}>
                      <Text style={[styles.cellText, { color: textColor }]}>{slot.day}</Text>
                      <View style={styles.dots}>
                        {!!c && c.eventCount > 0 && <View style={[styles.dot, { backgroundColor: EVENT_DOT }]} />}
                        {!!c && c.hasJournal && <View style={[styles.dot, { backgroundColor: JOURNAL_DOT }]} />}
                        {!!c && c.hasWater && <View style={[styles.dot, { backgroundColor: WATER_DOT }]} />}
                      </View>
                      {awareness && <View style={styles.awarenessDot} />}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}
        </View>
      )}

      {/* Legend */}
      <View style={styles.legend}>
        <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: '#5A8A5A' }]} /><Text style={styles.legendLabel}>≥80% pills</Text></View>
        <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: EVENT_DOT }]} /><Text style={styles.legendLabel}>Event</Text></View>
        <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: JOURNAL_DOT }]} /><Text style={styles.legendLabel}>Journal</Text></View>
        <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: WATER_DOT }]} /><Text style={styles.legendLabel}>Water</Text></View>
      </View>

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
  container: { flex: 1, backgroundColor: '#FAF7F4' },
  content: { paddingTop: 60, paddingHorizontal: 20, paddingBottom: 40 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  heading: { color: '#2C2420', fontSize: 22, fontWeight: '700' },
  shareButton: { backgroundColor: '#F2EDE8', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10, borderWidth: 1, borderColor: '#D8CFC8' },
  shareButtonText: { color: '#C96A50', fontSize: 15, fontWeight: '600' },

  monthNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  navArrow: { color: '#C96A50', fontSize: 30, fontWeight: '700', paddingHorizontal: 12 },
  navArrowDisabled: { color: '#D8CFC8' },
  monthTitle: { color: '#2C2420', fontSize: 16, fontWeight: '700' },

  weekHeader: { flexDirection: 'row', marginBottom: 8 },
  weekHeaderCell: { flex: 1, textAlign: 'center', color: '#B0A098', fontSize: 11, fontWeight: '700' },

  week: { flexDirection: 'row', gap: 6 },
  slot: { flex: 1, aspectRatio: 1 },
  cell: { flex: 1, borderRadius: 8, alignItems: 'center', justifyContent: 'center', minHeight: 40 },
  cellToday: { borderWidth: 2, borderColor: '#C96A50' },
  cellText: { fontSize: 13, fontWeight: '700' },
  dots: { flexDirection: 'row', gap: 2, position: 'absolute', bottom: 4 },
  dot: { width: 5, height: 5, borderRadius: 2.5 },
  awarenessDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: '#F97316', position: 'absolute', top: 4, right: 4 },

  legend: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: 14, paddingTop: 16 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 9, height: 9, borderRadius: 4.5 },
  legendLabel: { color: '#7A6A62', fontSize: 12, fontWeight: '500' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: '#FAF7F4', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 16, paddingHorizontal: 20, paddingBottom: 24, maxHeight: '80%' },
  detailHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  detailArrow: { color: '#C96A50', fontSize: 30, fontWeight: '700', paddingHorizontal: 8 },
  detailDate: { color: '#2C2420', fontSize: 16, fontWeight: '700', flex: 1, textAlign: 'center' },
  detailBody: { marginBottom: 12 },
  detailSection: { color: '#2C2420', fontSize: 15, fontWeight: '700', marginTop: 14, marginBottom: 6 },
  detailSummary: { color: '#7A6A62', fontSize: 13, fontWeight: '600', marginBottom: 6 },
  detailRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4, gap: 8 },
  detailDot: { width: 8, height: 8, borderRadius: 4 },
  detailRowText: { color: '#2C2420', fontSize: 14, flex: 1 },
  detailRowMeta: { color: '#7A6A62', fontSize: 12 },
  detailMood: { fontSize: 20 },
  detailMuted: { color: '#B0A098', fontSize: 13, fontStyle: 'italic', paddingVertical: 2 },
  detailEvent: { paddingVertical: 6, borderTopWidth: 1, borderTopColor: '#EFE9E3' },
  detailEventTitle: { color: '#2C2420', fontSize: 14, fontWeight: '600' },
  detailClose: { backgroundColor: '#C96A50', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  detailCloseText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
});
