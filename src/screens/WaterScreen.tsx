import { useCallback, useState } from 'react';
import {
  ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import WaterTracker, { DEFAULT_GOAL_ML } from '../components/WaterTracker';
import {
  addWater, correctWaterLog, deleteWaterLog, getAnchor, getMiscFlag, getWaterLogs,
  localDateStr, setMiscFlag, todayStr,
} from '../db/queries';

/**
 * The Water screen (PT-trio round 3, C1).
 *
 * The Today tab can only ever add. This screen is the other half: what the day
 * actually holds, entry by entry, with a way to fix each one — `addWater` and
 * `logSunExposure` were the only writers against their tables anywhere in src/,
 * so until now a mis-tap was permanent for that day.
 *
 * WHY THE GOAL LIVES IN `misc_flags`. `getWaterProgress` returns a hardcoded
 * 2500 and is what the Today tab reads, so a goal edited here moves this screen
 * and not that one. Storing it as a flag is the part this lane can do without
 * touching `src/db/**` (Build A's in round 3); making `getWaterProgress` read
 * the flag is filed as a handoff. Until that lands, Today keeps saying 2.5 L —
 * which is wrong, but visibly wrong rather than silently so.
 *
 * EVERY ROW CAN BE REMOVED. It could not until `deleteWaterLog` existed: the
 * only remover was `undoLastWater`, which deletes the day's NEWEST row — the
 * right shape for an undo button on Today, the wrong one for a list. Only the
 * top entry had a Remove button and every row under it was stuck, so a mis-tap
 * three entries back could be edited to some other number but never deleted.
 * `correctWaterLog(id, 0)` was not a substitute: it leaves a 0 ml row in the
 * list describing a drink that never happened. Reported from the device,
 * 2026-09-13.
 */

export const WATER_GOAL_FLAG = 'water_goal_ml';

const DAY3 = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const GOAL_STEP = 250;
const GOAL_MIN = 250;
const GOAL_MAX = 10000;

type Entry = { id: number; amount_ml: number; logged_at: number };

function formatMl(ml: number): string {
  return ml >= 1000 ? `${(ml / 1000).toFixed(1)} L` : `${ml} ml`;
}

function formatClock(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function WaterScreen() {
  const [loading, setLoading] = useState(true);
  const [waterMl, setWaterMl] = useState(0);
  const [goalMl, setGoalMl] = useState(DEFAULT_GOAL_ML);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [week, setWeek] = useState<{ day: string; ml: number }[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [goalDraft, setGoalDraft] = useState(String(DEFAULT_GOAL_ML));
  const [editingGoal, setEditingGoal] = useState(false);

  const load = useCallback(async () => {
    try {
      const today = todayStr();
      const anchor = await getAnchor(today);
      setWaterMl(anchor?.water_ml ?? 0);
      setEntries(await getWaterLogs(today));

      const stored = await getMiscFlag(WATER_GOAL_FLAG);
      const parsed = stored === null ? NaN : parseInt(stored, 10);
      const goal = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_GOAL_ML;
      setGoalMl(goal);
      setGoalDraft(String(goal));

      // Seven days of totals, read one anchor at a time. `useSummaryScreen`
      // already computes this as `waterWeek`, but it also runs compliance, the
      // streak and a 14-day adherence pass to get there — far too much work for
      // a strip, and it is Build A's file besides.
      const todayIdx = (new Date().getDay() + 6) % 7;
      const days: { day: string; ml: number }[] = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const a = await getAnchor(localDateStr(d));
        days.push({ day: DAY3[(todayIdx - i + 7) % 7], ml: a?.water_ml ?? 0 });
      }
      setWeek(days);
    } catch (e) {
      console.error('[Water] load failed:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleAdd = async (amountMl: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await addWater(amountMl);
    await load();
  };

  const handleRemove = async (entry: Entry) => {
    const removed = await deleteWaterLog(entry.id);
    if (!removed) {
      // The row went while the screen was open — reload rather than claim
      // something happened.
      Alert.alert('Already gone', 'That entry is no longer there.');
      await load();
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await load();
  };

  const beginEdit = (entry: Entry) => {
    setEditingId(entry.id);
    setEditDraft(String(entry.amount_ml));
  };

  const commitEdit = async (entry: Entry) => {
    const parsed = parseInt(editDraft.replace(/[^0-9]/g, ''), 10);
    setEditingId(null);
    // An unreadable draft means the user typed nothing usable; leaving the entry
    // as it was is the honest outcome, not writing 0 over it.
    if (!Number.isFinite(parsed)) return;
    if (parsed === entry.amount_ml) return;
    await correctWaterLog(entry.id, parsed);
    await load();
  };

  const commitGoal = async () => {
    const parsed = parseInt(goalDraft.replace(/[^0-9]/g, ''), 10);
    setEditingGoal(false);
    if (!Number.isFinite(parsed)) { setGoalDraft(String(goalMl)); return; }
    const next = Math.max(GOAL_MIN, Math.min(GOAL_MAX, parsed));
    await setMiscFlag(WATER_GOAL_FLAG, String(next));
    setGoalMl(next);
    setGoalDraft(String(next));
  };

  const nudgeGoal = async (delta: number) => {
    const next = Math.max(GOAL_MIN, Math.min(GOAL_MAX, goalMl + delta));
    await setMiscFlag(WATER_GOAL_FLAG, String(next));
    setGoalMl(next);
    setGoalDraft(String(next));
  };

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color="#2AA6B8" />
      </View>
    );
  }

  const peak = Math.max(goalMl, ...week.map((w) => w.ml), 1);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <WaterTracker waterMl={waterMl} onAdd={handleAdd} goalMl={goalMl} />

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Daily goal</Text>
        <View style={styles.goalRow}>
          <TouchableOpacity
            style={styles.goalBtn}
            onPress={() => nudgeGoal(-GOAL_STEP)}
            accessibilityRole="button"
            accessibilityLabel="Lower the daily water goal"
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
              accessibilityLabel="Daily water goal in millilitres"
            />
          ) : (
            <TouchableOpacity
              style={styles.goalValue}
              onPress={() => setEditingGoal(true)}
              accessibilityRole="button"
              accessibilityLabel={`Daily water goal, ${goalMl} millilitres. Tap to edit.`}
            >
              <Text style={styles.goalValueText}>{formatMl(goalMl)}</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={styles.goalBtn}
            onPress={() => nudgeGoal(GOAL_STEP)}
            accessibilityRole="button"
            accessibilityLabel="Raise the daily water goal"
          >
            <Text style={styles.goalBtnText}>+</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.note}>
          The Today tab still shows the 2.5 L default until `getWaterProgress` reads this
          goal — see handoff H12.
        </Text>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Today&apos;s entries</Text>
          <Text style={styles.sectionCount}>{entries.length}</Text>
        </View>

        {entries.length === 0 ? (
          <Text style={styles.empty}>Nothing logged yet today.</Text>
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
                  accessibilityLabel={`Correct the ${entry.amount_ml} millilitre entry`}
                />
              ) : (
                <TouchableOpacity
                  style={styles.entryAmountWrap}
                  onPress={() => beginEdit(entry)}
                  accessibilityRole="button"
                  accessibilityLabel={`${entry.amount_ml} millilitres at ${formatClock(entry.logged_at)}. Tap to correct.`}
                >
                  <Text style={styles.entryAmount}>{entry.amount_ml} ml</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={styles.removeBtn}
                onPress={() => handleRemove(entry)}
                accessibilityRole="button"
                accessibilityLabel={`Remove the ${entry.amount_ml} millilitre entry logged at ${formatClock(entry.logged_at)}`}
              >
                <Text style={styles.removeBtnText}>Remove</Text>
              </TouchableOpacity>
            </View>
          ))
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Last 7 days</Text>
        <View style={styles.weekRow}>
          {week.map((w) => (
            <View key={w.day} style={styles.weekCol}>
              {/* The strip the old Records tab drew rounded to the nearest 100 ml, so a
                  logged 250 read as "300". On the screen whose whole purpose is
                  correcting water to the millilitre, that is the wrong compromise:
                  show litres above 1 L to keep the column narrow, and the exact
                  figure below it. */}
              <Text style={styles.weekValue}>
                {w.ml === 0 ? '' : w.ml >= 1000 ? `${(w.ml / 1000).toFixed(1)}L` : String(w.ml)}
              </Text>
              <View style={styles.weekTrack}>
                <View
                  style={[
                    styles.weekFill,
                    {
                      height: `${Math.min(100, (w.ml / peak) * 100)}%` as `${number}%`,
                      backgroundColor: w.ml >= goalMl ? '#2F8F5B' : '#2AA6B8',
                    },
                  ]}
                />
              </View>
              <Text style={styles.weekDay}>{w.day}</Text>
            </View>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F7F2' },
  content: { padding: 20, paddingBottom: 40 },
  loading: { flex: 1, backgroundColor: '#F7F7F2', alignItems: 'center', justifyContent: 'center' },
  section: { marginTop: 22 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { color: '#14213D', fontSize: 15, fontWeight: '700', marginBottom: 10 },
  sectionCount: { color: '#9AA3B2', fontSize: 13, fontWeight: '600', marginBottom: 10 },
  note: { color: '#9AA3B2', fontSize: 11, lineHeight: 16, marginTop: 8 },
  empty: { color: '#9AA3B2', fontSize: 13, paddingVertical: 8 },

  goalRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  goalBtn: { width: 46, height: 46, borderRadius: 12, backgroundColor: '#ECEDE6', borderWidth: 1, borderColor: '#CFD2C6', alignItems: 'center', justifyContent: 'center' },
  goalBtnText: { color: '#5A6478', fontSize: 22, fontWeight: '600', lineHeight: 26 },
  goalValue: { flex: 1, height: 46, borderRadius: 12, backgroundColor: '#ECEDE6', borderWidth: 1, borderColor: '#CFD2C6', alignItems: 'center', justifyContent: 'center' },
  goalValueText: { color: '#14213D', fontSize: 17, fontWeight: '700' },
  goalField: { flex: 1, height: 46, borderRadius: 12, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#2AA6B8', textAlign: 'center', color: '#14213D', fontSize: 17, fontWeight: '700' },

  entryRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#E4E5DD' },
  entryTime: { color: '#9AA3B2', fontSize: 13, width: 56 },
  entryAmountWrap: { flex: 1 },
  entryAmount: { color: '#14213D', fontSize: 15, fontWeight: '600' },
  entryField: { flex: 1, height: 38, borderRadius: 9, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#2AA6B8', paddingHorizontal: 10, color: '#14213D', fontSize: 15, fontWeight: '600' },
  removeBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 9, backgroundColor: '#FBEAEA', borderWidth: 1, borderColor: '#E7C6C6' },
  removeBtnText: { color: '#B3453E', fontSize: 12, fontWeight: '700' },

  weekRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 120 },
  weekCol: { flex: 1, alignItems: 'center' },
  weekValue: { color: '#9AA3B2', fontSize: 10, height: 14 },
  weekTrack: { width: '70%', height: 80, backgroundColor: '#E4E5DD', borderRadius: 5, overflow: 'hidden', justifyContent: 'flex-end' },
  weekFill: { width: '100%', borderRadius: 5 },
  weekDay: { color: '#5A6478', fontSize: 11, marginTop: 6 },
});
