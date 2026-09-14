import { useCallback, useState } from 'react';
import {
  ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import SunTracker, { DEFAULT_SUN_GOAL_MIN } from '../components/SunTracker';
import {
  clearSunLog, correctSunEntry, correctSunLog, deleteSunEntry, getMiscFlag,
  getSunEntries, getSunHistory, getTodaySunLog, logSunExposure, setMiscFlag, todayStr,
} from '../db/queries';

import { t, useLanguage, locale } from '../i18n';
/**
 * The Sunlight screen.
 *
 * This screen used to say, honestly, that it could not do two of the things
 * Water did: there was no entry list, because `sun_log.date` is UNIQUE and a
 * day was ONE aggregated row; and there was no history, because the only reader
 * was `getTodaySunLog`, hardcoded to today. Both were real, both were filed,
 * and both are now fixed underneath rather than worked around here.
 *
 * `sun_entries` holds one row per session and `sun_log` keeps the day total,
 * derived from it — see the migration in schema.ts and `recomputeSunDay` in
 * queries.ts. Everything that already read sun reads the total and is unaffected.
 *
 * THE GOAL lives in `misc_flags`, the same as Water's, and is passed to
 * SunTracker as `goalMin`. The card hardcoded 30, so before this the card could
 * contradict the goal the user had just set on this screen.
 */

export const SUN_GOAL_FLAG = 'sun_goal_min';

const MAX_MIN = 600;
const GOAL_STEP = 5;
const GOAL_MIN_LIMIT = 5;
const GOAL_MAX_LIMIT = 600;
const HISTORY_DAYS = 30;

type Entry = { id: number; minutes: number; logged_at: number };
type HistoryDay = { date: string; minutes: number; notes: string; entries: number };

function formatClock(ms: number): string {
  return new Date(ms).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });
}

function formatDay(iso: string, today: string): string {
  if (iso === today) return 'Today';
  // Parsed at midday so a timezone offset cannot roll the label onto the
  // neighbouring day — the same trap the day-key work chased through the app.
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString(locale(), { weekday: 'short', day: 'numeric', month: 'short' });
}

export default function SunlightScreen() {
  useLanguage(); // re-render this screen when the language changes
  const [loading, setLoading] = useState(true);
  const [minutes, setMinutes] = useState(0);
  const [notes, setNotes] = useState('');
  const [savedNotes, setSavedNotes] = useState('');
  const [entries, setEntries] = useState<Entry[]>([]);
  const [history, setHistory] = useState<HistoryDay[]>([]);
  const [correcting, setCorrecting] = useState(false);
  const [correctDraft, setCorrectDraft] = useState('0');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [goalMin, setGoalMin] = useState(DEFAULT_SUN_GOAL_MIN);
  const [goalDraft, setGoalDraft] = useState(String(DEFAULT_SUN_GOAL_MIN));
  const [editingGoal, setEditingGoal] = useState(false);

  const load = useCallback(async () => {
    try {
      const today = todayStr();
      const day = await getTodaySunLog();
      setMinutes(day?.minutes ?? 0);
      setNotes(day?.notes ?? '');
      setSavedNotes(day?.notes ?? '');
      setCorrectDraft(String(day?.minutes ?? 0));
      setEntries(await getSunEntries(today));
      setHistory(await getSunHistory(HISTORY_DAYS, today));

      const stored = await getMiscFlag(SUN_GOAL_FLAG);
      const parsed = stored === null ? NaN : parseInt(stored, 10);
      const goal = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_SUN_GOAL_MIN;
      setGoalMin(goal);
      setGoalDraft(String(goal));
    } catch (e) {
      console.error('[Sunlight] load failed:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleLog = async (mins: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await logSunExposure(mins);
    await load();
  };

  const handleRemove = async (entry: Entry) => {
    const removed = await deleteSunEntry(entry.id);
    if (!removed) {
      Alert.alert(t('trkAlreadyGone'), t('sunGoneSub'));
      await load();
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await load();
  };

  const beginEdit = (entry: Entry) => {
    setEditingId(entry.id);
    setEditDraft(String(entry.minutes));
  };

  const commitEdit = async (entry: Entry) => {
    const parsed = parseInt(editDraft.replace(/[^0-9]/g, ''), 10);
    setEditingId(null);
    // An unreadable draft means nothing usable was typed; leaving the session
    // as it was is the honest outcome, not writing 0 over it.
    if (!Number.isFinite(parsed)) return;
    if (parsed === entry.minutes) return;
    await correctSunEntry(entry.id, Math.min(MAX_MIN, parsed));
    await load();
  };

  const commitCorrection = async () => {
    const parsed = parseInt(correctDraft.replace(/[^0-9]/g, ''), 10);
    setCorrecting(false);
    if (!Number.isFinite(parsed)) { setCorrectDraft(String(minutes)); return; }
    const next = Math.max(0, Math.min(MAX_MIN, parsed));
    // `notes` deliberately omitted: correctSunLog keeps the existing note when
    // it is undefined, and correcting minutes must not silently wipe the note.
    await correctSunLog(next);
    await load();
  };

  const commitNotes = async () => {
    if (notes === savedNotes) return;
    // Passing the note explicitly IS the erase path when it is empty — the
    // documented difference between `undefined` and `''` in correctSunLog.
    await correctSunLog(minutes, undefined, notes);
    setSavedNotes(notes);
  };

  const commitGoal = async () => {
    const parsed = parseInt(goalDraft.replace(/[^0-9]/g, ''), 10);
    setEditingGoal(false);
    if (!Number.isFinite(parsed)) { setGoalDraft(String(goalMin)); return; }
    const next = Math.max(GOAL_MIN_LIMIT, Math.min(GOAL_MAX_LIMIT, parsed));
    await setMiscFlag(SUN_GOAL_FLAG, String(next));
    setGoalMin(next);
    setGoalDraft(String(next));
  };

  const nudgeGoal = async (delta: number) => {
    const next = Math.max(GOAL_MIN_LIMIT, Math.min(GOAL_MAX_LIMIT, goalMin + delta));
    await setMiscFlag(SUN_GOAL_FLAG, String(next));
    setGoalMin(next);
    setGoalDraft(String(next));
  };

  const handleClear = () => {
    if (minutes === 0 && savedNotes === '' && entries.length === 0) return;
    Alert.alert(
      t('sunClearConfirm'),
      t('sunClearConfirmSub'),
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => { await clearSunLog(); await load(); },
        },
      ],
    );
  };

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color="#F2B233" />
      </View>
    );
  }

  const today = todayStr();
  const peak = Math.max(goalMin, ...history.map((h) => h.minutes), 1);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <SunTracker sunMinutes={minutes} onLog={handleLog} goalMin={goalMin} />

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('trkDailyGoal')}</Text>
        <View style={styles.goalRow}>
          <TouchableOpacity
            style={styles.goalBtn}
            onPress={() => nudgeGoal(-GOAL_STEP)}
            accessibilityRole="button"
            accessibilityLabel={t('sunGoalDown')}
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
              accessibilityLabel={t('sunGoalField')}
            />
          ) : (
            <TouchableOpacity
              style={styles.goalValue}
              onPress={() => setEditingGoal(true)}
              accessibilityRole="button"
              accessibilityLabel={`Daily sunlight goal, ${goalMin} minutes. Tap to edit.`}
            >
              <Text style={styles.goalValueText}>{goalMin} min</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={styles.goalBtn}
            onPress={() => nudgeGoal(GOAL_STEP)}
            accessibilityRole="button"
            accessibilityLabel={t('sunGoalUp')}
          >
            <Text style={styles.goalBtnText}>+</Text>
          </TouchableOpacity>
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
                  accessibilityLabel={`Correct the ${entry.minutes} minute session`}
                />
              ) : (
                <TouchableOpacity
                  style={styles.entryAmountWrap}
                  onPress={() => beginEdit(entry)}
                  accessibilityRole="button"
                  accessibilityLabel={`${entry.minutes} minutes at ${formatClock(entry.logged_at)}. Tap to correct.`}
                >
                  <Text style={styles.entryAmount}>{entry.minutes} min</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={styles.removeBtn}
                onPress={() => handleRemove(entry)}
                accessibilityRole="button"
                accessibilityLabel={`Remove the ${entry.minutes} minute session logged at ${formatClock(entry.logged_at)}`}
              >
                <Text style={styles.removeBtnText}>{t('trkRemove')}</Text>
              </TouchableOpacity>
            </View>
          ))
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('sunCorrectTotal')}</Text>
        <Text style={styles.sectionBody}>
          This sets the day outright and replaces its sessions with one entry. Use it when
          the number is wrong — to remove a single session, use Remove above.
        </Text>
        <View style={styles.correctRow}>
          {correcting ? (
            <TextInput
              style={styles.correctField}
              value={correctDraft}
              onChangeText={setCorrectDraft}
              onBlur={commitCorrection}
              onSubmitEditing={commitCorrection}
              keyboardType="number-pad"
              autoFocus
              accessibilityLabel={t('sunSetTodayA11y')}
            />
          ) : (
            <TouchableOpacity
              style={styles.correctValue}
              onPress={() => setCorrecting(true)}
              accessibilityRole="button"
              accessibilityLabel={`Today is ${minutes} minutes. Tap to set it to something else.`}
            >
              <Text style={styles.correctValueText}>{minutes} min</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={styles.clearBtn}
            onPress={handleClear}
            accessibilityRole="button"
            accessibilityLabel={t('sunClearTodayA11y')}
          >
            <Text style={styles.clearBtnText}>{t('sunClearDay')}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('trkNote')}</Text>
        <TextInput
          style={styles.noteField}
          value={notes}
          onChangeText={setNotes}
          onBlur={commitNotes}
          placeholder={t('sunNotePlaceholder')}
          placeholderTextColor="#9AA3B2"
          multiline
          accessibilityLabel="Note about today's sun exposure"
        />
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Last {HISTORY_DAYS} days</Text>
          <Text style={styles.sectionCount}>{history.length}</Text>
        </View>

        {history.length === 0 ? (
          <Text style={styles.empty}>{t('sunNoneYet')}</Text>
        ) : (
          history.map((h) => (
            <View key={h.date} style={styles.histRow}>
              <Text style={[styles.histDay, h.date === today && styles.histDayToday]}>
                {formatDay(h.date, today)}
              </Text>
              <View style={styles.histBarTrack}>
                <View
                  style={[
                    styles.histBarFill,
                    h.minutes >= goalMin && styles.histBarFillDone,
                    { width: `${Math.min(100, (h.minutes / peak) * 100)}%` as `${number}%` },
                  ]}
                />
              </View>
              <Text style={styles.histValue}>{h.minutes} min</Text>
            </View>
          ))
        )}
        {history.some((h) => h.notes) ? (
          <Text style={styles.note}>{t('sunNoteKept')}</Text>
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F7F2' },
  content: { padding: 20, paddingBottom: 40 },
  loading: { flex: 1, backgroundColor: '#F7F7F2', alignItems: 'center', justifyContent: 'center' },
  section: { marginTop: 22 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  sectionTitle: { color: '#14213D', fontSize: 15, fontWeight: '700', marginBottom: 6 },
  sectionCount: { color: '#9AA3B2', fontSize: 13, fontWeight: '700', marginBottom: 6 },
  sectionBody: { color: '#5A6478', fontSize: 13, lineHeight: 19, marginBottom: 10 },
  empty: { color: '#9AA3B2', fontSize: 13, fontStyle: 'italic', paddingVertical: 8 },
  note: { color: '#9AA3B2', fontSize: 12, lineHeight: 18, marginTop: 8 },

  goalRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  goalBtn: { width: 46, height: 46, borderRadius: 12, backgroundColor: '#ECEDE6', borderWidth: 1, borderColor: '#CFD2C6', alignItems: 'center', justifyContent: 'center' },
  goalBtnText: { color: '#14213D', fontSize: 20, fontWeight: '700' },
  goalValue: { flex: 1, height: 46, borderRadius: 12, backgroundColor: '#ECEDE6', borderWidth: 1, borderColor: '#CFD2C6', alignItems: 'center', justifyContent: 'center' },
  goalValueText: { color: '#14213D', fontSize: 17, fontWeight: '700' },
  goalField: { flex: 1, height: 46, borderRadius: 12, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#F2B233', textAlign: 'center', color: '#14213D', fontSize: 17, fontWeight: '700' },

  entryRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#E6E7DF' },
  entryTime: { color: '#9AA3B2', fontSize: 13, width: 58 },
  entryAmountWrap: { flex: 1 },
  entryAmount: { color: '#14213D', fontSize: 15, fontWeight: '700' },
  entryField: { flex: 1, height: 38, borderRadius: 9, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#F2B233', paddingHorizontal: 10, color: '#14213D', fontSize: 15, fontWeight: '700' },
  removeBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 9, backgroundColor: '#FBEAEA', borderWidth: 1, borderColor: '#E7C6C6' },
  removeBtnText: { color: '#B3453E', fontSize: 12, fontWeight: '700' },

  correctRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  correctValue: { flex: 1, height: 46, borderRadius: 12, backgroundColor: '#ECEDE6', borderWidth: 1, borderColor: '#CFD2C6', alignItems: 'center', justifyContent: 'center' },
  correctValueText: { color: '#14213D', fontSize: 17, fontWeight: '700' },
  correctField: { flex: 1, height: 46, borderRadius: 12, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#F2B233', textAlign: 'center', color: '#14213D', fontSize: 17, fontWeight: '700' },
  clearBtn: { paddingHorizontal: 16, height: 46, borderRadius: 12, backgroundColor: '#FBEAEA', borderWidth: 1, borderColor: '#E7C6C6', alignItems: 'center', justifyContent: 'center' },
  clearBtnText: { color: '#B3453E', fontSize: 13, fontWeight: '700' },

  noteField: { minHeight: 84, borderRadius: 12, backgroundColor: '#ECEDE6', borderWidth: 1, borderColor: '#CFD2C6', padding: 12, color: '#14213D', fontSize: 14, lineHeight: 20, textAlignVertical: 'top' },

  histRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 5 },
  histDay: { color: '#5A6478', fontSize: 12, width: 86 },
  histDayToday: { color: '#14213D', fontWeight: '700' },
  histBarTrack: { flex: 1, height: 8, borderRadius: 4, backgroundColor: '#E6E7DF', overflow: 'hidden' },
  histBarFill: { height: 8, borderRadius: 4, backgroundColor: '#F2CE86' },
  histBarFillDone: { backgroundColor: '#F2B233' },
  histValue: { color: '#14213D', fontSize: 12, fontWeight: '700', width: 56, textAlign: 'right' },
});
