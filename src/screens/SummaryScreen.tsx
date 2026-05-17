import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Privacy from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useNavigation } from '@react-navigation/native';
import { getDaySummary, getWeekSummary, getStreak, getAnchor, getWeightedAdherenceScore, getRecentJournalEntries, getProfile } from '../db/queries';
import { useSimpleMode } from '../context/SimpleModeContext';
import type { DaySummary } from '../types';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function todayDayIndex(): number {
  return ((new Date().getDay() + 6) % 7);
}

function getComplianceColor(compliancePct: number) {
  if (compliancePct >= 80) return '#22c55e';
  if (compliancePct >= 50) return '#eab308';
  return '#ef4444';
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

export default function SummaryScreen() {
  const navigation = useNavigation<any>();
  const { isSimple } = useSimpleMode();
  const [summary, setSummary] = useState<DaySummary | null>(null);
  const [weekData, setWeekData] = useState<{ date: string; compliancePct: number; totalDoses: number; waterMl: number }[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [streak, setStreak] = useState(0);
  const [adherenceScore, setAdherenceScore] = useState(0);
  const [sharing, setSharing] = useState(false);
  const [moodWeek, setMoodWeek] = useState<{ day: string; score: number | null }[]>([]);
  const [waterWeek, setWaterWeek] = useState<{ day: string; ml: number }[]>([]);
  const [doctorMode, setDoctorMode] = useState(false);
  const [patientName, setPatientName] = useState('Patient');

  const barContainerWidth = useRef(0);
  const barAnim = useRef(new Animated.Value(0)).current;
  const countAnim = useRef(new Animated.Value(0)).current;
  const [displayPct, setDisplayPct] = useState(0);

  useEffect(() => {
    const id = countAnim.addListener(({ value }) => setDisplayPct(Math.round(value)));
    return () => countAnim.removeListener(id);
  }, [countAnim]);

  const animateToCompliance = useCallback((pct: number) => {
    Animated.parallel([
      Animated.timing(barAnim, {
        toValue: barContainerWidth.current * pct / 100,
        duration: 700,
        useNativeDriver: false,
      }),
      Animated.timing(countAnim, {
        toValue: pct,
        duration: 700,
        useNativeDriver: false,
      }),
    ]).start();
  }, [barAnim, countAnim]);

  const loadData = useCallback(async () => {
    const daySummary = await getDaySummary();
    setSummary(daySummary);
    const s = await getStreak();
    setStreak(s);
    const score = await getWeightedAdherenceScore(14);
    setAdherenceScore(score);

    const week = await getWeekSummary();
    const enriched = await Promise.all(
      week.map(async (d) => {
        const full = await getDaySummary(d.date);
        const anchor = await getAnchor(d.date);
        return { ...d, totalDoses: full.totalDoses, waterMl: anchor?.water_ml ?? 0 };
      }),
    );
    setWeekData(enriched);

    const MOOD_SCORES: Record<string, number> = { '😄': 5, '🙂': 4, '😐': 3, '😔': 2, '😞': 1 };
    const DAY3 = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const todayIdx = ((new Date().getDay() + 6) % 7);
    const journals = await getRecentJournalEntries(7);
    const moodData = [];
    const waterData = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const entry = journals.find((j) => j.date === dateStr);
      const anchor = await getAnchor(dateStr);
      moodData.push({ day: DAY3[(todayIdx - i + 7) % 7], score: entry ? (MOOD_SCORES[entry.mood] ?? null) : null });
      waterData.push({ day: DAY3[(todayIdx - i + 7) % 7], ml: anchor?.water_ml ?? 0 });
    }
    setMoodWeek(moodData);
    setWaterWeek(waterData);
    const profile = await getProfile();
    if (profile?.name) setPatientName(profile.name);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    animateToCompliance(summary?.compliancePct ?? 0);
  }, [summary, animateToCompliance]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const handleShareWeek = async () => {
    setSharing(true);
    try {
      const now = new Date();
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - 6);
      const rows = weekData.map((d, i) => {
        const dayName = WEEKDAYS[(todayDayIndex() - 6 + i + 7) % 7];
        return `<tr style="border-bottom:1px solid #2a2a2a">
          <td style="padding:8px;color:#fff">${dayName}</td>
          <td style="padding:8px;color:${getComplianceColor(d.compliancePct)}">${d.compliancePct}%</td>
          <td style="padding:8px;color:#fff">${d.totalDoses}</td>
          <td style="padding:8px;color:#fff">${d.waterMl}ml</td>
        </tr>`;
      }).join('');
      const html = `<html><body style="background:#0d0d0d;padding:24px;font-family:sans-serif">
        <h1 style="color:#22c55e;font-size:18px">Coimbra Protocol — Weekly Report</h1>
        <p style="color:#888;font-size:13px">${formatDate(weekStart)} — ${formatDate(now)}</p>
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <tr style="background:#1a1a1a"><th style="padding:8px;text-align:left;color:#888">Day</th><th style="padding:8px;text-align:left;color:#888">Compliance</th><th style="padding:8px;text-align:left;color:#888">Doses</th><th style="padding:8px;text-align:left;color:#888">Water</th></tr>
          ${rows}
        </table>
        <p style="color:#555;font-size:11px;margin-top:24px;text-align:center">Generated by Coimbra Protocol App</p>
      </body></html>`;
      const { uri } = await Privacy.printToFileAsync({ html });
      await Sharing.shareAsync(uri, { mimeType: 'application/pdf' });
    } finally {
      setSharing(false);
    }
  };

  const handleProviderReport = async () => {
    setSharing(true);
    try {
      const now = new Date();
      const avgCompliance = weekData.length > 0 ? Math.round(weekData.reduce((a, b) => a + b.compliancePct, 0) / weekData.length) : 0;
      const html = `<html><body style="font-family:sans-serif;padding:32px;background:#fff;color:#111">
        <h1 style="color:#166534;margin-bottom:4px">Coimbra Protocol — Provider Summary</h1>
        <p style="color:#666;font-size:12px;margin-bottom:24px">Generated ${now.toLocaleDateString()}</p>
        <table style="border-collapse:collapse;width:100%;font-size:14px">
          <tr><td style="padding:10px;border:1px solid #ddd;font-weight:600">Patient</td><td style="padding:10px;border:1px solid #ddd">${patientName}</td></tr>
          <tr><td style="padding:10px;border:1px solid #ddd;font-weight:600">7-Day Avg Compliance</td><td style="padding:10px;border:1px solid #ddd">${avgCompliance}%</td></tr>
          <tr><td style="padding:10px;border:1px solid #ddd;font-weight:600">Protocol Score (14d)</td><td style="padding:10px;border:1px solid #ddd">${adherenceScore}/100</td></tr>
          <tr><td style="padding:10px;border:1px solid #ddd;font-weight:600">Adherence Streak</td><td style="padding:10px;border:1px solid #ddd">${streak} days</td></tr>
          <tr><td style="padding:10px;border:1px solid #ddd;font-weight:600">Today's Compliance</td><td style="padding:10px;border:1px solid #ddd">${compliancePct}%</td></tr>
        </table>
        <h2 style="color:#166534;font-size:14px;margin-top:24px">Daily Breakdown (Last 7 Days)</h2>
        <table style="border-collapse:collapse;width:100%;font-size:13px">
          <tr style="background:#f0fdf4"><th style="padding:8px;border:1px solid #ddd">Date</th><th style="padding:8px;border:1px solid #ddd">Compliance</th><th style="padding:8px;border:1px solid #ddd">Doses</th><th style="padding:8px;border:1px solid #ddd">Water</th></tr>
          ${weekData.map((d, i) => `<tr><td style="padding:8px;border:1px solid #ddd">${WEEKDAYS[(todayDayIndex() - 6 + i + 7) % 7]}</td><td style="padding:8px;border:1px solid #ddd">${d.compliancePct}%</td><td style="padding:8px;border:1px solid #ddd">${d.totalDoses}</td><td style="padding:8px;border:1px solid #ddd">${d.waterMl}ml</td></tr>`).join('')}
        </table>
        <p style="color:#999;font-size:10px;margin-top:32px">This report was auto-generated by the Coimbra Protocol App. It is for informational purposes only and does not constitute medical advice.</p>
      </body></html>`;
      const { uri } = await Privacy.printToFileAsync({ html });
      await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Provider Report' });
    } finally {
      setSharing(false);
    }
  };

  const handleClinicalMessage = () => {
    const avgCompliance = weekData.length > 0 ? Math.round(weekData.reduce((a, b) => a + b.compliancePct, 0) / weekData.length) : 0;
    const msg = `Dear Doctor,\n\nI am reaching out with my Coimbra Protocol tracking update for your review.\n\nThis week's average compliance: ${avgCompliance}%\nProtocol score (14 days): ${adherenceScore}/100\nCurrent adherence streak: ${streak} days\n\nI have attached my weekly compliance report. Please let me know if any adjustments to my protocol are needed.\n\nThank you,\n${patientName}`;
    Alert.alert('Clinical Message Draft', msg, [{ text: 'Close' }]);
  };

  const taken = summary?.takenDoses ?? 0;
  const total = summary?.totalDoses ?? 0;
  const compliancePct = summary?.compliancePct ?? 0;
  const waterMl = summary?.waterMl ?? 0;
  const ringColor = getComplianceColor(compliancePct);
  const waterGoal = 2500;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#C96A50" />}
    >
      <Text style={styles.heading}>Summary</Text>

      <View style={styles.statRow}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{taken}/{total}</Text>
          <Text style={styles.statLabel}>Doses Taken</Text>
        </View>
        {!isSimple && (
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{waterMl}</Text>
            <Text style={styles.statLabel}>Water (ml)</Text>
          </View>
        )}
      </View>

      {/* Compliance Ring Card */}
      <View style={styles.complianceCard}>
        <Text style={styles.cardDayLabel}>Today</Text>
        <View style={styles.ringContainer}>
          <View style={[styles.ringOuter, { borderColor: '#2a2a2a' }]}>
            <View style={[styles.ringInnerAccent, { borderColor: ringColor }]} />
            <View style={styles.ringCenter}>
              <Text style={[styles.ringNumber, { color: ringColor }]}>{displayPct}</Text>
              <Text style={styles.ringPercent}>%</Text>
            </View>
          </View>
        </View>
        <Text style={styles.complianceLabel}>Compliance</Text>
        <View
          style={styles.barBg}
          onLayout={e => {
            barContainerWidth.current = e.nativeEvent.layout.width;
            animateToCompliance(compliancePct);
          }}
        >
          <Animated.View style={[styles.barFill, { width: barAnim, backgroundColor: ringColor }]} />
        </View>
      </View>

      {!isSimple && (
        <>
          {/* Protocol Score */}
          <View style={styles.scoreCard}>
            <Text style={styles.scoreValue}>{adherenceScore}</Text>
            <Text style={styles.scoreLabel}>Protocol Score</Text>
            <Text style={styles.scoreSub}>Weighted for recency and supplement priority</Text>
          </View>

          {/* Streak Card */}
          <View style={styles.streakCard}>
            <Text style={styles.streakValue}>{streak === 0 ? '—' : `${streak}`}{streak >= 3 ? ' 🔥' : ''}</Text>
            <Text style={[styles.streakLabel, streak === 0 ? styles.streakNoData : null]}>{streak === 0 ? 'no streak yet' : 'day streak'}</Text>
          </View>

          {/* Mood Chart */}
          <Text style={styles.chartSectionTitle}>MOOD — LAST 7 DAYS</Text>
          <View style={styles.barChartRow}>
            {moodWeek.map((m, i) => {
              const h = m.score ? (m.score / 5) * 64 : 4;
              const bg = m.score ? (m.score >= 4 ? '#22c55e' : m.score === 3 ? '#eab308' : '#ef4444') : '#222222';
              return (
                <View key={i} style={styles.barCol}>
                  <View style={[styles.moodBar, { height: h, backgroundColor: bg }]} />
                  <Text style={styles.barDayLabel}>{m.day}</Text>
                </View>
              );
            })}
          </View>

          {/* Water Chart */}
          <Text style={styles.chartSectionTitle}>WATER — LAST 7 DAYS</Text>
          <View style={[styles.barChartRow, { position: 'relative' }]}>
            <View style={styles.waterGoalLine} />
            {waterWeek.map((w, i) => {
              const h = Math.min((w.ml / 2500) * 64, 64);
              const bg = w.ml === 0 ? '#222222' : w.ml >= 2200 ? '#22c55e' : w.ml >= 1500 ? '#eab308' : '#ef4444';
              return (
                <View key={i} style={styles.barCol}>
                  <View style={[styles.moodBar, { height: Math.max(h, 4), backgroundColor: bg }]} />
                  <Text style={styles.barDayLabel}>{w.day}</Text>
                </View>
              );
            })}
          </View>

          {/* Water This Week */}
          <Text style={styles.sectionTitle}>Water This Week</Text>
          <View style={styles.waterChartRow}>
            {weekData.map((d, i) => {
              const barHeight = Math.min((d.waterMl / waterGoal) * 100, 100);
              const dayName = WEEKDAYS[(todayDayIndex() - 6 + i + 7) % 7];
              return (
                <View key={d.date} style={styles.waterCol}>
                  <Text style={styles.waterMlLabel}>{d.waterMl > 0 ? `${Math.round(d.waterMl / 100) * 100}` : ''}</Text>
                  <View style={styles.waterBarTrack}>
                    <View style={[styles.waterBarFill, { height: `${barHeight}%`, backgroundColor: '#3b82f6' }]} />
                    <View style={[styles.waterBarRemain, { height: `${100 - barHeight}%` }]} />
                  </View>
                  <Text style={styles.waterDayLabel}>{dayName}</Text>
                </View>
              );
            })}
          </View>

          {/* Week compliance boxes */}
          <Text style={styles.sectionTitle}>This Week</Text>
          <View style={styles.weekRow}>
            {weekData.map((d, i) => (
              <View key={d.date} style={styles.weekCol}>
                <View style={[styles.weekBox, { backgroundColor: getComplianceColor(d.compliancePct) }]} />
                <Text style={styles.weekDay}>{WEEKDAYS[(todayDayIndex() - 6 + i + 7) % 7]}</Text>
              </View>
            ))}
          </View>
          
          <TouchableOpacity style={styles.shareBtn} onPress={handleShareWeek} disabled={sharing}>
             <Text style={styles.shareBtnText}>{sharing ? 'Preparing...' : 'Share Week'}</Text>
          </TouchableOpacity>

          {/* Medical Records */}
          <View style={styles.medicalRow}>
            <TouchableOpacity style={styles.medicalBtn} onPress={() => navigation.navigate('LabResults')} activeOpacity={0.7}>
              <Text style={styles.medicalBtnLabel}>Lab Results</Text>
              <Text style={styles.medicalBtnSub}>PTH · Vit D · Ca</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.medicalBtn} onPress={() => navigation.navigate('MriTracker')} activeOpacity={0.7}>
              <Text style={styles.medicalBtnLabel}>MRI History</Text>
              <Text style={styles.medicalBtnSub}>Lesions · Timeline</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={styles.workspaceBtn} onPress={() => navigation.navigate('Workspace')} activeOpacity={0.8}>
            <Text style={styles.workspaceBtnIcon}>✦</Text>
            <View>
              <Text style={styles.workspaceBtnLabel}>AI Workspace</Text>
              <Text style={styles.workspaceBtnSub}>Ask questions about your data</Text>
            </View>
          </TouchableOpacity>

          {/* Doctor's Console — Tasks 31/32/33 */}
          <TouchableOpacity
            style={[styles.doctorModeToggle, doctorMode ? styles.doctorModeToggleActive : null]}
            onPress={() => setDoctorMode((v) => !v)}
            activeOpacity={0.8}
          >
            <Text style={[styles.doctorModeToggleText, doctorMode ? styles.doctorModeToggleTextActive : null]}>
              {doctorMode ? 'Exit Doctor View' : "Doctor's Consult View"}
            </Text>
          </TouchableOpacity>

          {doctorMode ? (
            <View style={styles.doctorConsole}>
              <Text style={styles.doctorConsoleTitle}>PROVIDER SUMMARY</Text>
              <View style={styles.doctorMetricRow}>
                <View style={styles.doctorMetric}>
                  <Text style={styles.doctorMetricValue}>{adherenceScore}</Text>
                  <Text style={styles.doctorMetricLabel}>Protocol Score</Text>
                </View>
                <View style={styles.doctorMetric}>
                  <Text style={styles.doctorMetricValue}>{streak}d</Text>
                  <Text style={styles.doctorMetricLabel}>Streak</Text>
                </View>
                <View style={styles.doctorMetric}>
                  <Text style={styles.doctorMetricValue}>{compliancePct}%</Text>
                  <Text style={styles.doctorMetricLabel}>Today</Text>
                </View>
              </View>
              <TouchableOpacity style={styles.doctorBtn} onPress={handleClinicalMessage} activeOpacity={0.8}>
                <Text style={styles.doctorBtnText}>Draft Clinical Message</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.doctorBtn, { marginTop: 8 }]} onPress={handleProviderReport} disabled={sharing} activeOpacity={0.8}>
                <Text style={styles.doctorBtnText}>{sharing ? 'Generating...' : 'Export Provider PDF'}</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAF7F4' },
  content: { padding: 24, paddingTop: 60 },
  medicalRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  medicalBtn: { flex: 1, backgroundColor: '#F2EDE8', borderRadius: 10, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: '#D8CFC8' },
  medicalBtnLabel: { color: '#2C2420', fontSize: 14, fontWeight: '700', marginBottom: 3 },
  medicalBtnSub: { color: '#7A6A62', fontSize: 11 },
  workspaceBtn: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: '#FBF0ED', borderRadius: 12, padding: 16, marginTop: 10, borderWidth: 1, borderColor: '#C96A5040' },
  workspaceBtnIcon: { color: '#C96A50', fontSize: 22 },
  workspaceBtnLabel: { color: '#C96A50', fontSize: 15, fontWeight: '700' },
  workspaceBtnSub: { color: '#B0A098', fontSize: 12, marginTop: 2 },
  chartSectionTitle: { color: '#7A6A62', fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: 8, marginTop: 24 },
  barChartRow: { flexDirection: 'row', alignItems: 'flex-end', height: 80, gap: 6, marginBottom: 4 },
  barCol: { flex: 1, alignItems: 'center', gap: 4, justifyContent: 'flex-end' },
  moodBar: { width: '100%', borderRadius: 4 },
  barDayLabel: { color: '#7A6A62', fontSize: 10, textAlign: 'center' },
  waterGoalLine: { position: 'absolute', bottom: 20, left: 0, right: 0, height: 1, backgroundColor: '#2C2420', opacity: 0.1 },
  heading: { color: '#2C2420', fontSize: 24, fontWeight: '800', marginBottom: 24 },
  statRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  statCard: { flex: 1, backgroundColor: '#F2EDE8', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#D8CFC8' },
  statValue: { color: '#2C2420', fontSize: 20, fontWeight: '700' },
  statLabel: { color: '#7A6A62', fontSize: 12, marginTop: 4 },
  complianceCard: { backgroundColor: '#F2EDE8', borderRadius: 16, padding: 20, alignItems: 'center', marginBottom: 16, borderWidth: 1, borderColor: '#D8CFC8' },
  cardDayLabel: { color: '#7A6A62', fontSize: 12, fontWeight: '600', alignSelf: 'flex-start', marginBottom: 12 },
  ringContainer: { width: 120, height: 120, justifyContent: 'center', alignItems: 'center', marginVertical: 10 },
  ringOuter: { width: 120, height: 120, borderRadius: 60, borderWidth: 8, justifyContent: 'center', alignItems: 'center' },
  ringInnerAccent: { position: 'absolute', width: 120, height: 120, borderRadius: 60, borderWidth: 8, borderLeftColor: 'transparent', borderBottomColor: 'transparent' },
  ringCenter: { alignItems: 'center' },
  ringNumber: { fontSize: 32, fontWeight: '800' },
  ringPercent: { color: '#7A6A62', fontSize: 14, fontWeight: '600' },
  complianceLabel: { color: '#2C2420', fontSize: 16, fontWeight: '600', marginTop: 12 },
  barBg: { width: '100%', height: 8, minHeight: 8, backgroundColor: '#E8E0D8', borderRadius: 4, marginTop: 16 },
  barFill: { height: 8, borderRadius: 4 },
  scoreCard: { backgroundColor: '#F2EDE8', borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#D8CFC8' },
  scoreValue: { color: '#2C2420', fontSize: 24, fontWeight: '800' },
  scoreLabel: { color: '#7A6A62', fontSize: 14, fontWeight: '600', marginTop: 2 },
  scoreSub: { color: '#B0A098', fontSize: 11, marginTop: 4 },
  streakCard: { backgroundColor: '#F2EDE8', borderRadius: 12, padding: 16, marginBottom: 24, borderWidth: 1, borderColor: '#D8CFC8' },
  streakValue: { color: '#2C2420', fontSize: 24, fontWeight: '800' },
  streakLabel: { color: '#7A6A62', fontSize: 14, fontWeight: '600', marginTop: 2 },
  streakNoData: { color: '#B0A098' },
  sectionTitle: { color: '#2C2420', fontSize: 16, fontWeight: '700', marginBottom: 16, marginTop: 24 },
  waterChartRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', height: 120, marginBottom: 32 },
  waterCol: { alignItems: 'center', width: 36 },
  waterMlLabel: { color: '#B0A098', fontSize: 9, fontWeight: '600', marginBottom: 4 },
  waterBarTrack: { width: 12, height: 100, backgroundColor: '#E8E0D8', borderRadius: 6, overflow: 'hidden' },
  waterBarFill: { width: 12, borderRadius: 6 },
  waterBarRemain: { width: 12 },
  waterDayLabel: { color: '#7A6A62', fontSize: 10, marginTop: 8 },
  weekRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 24 },
  weekCol: { alignItems: 'center' },
  weekBox: { width: 32, height: 32, borderRadius: 6, marginBottom: 6 },
  weekDay: { color: '#B0A098', fontSize: 10, fontWeight: '600' },
  shareBtn: { backgroundColor: '#F2EDE8', borderRadius: 12, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: '#C96A50' },
  shareBtnText: { color: '#C96A50', fontSize: 14, fontWeight: '700' },
  doctorModeToggle: { backgroundColor: '#F2EDE8', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 16, borderWidth: 1, borderColor: '#7A9ABF' },
  doctorModeToggleActive: { backgroundColor: '#EAF0F6' },
  doctorModeToggleText: { color: '#4A7A9B', fontSize: 14, fontWeight: '700' },
  doctorModeToggleTextActive: { color: '#2A5A7B' },
  doctorConsole: { backgroundColor: '#EAF0F6', borderRadius: 16, padding: 20, marginTop: 12, borderWidth: 1, borderColor: '#7A9ABF30' },
  doctorConsoleTitle: { color: '#4A7A9B', fontSize: 11, fontWeight: '800', letterSpacing: 1.5, marginBottom: 16 },
  doctorMetricRow: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 16 },
  doctorMetric: { alignItems: 'center' },
  doctorMetricValue: { color: '#2C2420', fontSize: 24, fontWeight: '800' },
  doctorMetricLabel: { color: '#7A6A62', fontSize: 11, fontWeight: '600', marginTop: 4 },
  doctorBtn: { backgroundColor: '#F2EDE8', borderRadius: 10, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: '#4A7A9B' },
  doctorBtnText: { color: '#4A7A9B', fontSize: 14, fontWeight: '700' },
});
