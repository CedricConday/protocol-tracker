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
import Svg, { Circle } from 'react-native-svg';

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

// ── Palette ───────────────────────────────────────────────────────────────────
const BG = '#FAF7F4';
const ACCENT = '#C96A50';
const INK = '#2C2420';
const INK_MUTED = '#7A6A62';

// Dose-compliance ring color.
function getComplianceColor(compliancePct: number, totalDoses: number): string {
  if (totalDoses === 0) return '#E8E0D8';
  if (compliancePct >= 80) return '#5A8A5A';
  if (compliancePct >= 50) return '#C4882A';
  return '#C04040';
}

// Health-app style compliance ring: a track plus an arc that fills by compliance %.
// The AMOUNT of ring (not just its hue) encodes compliance, so it reads without color.
const RING_SIZE = 38;
const RING_R = 15;
const RING_STROKE = 3.5;
const RING_C = 2 * Math.PI * RING_R;
function ComplianceRing({ pct, color }: { pct: number; color: string }) {
  const dash = (Math.max(0, Math.min(100, pct)) / 100) * RING_C;
  const c = RING_SIZE / 2;
  return (
    <Svg width={RING_SIZE} height={RING_SIZE} style={StyleSheet.absoluteFill}>
      <Circle cx={c} cy={c} r={RING_R} fill="none" stroke="#EDE4DB" strokeWidth={RING_STROKE} />
      <Circle
        cx={c} cy={c} r={RING_R} fill="none" stroke={color} strokeWidth={RING_STROKE}
        strokeLinecap="round" strokeDasharray={`${dash} ${RING_C}`}
        transform={`rotate(-90 ${c} ${c})`}
      />
    </Svg>
  );
}

// Colorblind-safe markers: distinct SHAPE per data type, not color alone.
// Event → diamond, Journal → square, Water → circle.
const EVENT_COLOR = '#C04040';
const JOURNAL_COLOR = '#7C6FB8';
const WATER_COLOR = '#3B9AE1';

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

  // Month summary strip (all from the already-loaded range map — no extra queries).
  let daysLogged = 0;
  let pctSum = 0;
  let pctCount = 0;
  for (const c of data.values()) {
    if (c.totalDoses > 0 || c.eventCount > 0 || c.hasJournal || c.hasWater || c.started) daysLogged++;
    if (c.totalDoses > 0) { pctSum += c.compliancePct; pctCount++; }
  }
  const avgCompliance = pctCount ? Math.round(pctSum / pctCount) : 0;
  const monthStats = daysLogged ? `${daysLogged} days logged · ${avgCompliance}% avg` : 'No data yet';

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
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ACCENT} />}
    >
      <View style={styles.headerRow}>
        <Text style={styles.heading}>History</Text>
        <TouchableOpacity style={styles.shareButton} onPress={handleShare} activeOpacity={0.8} accessibilityLabel="Share this month" accessibilityRole="button">
          <Text style={styles.shareButtonText}>Share</Text>
        </TouchableOpacity>
      </View>

      {/* Month navigation + summary */}
      <View style={styles.monthNav}>
        <TouchableOpacity onPress={() => shiftMonth(-1)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} accessibilityLabel="Previous month" accessibilityRole="button">
          <Text style={styles.navArrow}>‹</Text>
        </TouchableOpacity>
        <View style={styles.monthTitleWrap}>
          <Text style={styles.monthTitle}>{MONTH_NAMES[viewMonth]} {viewYear}</Text>
          <Text style={styles.monthStats}>{monthStats}</Text>
        </View>
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
                <View key={ci} style={styles.slot}><SkeletonCard height={48} borderRadius={12} /></View>
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
                const isFuture = slot.date > today;
                const hasDoses = !!c && c.totalDoses > 0;
                const hasData = !!c && (c.totalDoses > 0 || c.eventCount > 0 || c.hasJournal || c.hasWater || c.started);
                // Ring: calm cream card, dark legible number, a compliance ring around it.
                // Event/journal/water-only days are still a data card (just no ring).
                const cellBg = hasData ? '#FFFFFF' : 'transparent';
                const cellBorder = hasData ? '#EFE7DF' : 'transparent';
                const textColor = hasData ? INK : (isFuture ? '#D8CFC8' : '#C3B7AD');
                const awareness = getAwarenessDate(slot.date);
                const disabled = isFuture || !hasData;
                return (
                  <TouchableOpacity
                    key={slot.date}
                    style={styles.slot}
                    onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); openDay(slot.date); }}
                    disabled={disabled}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={`${slot.date}${hasDoses ? `, ${c!.compliancePct}% compliance, ${c!.takenDoses} of ${c!.totalDoses} doses taken` : ''}${c && c.eventCount > 0 ? `, ${c.eventCount} event${c.eventCount > 1 ? 's' : ''}` : ''}${c && c.hasJournal ? ', journal entry' : ''}${c && c.hasWater ? ', water logged' : ''}${isToday ? ', today' : ''}${!hasData ? ', no data' : ''}. Tap for details.`}
                  >
                    <View style={[styles.cell, { backgroundColor: cellBg, borderColor: cellBorder }, isToday && styles.cellToday]}>
                      <View style={styles.ringWrap}>
                        {hasDoses && <ComplianceRing pct={c!.compliancePct} color={getComplianceColor(c!.compliancePct, c!.totalDoses)} />}
                        <Text style={[styles.cellText, { color: textColor }]}>{slot.day}</Text>
                      </View>

                      {/* Markers: distinct shape per type (colorblind-safe) */}
                      <View style={styles.markers}>
                        {!!c && c.eventCount > 0 && <View style={styles.markerDiamond} />}
                        {!!c && c.hasJournal && <View style={styles.markerSquare} />}
                        {!!c && c.hasWater && <View style={styles.markerCircle} />}
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
        <View style={styles.legendRow}>
          <View style={styles.legendItem}><View style={[styles.legendChip, { backgroundColor: '#5A8A5A' }]} /><Text style={styles.legendLabel}>≥80%</Text></View>
          <View style={styles.legendItem}><View style={[styles.legendChip, { backgroundColor: '#C4882A' }]} /><Text style={styles.legendLabel}>50–79%</Text></View>
          <View style={styles.legendItem}><View style={[styles.legendChip, { backgroundColor: '#C04040' }]} /><Text style={styles.legendLabel}>&lt;50%</Text></View>
        </View>
        <View style={styles.legendRow}>
          <View style={styles.legendItem}><View style={styles.legendDiamond} /><Text style={styles.legendLabel}>Event</Text></View>
          <View style={styles.legendItem}><View style={styles.legendSquare} /><Text style={styles.legendLabel}>Journal</Text></View>
          <View style={styles.legendItem}><View style={styles.legendCircle} /><Text style={styles.legendLabel}>Water</Text></View>
        </View>
      </View>

      <Modal visible={detailDate !== null} animationType="slide" transparent onRequestClose={closeDay}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.grabber} />
            <View style={styles.detailHeader}>
              <TouchableOpacity onPress={() => stepDay(-1)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityLabel="Previous day" accessibilityRole="button">
                <Text style={styles.detailArrow}>‹</Text>
              </TouchableOpacity>
              <Text style={styles.detailDate}>{detailDate ? formatFullDate(detailDate) : ''}</Text>
              <TouchableOpacity onPress={() => stepDay(1)} disabled={detailDate === today} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityLabel="Next day" accessibilityRole="button">
                <Text style={[styles.detailArrow, detailDate === today && styles.navArrowDisabled]}>›</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.detailBody} contentContainerStyle={{ paddingBottom: 12 }}>
              {!detail ? (
                <Text style={styles.detailMuted}>Loading…</Text>
              ) : (
                <>
                  <View style={styles.detailSectionRow}>
                    <Text style={styles.detailSection}>Doses</Text>
                    {detail.totalDoses > 0 && (
                      <Text style={[styles.detailSummary, { color: getComplianceColor(detail.compliancePct, detail.totalDoses) }]}>
                        {detail.takenDoses}/{detail.totalDoses} · {detail.compliancePct}%
                      </Text>
                    )}
                  </View>
                  {detail.totalDoses === 0 ? (
                    <Text style={styles.detailMuted}>No doses logged this day.</Text>
                  ) : (
                    detail.doses.map((d, i) => (
                      <View key={i} style={styles.detailRow}>
                        <View style={[styles.detailDot, { backgroundColor: DOSE_STATUS_COLOR[d.status] ?? '#7A6A62' }]} />
                        <Text style={styles.detailRowText}>{d.name}</Text>
                        <Text style={styles.detailRowMeta}>{d.status === 'taken' && d.logged_time ? fmtTime(d.logged_time) : d.status}</Text>
                      </View>
                    ))
                  )}

                  <Text style={styles.detailSection}>Journal</Text>
                  {detail.journal ? (
                    <View style={styles.journalCard}>
                      <Text style={styles.detailMood}>{detail.journal.mood}</Text>
                      <Text style={styles.journalNote}>{detail.journal.note || 'No note'}</Text>
                    </View>
                  ) : (
                    <Text style={styles.detailMuted}>No journal entry.</Text>
                  )}

                  <Text style={styles.detailSection}>Events</Text>
                  {detail.events.length === 0 ? (
                    <Text style={styles.detailMuted}>No events logged.</Text>
                  ) : (
                    detail.events.map((e) => (
                      <View key={e.id} style={styles.detailEvent}>
                        <View style={styles.detailEventDiamond} />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.detailEventTitle}>
                            {EVENT_LABEL[e.type] ?? e.type}{e.severity ? ` · severity ${e.severity}` : ''}{e.cortisone_dose_mg ? ` · ${e.cortisone_dose_mg}mg` : ''}
                          </Text>
                          {!!e.notes && <Text style={styles.detailEventNotes}>{e.notes}</Text>}
                        </View>
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
  container: { flex: 1, backgroundColor: BG },
  content: { paddingTop: 60, paddingHorizontal: 20, paddingBottom: 40 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  heading: { color: INK, fontSize: 26, fontWeight: '800', letterSpacing: -0.4 },
  shareButton: { backgroundColor: '#F2EDE8', borderRadius: 11, paddingHorizontal: 16, paddingVertical: 10, borderWidth: 1, borderColor: '#E4DAD1' },
  shareButtonText: { color: ACCENT, fontSize: 14, fontWeight: '700' },

  monthNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  navArrow: { color: ACCENT, fontSize: 32, fontWeight: '700', paddingHorizontal: 8, width: 40, textAlign: 'center' },
  navArrowDisabled: { color: '#E0D6CD' },
  monthTitleWrap: { alignItems: 'center' },
  monthTitle: { color: INK, fontSize: 18, fontWeight: '800' },
  monthStats: { color: '#A8988E', fontSize: 12, fontWeight: '600', marginTop: 1 },

  weekHeader: { flexDirection: 'row', marginTop: 10, marginBottom: 8 },
  weekHeaderCell: { flex: 1, textAlign: 'center', color: '#B7A99E', fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },

  week: { flexDirection: 'row', gap: 6 },
  slot: { flex: 1, aspectRatio: 1 },
  cell: { flex: 1, borderRadius: 12, borderWidth: 1, minHeight: 44, position: 'relative', alignItems: 'center', justifyContent: 'center' },
  cellToday: { borderWidth: 2, borderColor: ACCENT },
  ringWrap: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  cellText: { fontSize: 14, fontWeight: '800' },

  markers: { position: 'absolute', bottom: 3, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3 },
  markerDiamond: { width: 7, height: 7, backgroundColor: EVENT_COLOR, transform: [{ rotate: '45deg' }] },
  markerSquare: { width: 7, height: 7, borderRadius: 2, backgroundColor: JOURNAL_COLOR },
  markerCircle: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: WATER_COLOR },
  awarenessDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#F97316', position: 'absolute', top: 5, right: 5 },

  legend: { paddingTop: 18, marginTop: 4, gap: 10 },
  legendRow: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: 16 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendChip: { width: 11, height: 11, borderRadius: 3 },
  legendDiamond: { width: 9, height: 9, backgroundColor: EVENT_COLOR, transform: [{ rotate: '45deg' }] },
  legendSquare: { width: 9, height: 9, borderRadius: 2, backgroundColor: JOURNAL_COLOR },
  legendCircle: { width: 9, height: 9, borderRadius: 4.5, backgroundColor: WATER_COLOR },
  legendLabel: { color: INK_MUTED, fontSize: 12, fontWeight: '600' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(30,22,18,0.45)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: BG, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 8, paddingHorizontal: 20, paddingBottom: 24, maxHeight: '82%' },
  grabber: { width: 38, height: 4, borderRadius: 3, backgroundColor: '#E0D6CD', alignSelf: 'center', marginBottom: 12 },
  detailHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  detailArrow: { color: ACCENT, fontSize: 28, fontWeight: '700', paddingHorizontal: 8 },
  detailDate: { color: INK, fontSize: 15, fontWeight: '800', flex: 1, textAlign: 'center' },
  detailBody: { marginBottom: 12 },
  detailSectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6, marginBottom: 8 },
  detailSection: { color: '#8A7A70', fontSize: 13, fontWeight: '800', letterSpacing: 0.4, textTransform: 'uppercase', marginTop: 16, marginBottom: 8 },
  detailSummary: { fontSize: 13, fontWeight: '700' },
  detailRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 9, gap: 10, borderBottomWidth: 1, borderBottomColor: '#F0EAE3' },
  detailDot: { width: 9, height: 9, borderRadius: 4.5 },
  detailRowText: { color: INK, fontSize: 14, fontWeight: '600', flex: 1 },
  detailRowMeta: { color: '#9A8A80', fontSize: 13, fontWeight: '600' },
  journalCard: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', backgroundColor: '#F5EEE7', borderRadius: 14, padding: 13 },
  detailMood: { fontSize: 24, lineHeight: 26 },
  journalNote: { color: '#3A302A', fontSize: 14, flex: 1, lineHeight: 20 },
  detailMuted: { color: '#B0A098', fontSize: 14, fontStyle: 'italic', paddingVertical: 2 },
  detailEvent: { flexDirection: 'row', gap: 11, alignItems: 'flex-start', paddingVertical: 11, paddingHorizontal: 14, backgroundColor: '#FBEDEA', borderWidth: 1, borderColor: '#F3D9D3', borderRadius: 14, marginBottom: 8 },
  detailEventDiamond: { width: 10, height: 10, backgroundColor: EVENT_COLOR, transform: [{ rotate: '45deg' }], marginTop: 5 },
  detailEventTitle: { color: '#8F2E2E', fontSize: 14, fontWeight: '800' },
  detailEventNotes: { color: '#6A5850', fontSize: 13, marginTop: 2, lineHeight: 18 },
  detailClose: { backgroundColor: ACCENT, borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  detailCloseText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
});
