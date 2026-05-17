import { useState, useEffect, useCallback } from 'react';
import {
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  RefreshControl,
} from 'react-native';
import DoseDetailModal from '../components/DoseDetailModal';
import DoseRow from '../components/DoseRow';
import StartDayButton from '../components/StartDayButton';
import WaterTracker from '../components/WaterTracker';
import { startDay, getTodaySchedule, getLatestStartTime } from '../engine/scheduler';
import { getAnchor, addWater, confirmDose, skipDose, logExercise, getTodayExercise } from '../db/queries';
import type { ScheduledDose } from '../types';

export default function HomeScreen() {
  const [t0, setT0] = useState<Date | null>(null);
  const [doses, setDoses] = useState<ScheduledDose[]>([]);
  const [waterMl, setWaterMl] = useState(0);
  const [starting, setStarting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedDose, setSelectedDose] = useState<ScheduledDose | null>(null);
  const [exerciseMinutes, setExerciseMinutes] = useState(0);

  const loadDay = useCallback(async () => {
    const anchor = await getAnchor();
    setWaterMl(anchor?.water_ml ?? 0);
    const ex = await getTodayExercise();
    setExerciseMinutes(ex.totalMinutes);
    if (anchor?.t0_timestamp) {
      setT0(new Date(anchor.t0_timestamp));
      const schedule = await getTodaySchedule();
      setDoses(schedule);
    } else {
      setT0(null);
      setDoses([]);
    }
  }, []);

  useEffect(() => {
    loadDay();
    const interval = setInterval(loadDay, 60_000);
    return () => clearInterval(interval);
  }, [loadDay]);

  const handleStartDay = async () => {
    setStarting(true);
    try {
      const schedule = await startDay();
      setT0(new Date());
      setDoses(schedule);
    } finally {
      setStarting(false);
    }
  };

  const handleAddWater = async () => {
    await addWater(250);
    setWaterMl((prev) => prev + 250);
  };

  const handleLogExercise = async () => {
    await logExercise(30, 'walk');
    setExerciseMinutes(prev => prev + 30);
  };

  const handleTook = async (dose: ScheduledDose) => {
    if (dose.logId) {
      await confirmDose(dose.logId);
    }
    setSelectedDose(null);
    await loadDay();
  };

  const handleSkip = async (dose: ScheduledDose) => {
    if (dose.logId) {
      await skipDose(dose.logId);
    }
    setSelectedDose(null);
    await loadDay();
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadDay();
    setRefreshing(false);
  };

  if (!t0) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <Text style={styles.greeting}>Coimbra Protocol</Text>
          <Text style={styles.subtitle}>
            Tap when you're ready to take your first supplement.{'\n'}
            This sets your schedule for the day.
          </Text>
          <StartDayButton onPress={handleStartDay} loading={starting} />
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
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#22c55e" />
        }
      >
        <Text style={styles.heading}>Today's Doses</Text>
        {doses.map((dose) => (
          <DoseRow key={dose.id} dose={dose} onPress={() => setSelectedDose(dose)} />
        ))}
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
  heading: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 16,
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
});
