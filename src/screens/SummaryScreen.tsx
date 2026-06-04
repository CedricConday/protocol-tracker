import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useSummaryScreen } from '../hooks';
import { getMiscFlag } from '../db/queries';
import SkeletonCard from '../components/SkeletonCard';
import { getProfileById } from '../data/diseaseProfiles';

function getComplianceColor(compliancePct: number) {
  if (compliancePct >= 80) return '#22c55e';
  if (compliancePct >= 50) return '#eab308';
  return '#ef4444';
}

export default function SummaryScreen() {
  const navigation = useNavigation<any>();
  const {
    summary, weekData, refreshing, setRefreshing, streak, adherenceScore,
    moodWeek, waterWeek, patientName, loadData,
  } = useSummaryScreen();

  const [loading, setLoading] = useState(true);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const barContainerWidth = useRef(0);
  const barAnim = useRef(new Animated.Value(0)).current;
  const countAnim = useRef(new Animated.Value(0)).current;
  const [displayPct, setDisplayPct] = useState(0);
  const [onboardingTrack, setOnboardingTrack] = useState<string | null>(null);
  const [doctorMode, setDoctorMode] = useState(false);
  const [profileBlurb, setProfileBlurb] = useState<string | null>(null);

  const isSimple = onboardingTrack === 'simple';

  useEffect(() => {
    getMiscFlag('onboarding_track').then(setOnboardingTrack);
    getMiscFlag('disease_profile').then((id) => {
      if (id) {
        const p = getProfileById(id);
        if (p) setProfileBlurb(p.patientDescription);
      }
    });
  }, []);

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

  useEffect(() => {
    if (summary !== null) setLoading(false);
  }, [summary]);

  useEffect(() => {
    animateToCompliance(summary?.compliancePct ?? 0);
  }, [summary, animateToCompliance]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const taken = summary?.takenDoses ?? 0;
  const total = summary?.totalDoses ?? 0;
  const compliancePct = summary?.compliancePct ?? 0;
  const ringColor = getComplianceColor(compliancePct);

  const MAX_WATER = 2000;
  const weekLabels = waterWeek.map(w => w.day);

  const highestMood = Math.max(...moodWeek.filter(m => m.score !== null).map(m => m.score!), 1);
  const highestWater = Math.max(...waterWeek.map(w => w.ml), 1);

  if (loading) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <SkeletonCard height={40} width={180} />
        <View style={{ height: 16 }} />
        <SkeletonCard height={100} />
        <View style={{ height: 12 }} />
        <SkeletonCard height={80} />
        <View style={{ height: 12 }} />
        <SkeletonCard height={180} />
        <View style={{ height: 24 }} />
        <SkeletonCard height={60} />
      </ScrollView>
    );
  }

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
          <Text style={styles.statLabel}>Doses Today</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{streak}</Text>
          <Text style={styles.statLabel}>Day Streak</Text>
        </View>
      </View>

      {/* Adherence Score */}
      {adherenceScore > 0 && (
        <View style={styles.scoreCard}>
          <Text style={styles.scoreValue}>{adherenceScore.toFixed(1)}/8</Text>
          <Text style={styles.scoreLabel}>Weighted Adherence</Text>
          <Text style={styles.scoreSub}>14-day weighted score based on completeness and timing</Text>
        </View>
      )}

      {/* Compliance Ring Card */}
      <View style={styles.complianceCard}>
        <Text style={styles.cardDayLabel}>Today</Text>
        <View style={styles.ringContainer}>
          <View style={[styles.ringOuter, { borderColor: '#D8CFC8' }]}>
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

      {profileBlurb && (
        <View style={styles.profileBlurbCard}>
          <Text style={styles.profileBlurbText}>{profileBlurb}</Text>
        </View>
      )}

      {/* Mood Chart */}
      <Text style={styles.chartSectionTitle}>MOOD (7 DAYS)</Text>
      <View style={styles.barChartRow}>
        {moodWeek.map((m, i) => (
          <View key={m.day} style={styles.barCol}>
            <View style={[styles.moodBar, { height: m.score ? (m.score / highestMood) * 70 : 0, backgroundColor: m.score ? '#22c55e' : '#E8E0D8' }]} />
            <Text style={styles.barDayLabel}>{m.day}</Text>
          </View>
        ))}
      </View>

      {/* Water Chart */}
      <Text style={styles.chartSectionTitle}>WATER (7 DAYS)</Text>
      <View style={styles.waterChartRow}>
        {waterWeek.map((w, i) => (
          <View key={w.day} style={styles.waterCol}>
            <Text style={styles.waterMlLabel}>{w.ml > 0 ? `${Math.round(w.ml / 100) * 100}` : ''}</Text>
            <View style={styles.waterBarTrack}>
              <View style={[styles.waterBarFill, { height: Math.min(100, (w.ml / MAX_WATER) * 100), backgroundColor: w.ml >= MAX_WATER * 0.8 ? '#22c55e' : '#eab308' }]} />
              <View style={[styles.waterBarRemain, { flex: 1 }]} />
            </View>
            <Text style={styles.waterDayLabel}>{w.day}</Text>
          </View>
        ))}
      </View>

      {/* Weekly boxes */}
      <Text style={styles.chartSectionTitle}>THIS WEEK</Text>
      <View style={styles.weekRow}>
        {weekData.map((d, i) => {
          const color = d.compliancePct >= 80 ? '#22c55e' : d.compliancePct >= 50 ? '#eab308' : d.totalDoses > 0 ? '#ef4444' : '#E8E0D8';
          return (
            <View key={i} style={styles.weekCol}>
              <View style={[styles.weekBox, { backgroundColor: color }]} />
              <Text style={styles.weekDay}>{new Date(d.date + 'T00:00:00').toLocaleDateString('en', { weekday: 'short' })}</Text>
            </View>
          );
        })}
      </View>

      {/* Share Button */}
      <TouchableOpacity style={styles.shareBtn} activeOpacity={0.8} accessibilityLabel="Share your progress" accessibilityRole="button">
        <Text style={styles.shareBtnText}>Share Your Progress</Text>
      </TouchableOpacity>

      {/* Doctor Consult toggle — hidden for simple track */}
      {!isSimple && (
        <>
          <TouchableOpacity
            style={[styles.doctorModeToggle, doctorMode && styles.doctorModeToggleActive]}
            onPress={() => setDoctorMode(!doctorMode)}
            activeOpacity={0.7}
            accessibilityLabel={doctorMode ? 'Disable doctor consult view' : 'Enable doctor consult view'}
            accessibilityRole="button"
          >
            <Text style={[styles.doctorModeToggleText, doctorMode && styles.doctorModeToggleTextActive]}>
              {doctorMode ? '✓ Doctor Consult View Active' : 'Doctor Consult View'}
            </Text>
          </TouchableOpacity>
          {doctorMode && (
            <View style={styles.doctorConsole}>
              <Text style={styles.doctorConsoleTitle}>DOCTOR CONSULT VIEW</Text>
              <View style={styles.doctorMetricRow}>
                <View style={styles.doctorMetric}>
                  <Text style={styles.doctorMetricValue}>{adherenceScore.toFixed(1)}</Text>
                  <Text style={styles.doctorMetricLabel}>Adherence</Text>
                </View>
                <View style={styles.doctorMetric}>
                  <Text style={styles.doctorMetricValue}>{streak}</Text>
                  <Text style={styles.doctorMetricLabel}>Streak</Text>
                </View>
                <View style={styles.doctorMetric}>
                  <Text style={styles.doctorMetricValue}>{summary?.takenDoses ?? 0}/{summary?.totalDoses ?? 0}</Text>
                  <Text style={styles.doctorMetricLabel}>Today</Text>
                </View>
              </View>
              <TouchableOpacity style={styles.doctorBtn} activeOpacity={0.7} accessibilityLabel="Share summary with doctor" accessibilityRole="button">
                <Text style={styles.doctorBtnText}>Share Summary with Doctor</Text>
              </TouchableOpacity>
            </View>
          )}
        </>
      )}

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAF7F4' },
  content: { padding: 24, paddingTop: 60, paddingBottom: 40 },
  medicalRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  medicalBtn: { flex: 1, backgroundColor: '#F2EDE8', borderRadius: 14, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: '#D8CFC8' },
  medicalBtnLabel: { color: '#2C2420', fontSize: 14, fontWeight: '700', marginBottom: 3 },
  medicalBtnSub: { color: '#7A6A62', fontSize: 11 },
  workspaceBtn: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: '#FBF0ED', borderRadius: 14, padding: 16, marginTop: 10, borderWidth: 1, borderColor: '#C96A5040' },
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
  statCard: { flex: 1, backgroundColor: '#F2EDE8', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#D8CFC8' },
  statValue: { color: '#2C2420', fontSize: 28, fontWeight: '800' },
  statLabel: { color: '#7A6A62', fontSize: 13, marginTop: 4, lineHeight: 20 },
  complianceCard: { backgroundColor: '#F2EDE8', borderRadius: 14, padding: 20, alignItems: 'center', marginBottom: 16, borderWidth: 1, borderColor: '#D8CFC8' },
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
  scoreCard: { backgroundColor: '#F2EDE8', borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#D8CFC8' },
  scoreValue: { color: '#2C2420', fontSize: 28, fontWeight: '800' },
  scoreLabel: { color: '#7A6A62', fontSize: 15, fontWeight: '600', marginTop: 2 },
  scoreSub: { color: '#B0A098', fontSize: 13, marginTop: 4, lineHeight: 20 },
  streakCard: { backgroundColor: '#F2EDE8', borderRadius: 14, padding: 16, marginBottom: 24, borderWidth: 1, borderColor: '#E8E0D8' },
  streakValue: { color: '#2C2420', fontSize: 28, fontWeight: '800' },
  streakLabel: { color: '#7A6A62', fontSize: 15, fontWeight: '600', marginTop: 2 },
  streakNoData: { color: '#B0A098' },
  sectionTitle: { color: '#2C2420', fontSize: 16, fontWeight: '700', marginBottom: 14, marginTop: 28, letterSpacing: 0.1 },
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
  shareBtn: { backgroundColor: '#F2EDE8', borderRadius: 10, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: '#C96A50' },
  shareBtnText: { color: '#C96A50', fontSize: 15, fontWeight: '700' },
  badgeRow: { flexDirection: 'row', gap: 8, marginBottom: 24, marginTop: 4 },
  badgeCard: { flex: 1, borderRadius: 14, padding: 14, alignItems: 'center', borderWidth: 1 },
  badgeCardGold: { backgroundColor: '#FEF3C7', borderColor: '#F59E0B' },
  badgeCardGrey: { backgroundColor: '#F3F4F6', borderColor: '#D1D5DB' },
  badgeIcon: { fontSize: 22, marginBottom: 4 },
  badgeLabel: { fontSize: 12, fontWeight: '700', textAlign: 'center', marginBottom: 4 },
  badgeLabelEarned: { color: '#2C2420' },
  badgeLabelLocked: { color: '#9CA3AF' },
  badgeCaption: { color: '#B0A098', fontSize: 10, textAlign: 'center' },
  doctorModeToggle: { backgroundColor: '#F2EDE8', borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 16, borderWidth: 1, borderColor: '#7A9ABF' },
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
  profileBlurbCard: { backgroundColor: '#FBF0ED', borderRadius: 14, padding: 16, marginBottom: 12, borderLeftWidth: 3, borderLeftColor: '#C96A50' },
  profileBlurbText: { color: '#7A6A62', fontSize: 13, lineHeight: 20 },
});
