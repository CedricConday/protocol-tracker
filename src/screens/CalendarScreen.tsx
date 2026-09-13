import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import {
  Animated,
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
import { confirmDose, getCalendarMonth, getDayDetail, localDateStr, skipDose, skipDoseWithReason, todayStr, type CalendarDay, type DayDetail, type DayDetailDose } from '../db/queries';
import DoseDetailModal from '../components/DoseDetailModal';
import type { ScheduledDose } from '../types';
import SkeletonCard from '../components/SkeletonCard';
import Svg, { Circle } from 'react-native-svg';
import { useSummaryScreen } from '../hooks';
import { getMiscFlag } from '../db/queries';
import { getProfileById } from '../data/diseaseProfiles';
import { t } from '../i18n';

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
const BG = '#F7F7F2';
const ACCENT = '#1B58B8';
const INK = '#14213D';
const INK_MUTED = '#5A6478';

// The moved compliance block keeps its own palette. It came off the Records tab
// (2026-09-13): compliance is history, so it now sits under the history the
// calendar is already showing, and the tab it left became Trackers.
function getComplianceStatusColor(compliancePct: number) {
  if (compliancePct >= 80) return '#22c55e';
  if (compliancePct >= 50) return '#eab308';
  return '#ef4444';
}

// Dose-compliance ring color.
function getComplianceColor(compliancePct: number, totalDoses: number): string {
  if (totalDoses === 0) return '#DBDDD3';
  if (compliancePct >= 80) return '#2F8F5B';
  if (compliancePct >= 50) return '#F2B233';
  return '#C0392B';
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
const EVENT_COLOR = '#C0392B';
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
  taken: '#2F8F5B', missed: '#C0392B', skipped: '#9AA3B2', due: '#F2B233', upcoming: '#5A6478',
};
const EVENT_LABEL: Record<string, string> = {
  relapse: 'Relapse', cortisone: 'Cortisone', symptom: 'Symptom', pain: 'Pain',
};

// One slot in the month grid — either a real day or a leading/trailing blank.
type Slot = { date: string; day: number } | null;

// How far forward the month pager may browse. Events, appointments and MRI dates
// are routinely saved against a future date, and the grid used to stop dead at
// the current month, so those days could not be reached to be opened at all.
// Bounded rather than open-ended: an unbounded pager wanders into empty decades,
// and a year covers every scheduled event this app writes.
const FORWARD_MONTHS = 12;

export default function CalendarScreen() {
  const navigation = useNavigation<any>();
  const {
    summary, streak, adherenceScore, loadData: loadCompliance,
  } = useSummaryScreen();
  const [profileBlurb, setProfileBlurb] = useState<string | null>(null);
  const barContainerWidth = useRef(0);
  const barAnim = useRef(new Animated.Value(0)).current;
  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());
  const [data, setData] = useState<Map<string, CalendarDay>>(new Map());
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [detailDate, setDetailDate] = useState<string | null>(null);
  const [detail, setDetail] = useState<DayDetail | null>(null);
  const [selectedDose, setSelectedDose] = useState<DayDetailDose | null>(null);
  const horizon = new Date(now.getFullYear(), now.getMonth() + FORWARD_MONTHS, 1);
  const horizonYear = horizon.getFullYear();
  const horizonMonth = horizon.getMonth();

  const loadMonth = useCallback(async (year: number, month: number) => {
    const map = await getCalendarMonth(year, month);
    setData(map);
    setLoaded(true);
  }, []);

  useFocusEffect(useCallback(() => {
    loadMonth(viewYear, viewMonth);
    loadCompliance();
  }, [loadMonth, viewYear, viewMonth, loadCompliance]));

  useEffect(() => {
    getMiscFlag('disease_profile').then((id) => {
      if (!id) return;
      const profile = getProfileById(id);
      if (profile) setProfileBlurb(profile.patientDescription);
    });
  }, []);

  const taken = summary?.takenDoses ?? 0;
  const totalDosesToday = summary?.totalDoses ?? 0;
  const compliancePct = summary?.compliancePct ?? 0;
  const ringColor = getComplianceStatusColor(compliancePct);

  // The bar animates to the live percentage; the ring's number is read straight
  // off the data rather than off an Animated listener, because wherever that
  // listener failed to fire the ring read 0 while the card above it read 100%.
  const animateToCompliance = useCallback((pct: number) => {
    Animated.timing(barAnim, {
      toValue: (barContainerWidth.current * pct) / 100,
      duration: 700,
      useNativeDriver: false,
    }).start();
  }, [barAnim]);

  useEffect(() => { animateToCompliance(compliancePct); }, [compliancePct, animateToCompliance]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadMonth(viewYear, viewMonth), loadCompliance()]);
    setRefreshing(false);
  };

  const shiftMonth = (delta: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    let m = viewMonth + delta;
    let y = viewYear;
    if (m < 0) { m = 11; y -= 1; }
    else if (m > 11) { m = 0; y += 1; }
    if (y > horizonYear || (y === horizonYear && m > horizonMonth)) return;
    setViewYear(y);
    setViewMonth(m);
  };
  const canGoNext = !(viewYear === horizonYear && viewMonth === horizonMonth);

  const openDay = useCallback(async (date: string) => {
    setDetailDate(date);
    setDetail(null);
    try { setDetail(await getDayDetail(date)); } catch { setDetail(null); }
  }, []);
  const closeDay = useCallback(() => { setDetailDate(null); setDetail(null); setSelectedDose(null); }, []);

  // A correction moves the day's compliance, so the month grid behind the sheet
  // and the header's own numbers have to be re-read, not just this day's rows.
  const afterCorrection = useCallback(async () => {
    setSelectedDose(null);
    if (detailDate) {
      try { setDetail(await getDayDetail(detailDate)); } catch { setDetail(null); }
    }
    await Promise.all([loadMonth(viewYear, viewMonth), loadCompliance()]);
  }, [detailDate, loadMonth, viewYear, viewMonth, loadCompliance]);

  const correctTook = useCallback(async (dose: ScheduledDose) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (dose.logId == null) return;
    try {
      await confirmDose(dose.logId);
    } catch {
      Alert.alert('Error', 'Could not update this dose. Please try again.');
    }
    await afterCorrection();
  }, [afterCorrection]);

  const correctSkip = useCallback(async (dose: ScheduledDose, reason?: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (dose.logId == null) return;
    try {
      if (reason) await skipDoseWithReason(dose.logId, reason);
      else await skipDose(dose.logId);
    } catch {
      Alert.alert('Error', 'Could not update this dose. Please try again.');
    }
    await afterCorrection();
  }, [afterCorrection]);
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
      const html = `<html><body style="background:#F7F7F2;color:#14213D;font-family:sans-serif;padding:20px">
        <h1 style="color:#1B58B8">${MONTH_NAMES[viewMonth]} ${viewYear}</h1>
        <table style="width:100%;border-collapse:collapse;font-size:14px"><tbody>${rows || `<tr><td>${t('noDataThisMonth')}</td></tr>`}</tbody></table>
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
        <Text style={styles.heading}>{t('history')}</Text>
        <TouchableOpacity style={styles.shareButton} onPress={handleShare} activeOpacity={0.8} accessibilityLabel="Share this month" accessibilityRole="button">
          <Text style={styles.shareButtonText}>{t('share')}</Text>
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
                const textColor = hasData ? INK : (isFuture ? '#CFD2C6' : '#C3B7AD');
                const awareness = getAwarenessDate(slot.date);
                // Openability turns on data, not on the date. A future day holding a
                // real saved event was previously as unopenable as an empty one.
                const disabled = !hasData;
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
          <View style={styles.legendItem}><View style={[styles.legendChip, { backgroundColor: '#2F8F5B' }]} /><Text style={styles.legendLabel}>≥80%</Text></View>
          <View style={styles.legendItem}><View style={[styles.legendChip, { backgroundColor: '#F2B233' }]} /><Text style={styles.legendLabel}>50–79%</Text></View>
          <View style={styles.legendItem}><View style={[styles.legendChip, { backgroundColor: '#C0392B' }]} /><Text style={styles.legendLabel}>&lt;50%</Text></View>
        </View>
        <View style={styles.legendRow}>
          <View style={styles.legendItem}><View style={styles.legendDiamond} /><Text style={styles.legendLabel}>{t('event')}</Text></View>
          <View style={styles.legendItem}><View style={styles.legendSquare} /><Text style={styles.legendLabel}>{t('journal')}</Text></View>
          <View style={styles.legendItem}><View style={styles.legendCircle} /><Text style={styles.legendLabel}>{t('water')}</Text></View>
        </View>
      </View>

      {/* ── Compliance ─────────────────────────────────────────────────────
          Moved here from the Records tab on 2026-09-13. Records became
          Trackers (water, sunlight, exercise, food), and these numbers are a
          reading of history, so they belong beneath the history grid. */}
      <View style={styles.statRow}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{taken}/{totalDosesToday}</Text>
          <Text style={styles.statLabel}>{t('dosesToday')}</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{streak}</Text>
          <Text style={styles.statLabel}>{t('dayStreak')}</Text>
        </View>
      </View>

      {adherenceScore > 0 && (
        <View style={styles.scoreCard}>
          <Text style={styles.scoreValue}>{Math.round(adherenceScore)}%</Text>
          <Text style={styles.scoreLabel}>{t('weightedAdherence')}</Text>
          <Text style={styles.scoreSub}>14-day weighted score based on completeness and timing</Text>
        </View>
      )}

      <View style={styles.complianceCard}>
        <Text style={styles.cardDayLabel}>{t('today')}</Text>
        <View style={styles.ringContainer}>
          <View style={[styles.ringOuter, { borderColor: '#CFD2C6' }]}>
            <View style={[styles.ringInnerAccent, { borderColor: ringColor }]} />
            <View style={styles.ringCenter}>
              <Text style={[styles.ringNumber, { color: ringColor }]}>{compliancePct}</Text>
              <Text style={styles.ringPercent}>%</Text>
            </View>
          </View>
        </View>
        <Text style={styles.complianceLabel}>{t('compliance')}</Text>
        <View
          style={styles.barBg}
          onLayout={(e) => {
            barContainerWidth.current = e.nativeEvent.layout.width;
            animateToCompliance(compliancePct);
          }}
        >
          <Animated.View style={[styles.barFill, { width: barAnim, backgroundColor: ringColor }]} />
        </View>
      </View>

      {profileBlurb ? (
        <View style={styles.profileBlurbCard}>
          <Text style={styles.profileBlurbText}>{profileBlurb}</Text>
        </View>
      ) : null}

      {/* ── The protocol's clinical surfaces ───────────────────────────────
          These came off the Records tab with the compliance block. They are
          the ONLY tap path to lab monitoring, MRI history and the doctor
          report: before they existed those three screens were registered in
          the navigator and reachable by nothing, which is what the audit
          reported as "no entry point on Records". They stay together with the
          clinical record, not with the daily trackers. */}
      <View style={styles.medicalRow}>
        <TouchableOpacity
          style={styles.medicalBtn}
          activeOpacity={0.8}
          onPress={() => navigation.navigate('LabResults')}
          accessibilityLabel="Lab results"
          accessibilityRole="button"
        >
          <Text style={styles.medicalBtnLabel}>Lab Results</Text>
          <Text style={styles.medicalBtnSub}>Vitamin D · PTH · calcium</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.medicalBtn}
          activeOpacity={0.8}
          onPress={() => navigation.navigate('MriTracker')}
          accessibilityLabel="MRI history"
          accessibilityRole="button"
        >
          <Text style={styles.medicalBtnLabel}>MRI History</Text>
          <Text style={styles.medicalBtnSub}>Scans and findings</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={styles.shareProgressBtn}
        activeOpacity={0.8}
        onPress={() => navigation.navigate('Report')}
        accessibilityLabel="Share your progress"
        accessibilityRole="button"
      >
        <Text style={styles.shareProgressBtnText}>{t('shareProgress')}</Text>
      </TouchableOpacity>

      <Modal visible={detailDate !== null} animationType="slide" transparent onRequestClose={closeDay}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.grabber} />
            <View style={styles.detailHeader}>
              <TouchableOpacity onPress={() => stepDay(-1)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityLabel="Previous day" accessibilityRole="button">
                <Text style={styles.detailArrow}>‹</Text>
              </TouchableOpacity>
              <Text style={styles.detailDate}>{detailDate ? formatFullDate(detailDate) : ''}</Text>
              <TouchableOpacity onPress={() => stepDay(1)} disabled={detailDate === null || detailDate >= today} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityLabel="Next day" accessibilityRole="button">
                <Text style={[styles.detailArrow, detailDate === today && styles.navArrowDisabled]}>›</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.detailBody} contentContainerStyle={{ paddingBottom: 12 }}>
              {!detail ? (
                <Text style={styles.detailMuted}>{t('loading')}</Text>
              ) : (
                <>
                  <View style={styles.detailSectionRow}>
                    <Text style={styles.detailSection}>{t('doses')}</Text>
                    {detail.totalDoses > 0 && (
                      <Text style={[styles.detailSummary, { color: getComplianceColor(detail.compliancePct, detail.totalDoses) }]}>
                        {detail.takenDoses}/{detail.totalDoses} · {detail.compliancePct}%
                      </Text>
                    )}
                  </View>
                  {detail.totalDoses === 0 ? (
                    <Text style={styles.detailMuted}>{t('noDosesThisDay')}</Text>
                  ) : (
                    detail.doses.map((d, i) => (
                      <TouchableOpacity
                        key={i}
                        style={styles.detailRow}
                        onPress={() => setSelectedDose(d)}
                        activeOpacity={0.7}
                        accessibilityRole="button"
                        accessibilityLabel={`${d.supplementName}, ${d.status} — correct this dose`}
                      >
                        <View style={[styles.detailDot, { backgroundColor: DOSE_STATUS_COLOR[d.status] ?? '#5A6478' }]} />
                        <Text style={styles.detailRowText}>{d.supplementName}</Text>
                        <Text style={styles.detailRowMeta}>{d.status === 'taken' && d.loggedTime ? fmtTime(d.loggedTime) : d.status}</Text>
                        <Text style={styles.detailRowChevron}>›</Text>
                      </TouchableOpacity>
                    ))
                  )}

                  <Text style={styles.detailSection}>{t('journal')}</Text>
                  {detail.journal ? (
                    <View style={styles.journalCard}>
                      <Text style={styles.detailMood}>{detail.journal.mood}</Text>
                      <Text style={styles.journalNote}>{detail.journal.note || 'No note'}</Text>
                    </View>
                  ) : (
                    <Text style={styles.detailMuted}>{t('noJournalEntry')}</Text>
                  )}

                  <Text style={styles.detailSection}>{t('events')}</Text>
                  {detail.events.length === 0 ? (
                    <Text style={styles.detailMuted}>{t('noEventsShort')}</Text>
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
              <Text style={styles.detailCloseText}>{t('close')}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Nested inside the day sheet so it draws above it. `correctable` is
            what makes the actions appear for a dose that is already taken,
            missed or skipped. */}
        <DoseDetailModal
          visible={selectedDose !== null}
          dose={selectedDose}
          correctable
          onClose={() => setSelectedDose(null)}
          onTook={correctTook}
          onSkip={correctSkip}
        />
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  content: { paddingTop: 60, paddingHorizontal: 20, paddingBottom: 40 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  heading: { color: INK, fontSize: 26, fontWeight: '800', letterSpacing: -0.4 },
  shareButton: { backgroundColor: '#ECEDE6', borderRadius: 11, paddingHorizontal: 16, paddingVertical: 10, borderWidth: 1, borderColor: '#E4DAD1' },
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

  // ── Compliance block, moved from SummaryScreen 2026-09-13 ──────────────
  statRow: { flexDirection: 'row', gap: 12, marginTop: 20 },
  statCard: { flex: 1, backgroundColor: '#ECEDE6', borderRadius: 14, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: '#CFD2C6' },
  statValue: { color: '#14213D', fontSize: 22, fontWeight: '700' },
  statLabel: { color: '#5A6478', fontSize: 12, marginTop: 2 },
  scoreCard: { backgroundColor: '#E7EEFB', borderRadius: 14, padding: 16, marginTop: 12, alignItems: 'center', borderWidth: 1, borderColor: '#1B58B840' },
  scoreValue: { color: '#1B58B8', fontSize: 26, fontWeight: '800' },
  scoreLabel: { color: '#14213D', fontSize: 13, fontWeight: '700', marginTop: 2 },
  scoreSub: { color: '#5A6478', fontSize: 11, marginTop: 4, textAlign: 'center' },
  complianceCard: { backgroundColor: '#ECEDE6', borderRadius: 14, padding: 20, marginTop: 12, alignItems: 'center', borderWidth: 1, borderColor: '#CFD2C6' },
  cardDayLabel: { color: '#5A6478', fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  ringContainer: { marginVertical: 14 },
  ringOuter: { width: 108, height: 108, borderRadius: 54, borderWidth: 8, alignItems: 'center', justifyContent: 'center' },
  ringInnerAccent: { position: 'absolute', top: -8, left: -8, right: -8, bottom: -8, borderRadius: 54, borderWidth: 3, opacity: 0.85 },
  ringCenter: { flexDirection: 'row', alignItems: 'baseline' },
  ringNumber: { fontSize: 30, fontWeight: '800' },
  ringPercent: { color: '#5A6478', fontSize: 14, fontWeight: '700', marginLeft: 1 },
  complianceLabel: { color: '#5A6478', fontSize: 12, marginBottom: 10 },
  barBg: { width: '100%', height: 8, borderRadius: 4, backgroundColor: '#DBDDD3', overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 4 },
  profileBlurbCard: { backgroundColor: '#E7EEFB', borderRadius: 14, padding: 16, marginTop: 12, borderLeftWidth: 3, borderLeftColor: '#1B58B8' },
  profileBlurbText: { color: '#5A6478', fontSize: 13, lineHeight: 20 },
  medicalRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  medicalBtn: { flex: 1, backgroundColor: '#ECEDE6', borderRadius: 14, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: '#CFD2C6' },
  medicalBtnLabel: { color: '#14213D', fontSize: 14, fontWeight: '700', marginBottom: 3 },
  medicalBtnSub: { color: '#5A6478', fontSize: 11 },
  shareProgressBtn: { backgroundColor: '#1B58B8', borderRadius: 14, padding: 16, alignItems: 'center', marginTop: 12 },
  shareProgressBtnText: { color: '#F7F7F2', fontSize: 15, fontWeight: '700' },

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
  detailRowChevron: { color: '#C3B6AD', fontSize: 16, fontWeight: '700' },
  journalCard: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', backgroundColor: '#F5EEE7', borderRadius: 14, padding: 13 },
  detailMood: { fontSize: 24, lineHeight: 26 },
  journalNote: { color: '#3A302A', fontSize: 14, flex: 1, lineHeight: 20 },
  detailMuted: { color: '#9AA3B2', fontSize: 14, fontStyle: 'italic', paddingVertical: 2 },
  detailEvent: { flexDirection: 'row', gap: 11, alignItems: 'flex-start', paddingVertical: 11, paddingHorizontal: 14, backgroundColor: '#FBEDEA', borderWidth: 1, borderColor: '#F3D9D3', borderRadius: 14, marginBottom: 8 },
  detailEventDiamond: { width: 10, height: 10, backgroundColor: EVENT_COLOR, transform: [{ rotate: '45deg' }], marginTop: 5 },
  detailEventTitle: { color: '#8F2E2E', fontSize: 14, fontWeight: '800' },
  detailEventNotes: { color: '#6A5850', fontSize: 13, marginTop: 2, lineHeight: 18 },
  detailClose: { backgroundColor: ACCENT, borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  detailCloseText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
});
