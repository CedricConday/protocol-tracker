import { useCallback, useState } from 'react';
import {
  ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import {
  correctExerciseLog, deleteExerciseLog, getExerciseHistory, getExerciseLogs, getMiscFlag,
  getTodayExercise, localDateStr, logExercise, setMiscFlag, todayStr,
} from '../db/queries';

import { t, useLanguage, locale } from '../i18n';
import { useToday } from '../hooks/useToday';
import { weekdaysShort } from '../i18n/dates';
/**
 * The Exercise screen (PT-trio round 3, C3).
 *
 * `logExercise` and `getTodayExercise` have existed since before the audit and
 * are called from the Today tab, but there was no screen: the day's total was a
 * number on a card with no way to see how it was reached or what kind of
 * movement it was.
 *
 * `getTodayExercise` takes a date despite the name, so the 7-day strip is seven
 * calls and needs nothing new from the data layer.
 *
 * ENTRIES ARE NOW CORRECTABLE. This screen used to say that `exercise_logs` was
 * INSERT-only and a mis-tap was permanent — true of the READERS, not of the
 * table: it has kept id, duration, type, intensity and logged_at per session
 * since before the audit, and nothing ever read them back individually.
 * `getExerciseLogs`, `deleteExerciseLog` and `correctExerciseLog` close that,
 * so the day is a list you can fix rather than a number you are stuck with.
 *
 * THE GOAL lives in `misc_flags`, the same place Water's and Sunlight's do.
 */

export const EXERCISE_GOAL_FLAG = 'exercise_goal_min';

export const DEFAULT_GOAL_MIN = 30;
const GOAL_STEP = 5;
const GOAL_MIN_LIMIT = 5;
const GOAL_MAX_LIMIT = 600;
const HISTORY_DAYS = 30;

type Entry = { id: number; duration_minutes: number; type: string; intensity: string; logged_at: number };
type HistoryDay = { date: string; total_minutes: number; entries: number };

function formatClock(ms: number): string {
  return new Date(ms).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });
}

function formatDay(iso: string, today: string): string {
  if (iso === today) return 'Today';
  // Midday so a timezone offset cannot roll the label onto the neighbouring day.
  return new Date(`${iso}T12:00:00`).toLocaleDateString(locale(), { weekday: 'short', day: 'numeric', month: 'short' });
}
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
  useLanguage(); // re-render this screen when the language changes
  const [loading, setLoading] = useState(true);
  const [today, setToday] = useState({ totalMinutes: 0, logged: false, type: 'walk', intensity: 'moderate' });
  const [week, setWeek] = useState<{ day: string; minutes: number }[]>([]);

  const [entries, setEntries] = useState<Entry[]>([]);
  const [history, setHistory] = useState<HistoryDay[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [goalMin, setGoalMin] = useState(DEFAULT_GOAL_MIN);
  const [goalDraft, setGoalDraft] = useState(String(DEFAULT_GOAL_MIN));
  const [editingGoal, setEditingGoal] = useState(false);

  const [minutes, setMinutes] = useState(30);
  const [draft, setDraft] = useState('30');
  const [type, setType] = useState('walk');
  const [intensity, setIntensity] = useState('moderate');

  // Not `todayStr()` inside load: the screen stays mounted across midnight, and
  // a load keyed on a value read once would keep reporting yesterday. The hook
  // changes at the boundary, which re-creates `load` and re-fires the focus
  // effect below.
  const day = useToday();

  const load = useCallback(async () => {
    try {
      setToday(await getTodayExercise(day));
      setEntries(await getExerciseLogs(day));
      setHistory(await getExerciseHistory(HISTORY_DAYS, day));

      const stored = await getMiscFlag(EXERCISE_GOAL_FLAG);
      const parsedGoal = stored === null ? NaN : parseInt(stored, 10);
      const goal = Number.isFinite(parsedGoal) && parsedGoal > 0 ? parsedGoal : DEFAULT_GOAL_MIN;
      setGoalMin(goal);
      setGoalDraft(String(goal));

      const todayIdx = (new Date().getDay() + 6) % 7;
      const days: { day: string; minutes: number }[] = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const day = await getTodayExercise(localDateStr(d));
        days.push({ day: weekdaysShort()[(todayIdx - i + 7) % 7], minutes: day.totalMinutes });
      }
      setWeek(days);
    } catch (e) {
      console.error('[Exercise] load failed:', e);
    } finally {
      setLoading(false);
    }
  }, [day]);

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

  const handleRemove = async (entry: Entry) => {
    const removed = await deleteExerciseLog(entry.id);
    if (!removed) {
      // The row went while the screen was open — reload rather than claim
      // something happened.
      await load();
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await load();
  };

  const beginEdit = (entry: Entry) => {
    setEditingId(entry.id);
    setEditDraft(String(entry.duration_minutes));
  };

  const commitEdit = async (entry: Entry) => {
    const parsed = parseInt(editDraft.replace(/[^0-9]/g, ''), 10);
    setEditingId(null);
    // An unreadable draft means nothing usable was typed; leave the session as
    // it was rather than writing 0 over it.
    if (!Number.isFinite(parsed)) return;
    if (parsed === entry.duration_minutes) return;
    await correctExerciseLog(entry.id, Math.min(MAX_MINUTES, parsed));
    await load();
  };

  const commitGoal = async () => {
    const parsed = parseInt(goalDraft.replace(/[^0-9]/g, ''), 10);
    setEditingGoal(false);
    if (!Number.isFinite(parsed)) { setGoalDraft(String(goalMin)); return; }
    const next = Math.max(GOAL_MIN_LIMIT, Math.min(GOAL_MAX_LIMIT, parsed));
    await setMiscFlag(EXERCISE_GOAL_FLAG, String(next));
    setGoalMin(next);
    setGoalDraft(String(next));
  };

  const nudgeGoal = async (delta: number) => {
    const next = Math.max(GOAL_MIN_LIMIT, Math.min(GOAL_MAX_LIMIT, goalMin + delta));
    await setMiscFlag(EXERCISE_GOAL_FLAG, String(next));
    setGoalMin(next);
    setGoalDraft(String(next));
  };

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color="#2F8F5B" />
      </View>
    );
  }

  const peak = Math.max(goalMin, ...week.map((w) => w.minutes), 1);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.labelRow}>
            <Ionicons name="walk-outline" size={18} color="#2F8F5B" />
            <Text style={styles.cardLabel}>{t('trkToday')}</Text>
          </View>
          <Text style={styles.cardValue}>
            {today.totalMinutes}
            <Text style={styles.cardUnit}> min</Text>
          </Text>
        </View>
        <Text style={styles.cardSub}>
          {today.logged
            ? `Last logged: ${today.type}, ${today.intensity}. Goal ${goalMin} min.`
            : `Nothing logged yet today. Goal ${goalMin} min.`}
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('trkDailyGoal')}</Text>
        <View style={styles.goalRow}>
          <TouchableOpacity
            style={styles.goalBtn}
            onPress={() => nudgeGoal(-GOAL_STEP)}
            accessibilityRole="button"
            accessibilityLabel={t('exGoalDown')}
          >
            <Text style={styles.goalBtnText}>−</Text>
          </TouchableOpacity>

          {editingGoal ? (
            <TextInput
              style={styles.goalField}
              value={goalDraft}
              onChangeText={setGoalDraft}
              onBlur={commitGoal}
              onSubmitEditing={commitGoal}
              keyboardType="number-pad"
              autoFocus
              accessibilityLabel={t('exGoalField')}
            />
          ) : (
            <TouchableOpacity
              style={styles.goalValue}
              onPress={() => setEditingGoal(true)}
              accessibilityRole="button"
              accessibilityLabel={`Daily exercise goal, ${goalMin} minutes. Tap to edit.`}
            >
              <Text style={styles.goalValueText}>{goalMin} min</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={styles.goalBtn}
            onPress={() => nudgeGoal(GOAL_STEP)}
            accessibilityRole="button"
            accessibilityLabel={t('exGoalUp')}
          >
            <Text style={styles.goalBtnText}>+</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('exHowLong')}</Text>
        <View style={styles.stepperRow}>
          <TouchableOpacity
            style={styles.stepBtn}
            onPress={() => setBoth(minutes - STEP)}
            accessibilityRole="button"
            accessibilityLabel={t('exMinutesDown')}
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
              accessibilityLabel={t('exMinutesField')}
            />
            <Text style={styles.fieldUnit}>min</Text>
          </View>

          <TouchableOpacity
            style={styles.stepBtn}
            onPress={() => setBoth(minutes + STEP)}
            accessibilityRole="button"
            accessibilityLabel={t('exMinutesUp')}
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
        <Text style={styles.sectionTitle}>{t('exWhatKind')}</Text>
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
        <Text style={styles.sectionTitle}>{t('exHowHard')}</Text>
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
        <Text style={styles.sectionTitle}>{t('trkLast7')}</Text>
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

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{t('trkTodaysSessions')}</Text>
          <Text style={styles.sectionCount}>{entries.length}</Text>
        </View>

        {entries.length === 0 ? (
          <Text style={styles.empty}>{t('trkNothingToday')}</Text>
        ) : (
          entries.map((entry) => (
            <View key={entry.id} style={styles.entryRow}>
              <Text style={styles.entryTime}>{formatClock(entry.logged_at)}</Text>

              {editingId === entry.id ? (
                <TextInput
                  style={styles.entryField}
                  value={editDraft}
                  onChangeText={setEditDraft}
                  onBlur={() => commitEdit(entry)}
                  onSubmitEditing={() => commitEdit(entry)}
                  keyboardType="number-pad"
                  autoFocus
                  accessibilityLabel={`Correct the ${entry.duration_minutes} minute ${entry.type}`}
                />
              ) : (
                <TouchableOpacity
                  style={styles.entryAmountWrap}
                  onPress={() => beginEdit(entry)}
                  accessibilityRole="button"
                  accessibilityLabel={`${entry.duration_minutes} minutes of ${entry.type}, ${entry.intensity}, at ${formatClock(entry.logged_at)}. Tap to correct.`}
                >
                  <Text style={styles.entryAmount}>{entry.duration_minutes} min</Text>
                  <Text style={styles.entryMeta}>{entry.type} · {entry.intensity}</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={styles.removeBtn}
                onPress={() => handleRemove(entry)}
                accessibilityRole="button"
                accessibilityLabel={`Remove the ${entry.duration_minutes} minute ${entry.type} logged at ${formatClock(entry.logged_at)}`}
              >
                <Text style={styles.removeBtnText}>{t('trkRemove')}</Text>
              </TouchableOpacity>
            </View>
          ))
        )}
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Last {HISTORY_DAYS} days</Text>
          <Text style={styles.sectionCount}>{history.length}</Text>
        </View>

        {history.length === 0 ? (
          <Text style={styles.empty}>{t('exNoneYet')}</Text>
        ) : (
          history.map((h) => (
            <View key={h.date} style={styles.histRow}>
              <Text style={[styles.histDay, h.date === day && styles.histDayToday]}>
                {formatDay(h.date, day)}
              </Text>
              <View style={styles.histBarTrack}>
                <View
                  style={[
                    styles.histBarFill,
                    h.total_minutes >= goalMin && styles.histBarFillDone,
                    { width: `${Math.min(100, (h.total_minutes / Math.max(goalMin, ...history.map((x) => x.total_minutes), 1)) * 100)}%` as `${number}%` },
                  ]}
                />
              </View>
              <Text style={styles.histValue}>{h.total_minutes} min</Text>
            </View>
          ))
        )}
      </View>
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
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  sectionTitle: { color: '#14213D', fontSize: 15, fontWeight: '700', marginBottom: 10 },
  sectionCount: { color: '#9AA3B2', fontSize: 13, fontWeight: '700', marginBottom: 10 },
  empty: { color: '#9AA3B2', fontSize: 13, fontStyle: 'italic', paddingVertical: 8 },
  note: { color: '#9AA3B2', fontSize: 11, lineHeight: 17, marginTop: 22 },

  goalRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  goalBtn: { width: 46, height: 46, borderRadius: 12, backgroundColor: '#ECEDE6', borderWidth: 1, borderColor: '#CFD2C6', alignItems: 'center', justifyContent: 'center' },
  goalBtnText: { color: '#14213D', fontSize: 20, fontWeight: '700' },
  goalValue: { flex: 1, height: 46, borderRadius: 12, backgroundColor: '#ECEDE6', borderWidth: 1, borderColor: '#CFD2C6', alignItems: 'center', justifyContent: 'center' },
  goalValueText: { color: '#14213D', fontSize: 17, fontWeight: '700' },
  goalField: { flex: 1, height: 46, borderRadius: 12, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#2F8F5B', textAlign: 'center', color: '#14213D', fontSize: 17, fontWeight: '700' },

  entryRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#E6E7DF' },
  entryTime: { color: '#9AA3B2', fontSize: 13, width: 58 },
  entryAmountWrap: { flex: 1 },
  entryAmount: { color: '#14213D', fontSize: 15, fontWeight: '700' },
  entryMeta: { color: '#9AA3B2', fontSize: 11, marginTop: 1 },
  entryField: { flex: 1, height: 38, borderRadius: 9, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#2F8F5B', paddingHorizontal: 10, color: '#14213D', fontSize: 15, fontWeight: '700' },
  removeBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 9, backgroundColor: '#FBEAEA', borderWidth: 1, borderColor: '#E7C6C6' },
  removeBtnText: { color: '#B3453E', fontSize: 12, fontWeight: '700' },

  histRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 5 },
  histDay: { color: '#5A6478', fontSize: 12, width: 86 },
  histDayToday: { color: '#14213D', fontWeight: '700' },
  histBarTrack: { flex: 1, height: 8, borderRadius: 4, backgroundColor: '#E6E7DF', overflow: 'hidden' },
  histBarFill: { height: 8, borderRadius: 4, backgroundColor: '#A8D5BC' },
  histBarFillDone: { backgroundColor: '#2F8F5B' },
  histValue: { color: '#14213D', fontSize: 12, fontWeight: '700', width: 56, textAlign: 'right' },

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
