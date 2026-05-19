import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSummaryScreen } from '../hooks';

function getComplianceColor(compliancePct: number) {
  if (compliancePct >= 80) return '#22c55e';
  if (compliancePct >= 50) return '#eab308';
  return '#ef4444';
}

export default function SummaryScreen() {
  const {
    summary, weekData, refreshing, setRefreshing,
    loadData,
  } = useSummaryScreen();

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
});
