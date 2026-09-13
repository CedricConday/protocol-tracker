import { useCallback, useState } from 'react';
import {
  ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { getTodayExercise, localDateStr, logExercise, todayStr } from '../db/queries';

/**
 * The Exercise screen (PT-trio round 3, C3).
 *
 * `logExercise` and `getTodayExercise` have existed since before the audit and
 * are called from the Today tab, but there was no screen: the day's total was a
 * number on a card with no way to see how it was reached or what kind of
 * movement it was.
 *
 * `getTodayExercise` takes a date despite the name, so the 7-day strip is seven
 * calls and needs nothing new from the data layer — unlike sun, which is why
 * that screen has a stub where this one has a chart.
 *
 * NO CORRECTION PATH, and the screen says so. `exercise_logs` is INSERT-only:
 * there is no undo, no edit and no delete anywhere in src/, so a mis-tap here is
 * permanent the way water was before `undoLastWater`. Adding one is a data-layer
 * change, which is Build A's this round — filed as handoff H14.
 */

const DAY3 = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const STEP = 5;
const MIN_MINUTES = 5;
const MAX_MINUTES = 600;
const PRESETS = [15, 30, 45, 60];

const TYPES: { id: string; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: 'walk', label: 'Walk', icon: 'walk-outline' },
  { id: 'run', label: 'Run', icon: 'flash-outline' },
  { id: 'cycle', label: 'Cycle', icon: 'bicycle-outline' },
  { id: 'strength', label: 'Strength', icon: 'barbell-outline' },
  { id: 'other', label: 'Other', icon: 'ellipsis-horizontal-outline' },
];

const INTENSITIES = [
  { id: 'light', label: 'Light' },
  { id: 'moderate', label: 'Moderate' },
  { id: 'vigorous', label: 'Vigorous' },
];

export default function ExerciseScreen() {
  const [loading, setLoading] = useState(true);
  const [today, setToday] = useState({ totalMinutes: 0, logged: false, type: 'walk', intensity: 'moderate' });
  const [week, setWeek] = useState<{ day: string; minutes: number }[]>([]);

  const [minutes, setMinutes] = useState(30);
  const [draft, setDraft] = useState('30');
  const [type, setType] = useState('walk');
  const [intensity, setIntensity] = useState('moderate');

  const load = useCallback(async () => {
    try {
      setToday(await getTodayExercise(todayStr()));

      const todayIdx = (new Date().getDay() + 6) % 7;
      const days: { day: string; minutes: number }[] = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const day = await getTodayExercise(localDateStr(d));
        days.push({ day: DAY3[(todayIdx - i + 7) % 7], minutes: day.totalMinutes });
      }
      setWeek(days);
    } catch (e) {
      console.error('[Exercise] load failed:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const setBoth = (next: number) => {
    const clamped = Math.max(MIN_MINUTES, Math.min(MAX_MINUTES, next));
    setMinutes(clamped);
    setDraft(String(clamped));
  };

  const commitDraft = () => {
    const parsed = parseInt(draft.replace(/[^0-9]/g, ''), 10);
    setBoth(Number.isFinite(parsed) ? parsed : minutes);
  };

  const handleLog = async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await logExercise(minutes, type, todayStr(), intensity);
    await load();
  };

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color="#2F8F5B" />
      </View>
    );
  }

  const peak = Math.max(30, ...week.map((w) => w.minutes), 1);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.labelRow}>
            <Ionicons name="walk-outline" size={18} color="#2F8F5B" />
            <Text style={styles.cardLabel}>Today</Text>
          </View>
          <Text style={styles.cardValue}>
            {today.totalMinutes}
            <Text style={styles.cardUnit}> min</Text>
          </Text>
        </View>
        <Text style={styles.cardSub}>
          {today.logged
            ? `Last logged: ${today.type}, ${today.intensity}.`
            : 'Nothing logged yet today.'}
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>How long</Text>
        <View style={styles.stepperRow}>
          <TouchableOpacity
            style={styles.stepBtn}
            onPress={() => setBoth(minutes - STEP)}
            accessibilityRole="button"
            accessibilityLabel="Decrease minutes"
          >
            <Text style={styles.stepBtnText}>−</Text>
          </TouchableOpacity>

          <View style={styles.field}>
            <TextInput
              style={styles.fieldInput}
              value={draft}
              onChangeText={setDraft}
              onBlur={commitDraft}
              onSubmitEditing={commitDraft}
              keyboardType="number-pad"
              accessibilityLabel="Minutes of exercise to log"
            />
            <Text style={styles.fieldUnit}>min</Text>
          </View>

          <TouchableOpacity
            style={styles.stepBtn}
            onPress={() => setBoth(minutes + STEP)}
            accessibilityRole="button"
            accessibilityLabel="Increase minutes"
          >
            <Text style={styles.stepBtnText}>+</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.presetRow}>
          {PRESETS.map((m) => (
            <TouchableOpacity
              key={m}
              style={[styles.preset, minutes === m ? styles.presetActive : null]}
              onPress={() => setBoth(m)}
              accessibilityRole="button"
              accessibilityLabel={`Set ${m} minutes`}
            >
              <Text style={[styles.presetText, minutes === m ? styles.presetTextActive : null]}>{m}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>What kind</Text>
        <View style={styles.chipRow}>
          {TYPES.map((entry) => (
            <TouchableOpacity
              key={entry.id}
              style={[styles.typeChip, type === entry.id ? styles.typeChipActive : null]}
              onPress={() => setType(entry.id)}
              accessibilityRole="button"
              accessibilityLabel={`Exercise type: ${entry.label}`}
              accessibilityState={{ selected: type === entry.id }}
            >
              <Ionicons name={entry.icon} size={16} color={type === entry.id ? '#2F8F5B' : '#5A6478'} />
              <Text style={[styles.chipText, type === entry.id ? styles.chipTextActive : null]}>{entry.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>How hard</Text>
        <View style={styles.chipRow}>
          {INTENSITIES.map((entry) => (
            <TouchableOpacity
              key={entry.id}
              style={[styles.intensityChip, intensity === entry.id ? styles.typeChipActive : null]}
              onPress={() => setIntensity(entry.id)}
              accessibilityRole="button"
              accessibilityLabel={`Intensity: ${entry.label}`}
              accessibilityState={{ selected: intensity === entry.id }}
            >
              <Text style={[styles.chipText, intensity === entry.id ? styles.chipTextActive : null]}>{entry.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <TouchableOpacity
        style={styles.logBtn}
        onPress={handleLog}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={`Log ${minutes} minutes of ${type}, ${intensity}`}
      >
        <Text style={styles.logBtnText}>Log {minutes} min</Text>
      </TouchableOpacity>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Last 7 days</Text>
        <View style={styles.weekRow}>
          {week.map((w) => (
            <View key={w.day} style={styles.weekCol}>
              <Text style={styles.weekValue}>{w.minutes > 0 ? w.minutes : ''}</Text>
              <View style={styles.weekTrack}>
                <View
                  style={[
                    styles.weekFill,
                    { height: `${Math.min(100, (w.minutes / peak) * 100)}%` as `${number}%` },
                  ]}
                />
              </View>
              <Text style={styles.weekDay}>{w.day}</Text>
            </View>
          ))}
        </View>
      </View>

      <Text style={styles.note}>
        Exercise entries cannot be edited or removed yet — the table is insert-only and the
        correction belongs in the data layer, which another build owns this round. Filed as
        handoff H14.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F7F2' },
  content: { padding: 20, paddingBottom: 40 },
  loading: { flex: 1, backgroundColor: '#F7F7F2', alignItems: 'center', justifyContent: 'center' },

  card: { backgroundColor: '#ECEDE6', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#DBDDD3' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cardLabel: { color: '#5A6478', fontSize: 14, fontWeight: '600' },
  cardValue: { color: '#14213D', fontSize: 22, fontWeight: '800' },
  cardUnit: { color: '#9AA3B2', fontSize: 13, fontWeight: '500' },
  cardSub: { color: '#5A6478', fontSize: 13, marginTop: 6 },

  section: { marginTop: 22 },
  sectionTitle: { color: '#14213D', fontSize: 15, fontWeight: '700', marginBottom: 10 },
  note: { color: '#9AA3B2', fontSize: 11, lineHeight: 17, marginTop: 22 },

  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  stepBtn: { width: 46, height: 46, borderRadius: 12, backgroundColor: '#ECEDE6', borderWidth: 1, borderColor: '#CFD2C6', alignItems: 'center', justifyContent: 'center' },
  stepBtnText: { color: '#5A6478', fontSize: 22, fontWeight: '600', lineHeight: 26 },
  field: { flex: 1, height: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, borderRadius: 12, backgroundColor: '#ECEDE6', borderWidth: 1, borderColor: '#CFD2C6' },
  fieldInput: { minWidth: 56, textAlign: 'right', color: '#14213D', fontSize: 19, fontWeight: '700', padding: 0 },
  fieldUnit: { color: '#9AA3B2', fontSize: 14, fontWeight: '600' },

  presetRow: { flexDirection: 'row', gap: 7 },
  preset: { flex: 1, height: 44, borderRadius: 11, backgroundColor: '#ECEDE6', borderWidth: 1, borderColor: '#CFD2C6', alignItems: 'center', justifyContent: 'center' },
  presetActive: { backgroundColor: '#EAF5EE', borderColor: '#2F8F5B' },
  presetText: { color: '#5A6478', fontSize: 14, fontWeight: '600' },
  presetTextActive: { color: '#2F8F5B', fontWeight: '700' },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  typeChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, height: 40, borderRadius: 11, backgroundColor: '#ECEDE6', borderWidth: 1, borderColor: '#CFD2C6' },
  intensityChip: { flex: 1, alignItems: 'center', justifyContent: 'center', height: 40, borderRadius: 11, backgroundColor: '#ECEDE6', borderWidth: 1, borderColor: '#CFD2C6' },
  typeChipActive: { backgroundColor: '#EAF5EE', borderColor: '#2F8F5B' },
  chipText: { color: '#5A6478', fontSize: 13, fontWeight: '600' },
  chipTextActive: { color: '#2F8F5B', fontWeight: '700' },

  logBtn: { height: 48, borderRadius: 12, backgroundColor: '#2F8F5B', alignItems: 'center', justifyContent: 'center', marginTop: 22 },
  logBtnText: { color: '#F7F7F2', fontSize: 15, fontWeight: '700' },

  weekRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 120 },
  weekCol: { flex: 1, alignItems: 'center' },
  weekValue: { color: '#9AA3B2', fontSize: 10, height: 14 },
  weekTrack: { width: '70%', height: 80, backgroundColor: '#E4E5DD', borderRadius: 5, overflow: 'hidden', justifyContent: 'flex-end' },
  weekFill: { width: '100%', borderRadius: 5, backgroundColor: '#2F8F5B' },
  weekDay: { color: '#5A6478', fontSize: 11, marginTop: 6 },
});
