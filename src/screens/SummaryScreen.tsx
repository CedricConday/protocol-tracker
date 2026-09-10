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
import { t } from '../i18n';

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
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#1B58B8" />}
    >
      <Text style={styles.heading}>{t('summary')}</Text>

      <View style={styles.statRow}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{taken}/{total}</Text>
          <Text style={styles.statLabel}>{t('dosesToday')}</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{streak}</Text>
          <Text style={styles.statLabel}>{t('dayStreak')}</Text>
        </View>
      </View>

      {/* Adherence Score */}
      {adherenceScore > 0 && (
        <View style={styles.scoreCard}>
          <Text style={styles.scoreValue}>{Math.round(adherenceScore)}%</Text>
          <Text style={styles.scoreLabel}>{t('weightedAdherence')}</Text>
          <Text style={styles.scoreSub}>14-day weighted score based on completeness and timing</Text>
        </View>
      )}

      {profileBlurb && (
        <View style={styles.profileBlurbCard}>
          <Text style={styles.profileBlurbText}>{profileBlurb}</Text>
        </View>
      )}

      {/* Compliance Ring Card */}
      <View style={styles.complianceCard}>
        <Text style={styles.cardDayLabel}>{t('today')}</Text>
        <View style={styles.ringContainer}>
          <View style={[styles.ringOuter, { borderColor: '#CFD2C6' }]}>
            <View style={[styles.ringInnerAccent, { borderColor: ringColor }]} />
            <View style={styles.ringCenter}>
              <Text style={[styles.ringNumber, { color: ringColor }]}>{displayPct}</Text>
              <Text style={styles.ringPercent}>%</Text>
            </View>
          </View>
        </View>
        <Text style={styles.complianceLabel}>{t('compliance')}</Text>
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

      {/* Mood Chart */}
      <Text style={styles.chartSectionTitle}>{t('mood7')}</Text>
      <View style={styles.barChartRow}>
        {moodWeek.map((m, i) => (
          <View key={m.day} style={styles.barCol}>
            <View style={[styles.moodBar, { height: m.score ? (m.score / highestMood) * 70 : 0, backgroundColor: m.score ? '#22c55e' : '#DBDDD3' }]} />
            <Text style={styles.barDayLabel}>{m.day}</Text>
          </View>
        ))}
      </View>

      {/* Water Chart */}
      <Text style={styles.chartSectionTitle}>{t('water7')}</Text>
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

      {/* Share Button */}
      <TouchableOpacity style={styles.shareBtn} activeOpacity={0.8} accessibilityLabel="Share your progress" accessibilityRole="button">
        <Text style={styles.shareBtnText}>{t('shareProgress')}</Text>
      </TouchableOpacity>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F7F2' },
  content: { padding: 24, paddingTop: 60, paddingBottom: 40 },
  medicalRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  medicalBtn: { flex: 1, backgroundColor: '#ECEDE6', borderRadius: 14, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: '#CFD2C6' },
  medicalBtnLabel: { color: '#14213D', fontSize: 14, fontWeight: '700', marginBottom: 3 },
  medicalBtnSub: { color: '#5A6478', fontSize: 11 },
  workspaceBtn: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: '#E7EEFB', borderRadius: 14, padding: 16, marginTop: 10, borderWidth: 1, borderColor: '#1B58B840' },
  workspaceBtnIcon: { color: '#1B58B8', fontSize: 22 },
  workspaceBtnLabel: { color: '#1B58B8', fontSize: 15, fontWeight: '700' },
  workspaceBtnSub: { color: '#9AA3B2', fontSize: 12, marginTop: 2 },
  chartSectionTitle: { color: '#5A6478', fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: 8, marginTop: 24 },
  barChartRow: { flexDirection: 'row', alignItems: 'flex-end', height: 80, gap: 6, marginBottom: 4 },
  barCol: { flex: 1, alignItems: 'center', gap: 4, justifyContent: 'flex-end' },
  moodBar: { width: '100%', borderRadius: 4 },
  barDayLabel: { color: '#5A6478', fontSize: 10, textAlign: 'center' },
  waterGoalLine: { position: 'absolute', bottom: 20, left: 0, right: 0, height: 1, backgroundColor: '#14213D', opacity: 0.1 },
  heading: { color: '#14213D', fontSize: 24, fontWeight: '800', marginBottom: 24 },
  statRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  statCard: { flex: 1, backgroundColor: '#ECEDE6', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#CFD2C6' },
  statValue: { color: '#14213D', fontSize: 28, fontWeight: '800' },
  statLabel: { color: '#5A6478', fontSize: 13, marginTop: 4, lineHeight: 20 },
  complianceCard: { backgroundColor: '#ECEDE6', borderRadius: 14, padding: 12, alignItems: 'center', marginBottom: 12, borderWidth: 1, borderColor: '#CFD2C6' },
  cardDayLabel: { color: '#5A6478', fontSize: 12, fontWeight: '600', alignSelf: 'flex-start', marginBottom: 4 },
  ringContainer: { width: 84, height: 84, justifyContent: 'center', alignItems: 'center', marginVertical: 4 },
  ringOuter: { width: 84, height: 84, borderRadius: 42, borderWidth: 6, justifyContent: 'center', alignItems: 'center' },
  ringInnerAccent: { position: 'absolute', width: 84, height: 84, borderRadius: 42, borderWidth: 6, borderLeftColor: 'transparent', borderBottomColor: 'transparent' },
  ringCenter: { alignItems: 'center' },
  ringNumber: { fontSize: 24, fontWeight: '800' },
  ringPercent: { color: '#5A6478', fontSize: 14, fontWeight: '600' },
  complianceLabel: { color: '#14213D', fontSize: 14, fontWeight: '600', marginTop: 6 },
  barBg: { width: '100%', height: 8, minHeight: 8, backgroundColor: '#DBDDD3', borderRadius: 4, marginTop: 10 },
  barFill: { height: 8, borderRadius: 4 },
  scoreCard: { backgroundColor: '#ECEDE6', borderRadius: 14, padding: 10, marginBottom: 10, borderWidth: 1, borderColor: '#CFD2C6' },
  scoreValue: { color: '#14213D', fontSize: 22, fontWeight: '800' },
  scoreLabel: { color: '#5A6478', fontSize: 13, fontWeight: '600', marginTop: 2 },
  scoreSub: { color: '#9AA3B2', fontSize: 12, marginTop: 3, lineHeight: 16 },
  waterChartRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', height: 120, marginBottom: 16 },
  waterCol: { alignItems: 'center', width: 36 },
  waterMlLabel: { color: '#9AA3B2', fontSize: 9, fontWeight: '600', marginBottom: 4 },
  waterBarTrack: { width: 12, height: 100, backgroundColor: '#DBDDD3', borderRadius: 6, overflow: 'hidden' },
  waterBarFill: { width: 12, borderRadius: 6 },
  waterBarRemain: { width: 12 },
  waterDayLabel: { color: '#5A6478', fontSize: 10, marginTop: 8 },
  shareBtn: { backgroundColor: '#ECEDE6', borderRadius: 10, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: '#1B58B8' },
  shareBtnText: { color: '#1B58B8', fontSize: 15, fontWeight: '700' },
  doctorBtn: { backgroundColor: '#ECEDE6', borderRadius: 10, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: '#2AA6B8' },
  doctorBtnText: { color: '#2AA6B8', fontSize: 14, fontWeight: '700' },
  profileBlurbCard: { backgroundColor: '#E7EEFB', borderRadius: 14, padding: 16, marginBottom: 12, borderLeftWidth: 3, borderLeftColor: '#1B58B8' },
  profileBlurbText: { color: '#5A6478', fontSize: 13, lineHeight: 20 },
});
