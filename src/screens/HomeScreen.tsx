import { Alert } from 'react-native';
import { useState, useEffect, useCallback } from 'react';
import {
  Animated,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  RefreshControl,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import DoseDetailModal from '../components/DoseDetailModal';
import DoseRow from '../components/DoseRow';
import StartDayButton from '../components/StartDayButton';
import SunTracker from '../components/SunTracker';
import WaterTracker from '../components/WaterTracker';
import { startDay, getTodaySchedule } from '../engine/scheduler';
import { getAnchor, addWater, confirmDose, skipDose, skipDoseWithReason, logExercise, getTodayExercise, getProfile, logSunExposure, getTodaySunLog } from '../db/queries';
import type { ScheduledDose } from '../types';

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

function formatTime12(d: Date): string {
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function relativeTimeLabel(dose: ScheduledDose): string {
  const now = new Date();
  const diffMs = dose.scheduledTime.getTime() - now.getTime();
  const diffMin = Math.round(diffMs / 60_000);

  if (dose.status === 'due' || diffMin <= 0) return 'NOW';
  if (diffMin <= 60) return `In ${diffMin} min`;
  return formatTime12(dose.scheduledTime);
}

// ─── Progress Header Card ────────────────────────────────────────────────────

interface ProgressHeaderProps {
  t0: Date | null;
  doses: ScheduledDose[];
  patientName?: string;
}

function ProgressHeader({ t0, doses, patientName }: ProgressHeaderProps) {
  const total  = doses.length;
  const taken  = doses.filter(d => d.status === 'taken').length;
  const pct    = total > 0 ? taken / total : 0;
  const today  = formatDate(new Date());
  const startedStr = t0 ? `Started ${formatTime12(t0)}` : null;
  const allDone = total > 0 && taken === total;

  return (
    <View style={headerStyles.card}>
      {/* Top row */}
      <View style={headerStyles.topRow}>
        <Text style={headerStyles.dateText}>{today}</Text>
        {startedStr && <Text style={headerStyles.startedText}>{startedStr}</Text>}
      </View>

      {/* Tick marks */}
      <View style={headerStyles.tickRow}>
        <Text style={headerStyles.tick}>0</Text>
        <Text style={headerStyles.tick}>{total}</Text>
      </View>

      {/* Progress bar */}
      <View style={headerStyles.trackOuter}>
        <View style={[headerStyles.trackFill, { width: `${Math.round(pct * 100)}%` as `${number}%` }]} />
      </View>

      {/* Summary */}
      {allDone ? (
        <View style={headerStyles.celebrationRow}>
          <Text style={headerStyles.celebrationIcon}>✓</Text>
          <Text style={headerStyles.celebrationText}>
            All doses done, {patientName ? patientName.split(' ')[0] : ''}!{'  '}Well done.
          </Text>
        </View>
      ) : total > 0 ? (
        <View style={headerStyles.summaryRow}>
          <Text style={headerStyles.summaryCount}>{taken}</Text>
          <Text style={headerStyles.summaryOf}> of {total} doses</Text>
          <Text style={headerStyles.summaryLabel}> today</Text>
        </View>
      ) : (
        <Text style={headerStyles.readyText}>Ready when you are</Text>
      )}
    </View>
  );
}

const headerStyles = StyleSheet.create({
  card: {
    backgroundColor: '#111111',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  dateText: {
    color: '#555555',
    fontSize: 13,
  },
  startedText: {
    color: '#555555',
    fontSize: 13,
  },
  tickRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  tick: {
    color: '#444444',
    fontSize: 10,
  },
  trackOuter: {
    height: 10,
    backgroundColor: '#2a2a2a',
    borderRadius: 5,
    overflow: 'hidden',
    marginBottom: 14,
  },
  trackFill: {
    height: 10,
    backgroundColor: '#22c55e',
    borderRadius: 5,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  summaryCount: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '700',
  },
  summaryOf: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '700',
  },
  summaryLabel: {
    color: '#888888',
    fontSize: 15,
  },
  celebrationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  celebrationIcon: {
    color: '#22c55e',
    fontSize: 22,
    fontWeight: '900',
  },
  celebrationText: {
    color: '#22c55e',
    fontSize: 15,
    fontWeight: '600',
    flexShrink: 1,
  },
  readyText: {
    color: '#888888',
    fontSize: 15,
  },
});

// ─── Next Dose Spotlight Card ────────────────────────────────────────────────

interface NextDoseCardProps {
  doses: ScheduledDose[];
  onPress: (dose: ScheduledDose) => void;
}

function NextDoseCard({ doses, onPress }: NextDoseCardProps) {
  const next = doses.find(d => d.status === 'due' || d.status === 'upcoming');
  if (!next) return null;

  const label = relativeTimeLabel(next);
  const isDue = next.status === 'due' || label === 'NOW';

  return (
    <TouchableOpacity
      style={nextStyles.card}
      onPress={() => onPress(next)}
      activeOpacity={0.8}
    >
      <View style={nextStyles.left}>
        <Text style={nextStyles.nextLabel}>NEXT</Text>
        <Text style={nextStyles.name} numberOfLines={1}>{next.supplementName}</Text>
        <Text style={nextStyles.meta}>
          {next.doseAmount}{next.form ? ` · ${next.form}` : ''}
        </Text>
        {next.withFood && (
          <Text style={nextStyles.foodTag}>with food</Text>
        )}
      </View>
      <View style={nextStyles.right}>
        <Text style={[nextStyles.countdown, isDue && nextStyles.countdownDue]}>
          {label}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const nextStyles = StyleSheet.create({
  card: {
    backgroundColor: '#1a1a1a',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  left: {
    flex: 1,
    marginRight: 12,
  },
  nextLabel: {
    color: '#555555',
    fontSize: 10,
    letterSpacing: 2,
    marginBottom: 4,
  },
  name: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '700',
  },
  meta: {
    color: '#888888',
    fontSize: 14,
    marginTop: 2,
  },
  foodTag: {
    color: '#f97316',
    fontSize: 11,
    marginTop: 4,
  },
  right: {
    alignItems: 'flex-end',
  },
  countdown: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  countdownDue: {
    color: '#f97316',
    fontSize: 18,
  },
});

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const navigation = useNavigation<any>();
  const [t0, setT0] = useState<Date | null>(null);
  const [doses, setDoses] = useState<ScheduledDose[]>([]);
  const [waterMl, setWaterMl] = useState(0);
  const [starting, setStarting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedDose, setSelectedDose] = useState<ScheduledDose | null>(null);
  const [exerciseMinutes, setExerciseMinutes] = useState(0);
  const [patientName, setPatientName] = useState('');
  const [sunMinutes, setSunMinutes] = useState(0);

  const loadDay = useCallback(async () => {
    const anchor = await getAnchor();
    setWaterMl(anchor?.water_ml ?? 0);
    const ex = await getTodayExercise();
    const profile = await getProfile();
    setPatientName(profile?.name ?? '');
    setExerciseMinutes(ex.totalMinutes);
    const sun = await getTodaySunLog();
    setSunMinutes(sun?.minutes ?? 0);
    if (anchor?.t0_timestamp) {
      setT0(new Date(anchor.t0_timestamp));
      const schedule = await getTodaySchedule();
      setDoses(schedule);
      const dueCount = schedule.filter(d => d.status === 'due').length;
      navigation.setOptions({ tabBarBadge: dueCount > 0 ? dueCount : undefined });
    } else {
      setT0(null);
      setDoses([]);
      navigation.setOptions({ tabBarBadge: undefined });
    }
  }, [navigation]);

  useEffect(() => {
    loadDay();
    const interval = setInterval(loadDay, 60_000);
    return () => clearInterval(interval);
  }, [loadDay]);

   const handleStartDay = async () => {
     setStarting(true);
     try {
       const schedule = await startDay();
       Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
       setT0(new Date());
       setDoses(schedule);
     } catch (error: any) {
       if (error.message === 'BEDTIME_GATE') {
         Alert.alert(
           "Past Bedtime",
           "It's past your bedtime. Start your day tomorrow morning.",
           [{ text: 'OK', style: 'cancel' }]
         );
       } else {
         console.error('Error starting day:', error);
         // Optionally show a generic error alert
         Alert.alert(
           'Error',
           'Failed to start the day. Please try again.',
           [{ text: 'OK', style: 'cancel' }]
         );
       }
     } finally {
       setStarting(false);
     }
   };

  const handleAddWater = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await addWater(250);
    setWaterMl((prev) => prev + 250);
  };

  const handleLogExercise = async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await logExercise(30, 'walk');
    setExerciseMinutes(prev => prev + 30);
  };

  const handleLogSun = async (minutes: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await logSunExposure(minutes);
    setSunMinutes(prev => prev + minutes);
  };

  const handleTook = async (dose: ScheduledDose) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (dose.logId) {
      await confirmDose(dose.logId);
    }
    setSelectedDose(null);
    await loadDay();
  };

  const handleSkip = async (dose: ScheduledDose, reason?: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (dose.logId) {
      if (reason) {
        await skipDoseWithReason(dose.logId, reason);
      } else {
        await skipDose(dose.logId);
      }
    }
    setSelectedDose(null);
    await loadDay();
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadDay();
    setRefreshing(false);
  };

  // ── Pre-day view ───────────────────────────────────────────────────────────

  if (!t0) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <Text style={styles.greeting}>
            {patientName ? `Hello, ${patientName}` : 'Coimbra Protocol'}
          </Text>
          <Text style={styles.subtitle}>
            Tap when you're ready to take your first supplement.{'\n'}
            This sets your schedule for the day.
          </Text>
          <StartDayButton onPress={handleStartDay} loading={starting} />
          <TouchableOpacity
            style={styles.relapseButton}
            onPress={() => navigation.navigate('Events')}
            activeOpacity={0.7}
          >
            <Text style={styles.relapseButtonText}>Log Event</Text>
          </TouchableOpacity>
          {waterMl > 0 && (
            <WaterTracker waterMl={waterMl} onAdd={handleAddWater} />
          )}
          <View style={styles.exerciseCard}>
            <Text style={styles.exerciseLabel}>Exercise today</Text>
            {exerciseMinutes >= 30 ? (
              <Text style={styles.exerciseDone}>{exerciseMinutes} min ✓</Text>
            ) : (
              <TouchableOpacity onPress={handleLogExercise} style={styles.exerciseLogButton}>
                <Text style={styles.exerciseLogButtonText}>Log 30 min walk</Text>
            </TouchableOpacity>
          )}
          </View>
          <SunTracker sunMinutes={sunMinutes} onLog={handleLogSun} />
        </View>
      </SafeAreaView>
    );
  }

  // ── Active day view ────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#22c55e" />
        }
      >
        {/* Part 1: Dashboard progress header */}
        <ProgressHeader t0={t0} doses={doses} patientName={patientName} />

        {/* Part 3: Next dose spotlight */}
        <NextDoseCard doses={doses} onPress={setSelectedDose} />

        {/* Dose list */}
        {doses.map((dose) => (
          <DoseRow key={dose.id} dose={dose} onPress={() => setSelectedDose(dose)} />
        ))}

        {/* Bottom trackers — unchanged */}
        <TouchableOpacity
          style={styles.relapseButtonInline}
          onPress={() => navigation.navigate('Events')}
          activeOpacity={0.7}
        >
          <Text style={styles.relapseButtonText}>Log Event</Text>
        </TouchableOpacity>
        <WaterTracker waterMl={waterMl} onAdd={handleAddWater} />
        <View style={styles.exerciseCard}>
          <Text style={styles.exerciseLabel}>Exercise today</Text>
          {exerciseMinutes >= 30 ? (
            <Text style={styles.exerciseDone}>{exerciseMinutes} min ✓</Text>
          ) : (
            <TouchableOpacity onPress={handleLogExercise} style={styles.exerciseLogButton}>
              <Text style={styles.exerciseLogButtonText}>Log 30 min walk</Text>
            </TouchableOpacity>
          )}
        </View>
        <SunTracker sunMinutes={sunMinutes} onLog={handleLogSun} />
      </ScrollView>

      <DoseDetailModal
        visible={selectedDose !== null}
        dose={selectedDose}
        onClose={() => setSelectedDose(null)}
        onTook={handleTook}
        onSkip={handleSkip}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0d0d0d',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  greeting: {
    color: '#ffffff',
    fontSize: 28,
    fontWeight: '800',
    marginBottom: 8,
  },
  subtitle: {
    color: '#888888',
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 40,
    lineHeight: 22,
  },
  scroll: {
    padding: 20,
    paddingTop: 60,
  },
  exerciseCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
  },
  exerciseLabel: {
    color: '#888888',
    fontSize: 14,
  },
  exerciseDone: {
    color: '#22c55e',
    fontWeight: '700',
    marginTop: 8,
  },
  exerciseLogButton: {
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#22c55e',
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 8,
  },
  exerciseLogButtonText: {
    color: '#22c55e',
    fontWeight: '600',
  },
  relapseButton: {
    borderWidth: 1.5,
    borderColor: '#ef4444',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 24,
    alignItems: 'center',
    marginTop: 12,
  },
  relapseButtonInline: {
    borderWidth: 1.5,
    borderColor: '#ef4444',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 24,
    alignItems: 'center',
    marginBottom: 8,
  },
  relapseButtonText: {
    color: '#ef4444',
    fontSize: 14,
    fontWeight: '700',
  },
});
