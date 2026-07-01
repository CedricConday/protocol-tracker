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
  const isSimple = onboardingTrack === 'simple';

  useEffect(() => {
    getMiscFlag('onboarding_track').then(setOnboardingTrack);
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

      {/* Share Button */}
      <TouchableOpacity style={styles.shareBtn} activeOpacity={0.8} accessibilityLabel="Share your progress" accessibilityRole="button">
        <Text style={styles.shareBtnText}>Share Your Progress</Text>
      </TouchableOpacity>

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
  complianceCard: { backgroundColor: '#F2EDE8', borderRadius: 14, padding: 12, alignItems: 'center', marginBottom: 12, borderWidth: 1, borderColor: '#D8CFC8' },
  cardDayLabel: { color: '#7A6A62', fontSize: 12, fontWeight: '600', alignSelf: 'flex-start', marginBottom: 4 },
  ringContainer: { width: 84, height: 84, justifyContent: 'center', alignItems: 'center', marginVertical: 4 },
  ringOuter: { width: 84, height: 84, borderRadius: 42, borderWidth: 6, justifyContent: 'center', alignItems: 'center' },
  ringInnerAccent: { position: 'absolute', width: 84, height: 84, borderRadius: 42, borderWidth: 6, borderLeftColor: 'transparent', borderBottomColor: 'transparent' },
  ringCenter: { alignItems: 'center' },
  ringNumber: { fontSize: 24, fontWeight: '800' },
  ringPercent: { color: '#7A6A62', fontSize: 14, fontWeight: '600' },
  complianceLabel: { color: '#2C2420', fontSize: 14, fontWeight: '600', marginTop: 6 },
  barBg: { width: '100%', height: 8, minHeight: 8, backgroundColor: '#E8E0D8', borderRadius: 4, marginTop: 10 },
  barFill: { height: 8, borderRadius: 4 },
  scoreCard: { backgroundColor: '#F2EDE8', borderRadius: 14, padding: 10, marginBottom: 10, borderWidth: 1, borderColor: '#D8CFC8' },
  scoreValue: { color: '#2C2420', fontSize: 22, fontWeight: '800' },
  scoreLabel: { color: '#7A6A62', fontSize: 13, fontWeight: '600', marginTop: 2 },
  scoreSub: { color: '#B0A098', fontSize: 12, marginTop: 3, lineHeight: 16 },
  streakCard: { backgroundColor: '#F2EDE8', borderRadius: 14, padding: 16, marginBottom: 24, borderWidth: 1, borderColor: '#E8E0D8' },
  streakValue: { color: '#2C2420', fontSize: 28, fontWeight: '800' },
  streakLabel: { color: '#7A6A62', fontSize: 15, fontWeight: '600', marginTop: 2 },
  streakNoData: { color: '#B0A098' },
  sectionTitle: { color: '#2C2420', fontSize: 16, fontWeight: '700', marginBottom: 14, marginTop: 28, letterSpacing: 0.1 },
  waterChartRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', height: 120, marginBottom: 16 },
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

});
