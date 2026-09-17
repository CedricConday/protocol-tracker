import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import {
  getFirstMealTime, getTodayMeals, localDateStr, logMeal, setFirstMealTime, todayStr,
} from '../db/queries';

import { t, useLanguage } from '../i18n';
import { useToday } from '../hooks/useToday';
import { clockNow, formatHourMinute, parseTimeOfDay } from '../utils/time';
import { weekdaysShort } from '../i18n/dates';
/**
 * The Food screen (PT-trio round 3, C4).
 *
 * SCOPED DELIBERATELY, per the round-3 note: a food diary is a far larger
 * product than this app is, and only one number here is worth keeping — the
 * first-meal time. So the screen is built around that, with the meal log
 * underneath it as a record of when eating happened rather than a nutrition
 * tool. No portions, no calories, no ingredients; those are a different product
 * and would need `dietary_restrictions` and the conflicts engine to mean
 * anything.
 *
 * ONE CORRECTION TO THE BRIEF, checked rather than assumed. The round-3 note
 * says `setFirstMealTime` is load-bearing for dose timing. It is not, today:
 * `startDay` (`engine/scheduler.ts:37`) computes every dose as
 * `t0 + offset_minutes`, and `first_meal_time` is read in exactly two places —
 * `useHomeScreen`, which destructures it and never renders it, and this screen.
 * Nothing parses the string. So the value is a record waiting for a consumer,
 * not an input the schedule depends on, and this screen does not tell the user
 * otherwise. Writing it in one consistent format still matters for the day
 * something does read it, which is why the manual edit below goes through the
 * same formatter as the button rather than emitting 24-hour text beside it.
 *
 * WHY THE SAVE IS READ BACK. `setFirstMealTime` used to be an UPDATE with no
 * INSERT, so on a day with no anchor row yet it matched nothing, succeeded, and
 * wrote nothing — the edit silently did not save. **Fixed 2026-09-16 (H15):**
 * the query is now an upsert, the same shape as `setT0`. The read-back below
 * stays anyway. It costs one SELECT and it is the only thing standing between a
 * future write regression and a user who believes a time was recorded when it
 * was not — which on a medical record is the failure worth paying a query for.
 */

// `id` is the stored `meal_log.meal_type` and stays English; the label is a key.
const MEAL_TYPES = [
  { id: 'breakfast', labelKey: 'mealBreakfast' },
  { id: 'lunch', labelKey: 'mealLunch' },
  { id: 'dinner', labelKey: 'mealDinner' },
  { id: 'snack', labelKey: 'mealSnack' },
];

/**
 * Parse with the shared helper, then format with the shared formatter, so this
 * column never ends up holding "04:27 PM" on one day and "16:27" on the next —
 * and so Bedtime and Food accept exactly the same input. Returns null on an
 * unparseable edit; the caller leaves the stored time alone rather than guessing.
 */
function normaliseTime(raw: string): string | null {
  const parsed = parseTimeOfDay(raw);
  return parsed ? formatHourMinute(parsed.hour, parsed.minute) : null;
}

export default function FoodScreen() {
  useLanguage(); // re-render this screen when the language changes
  const [loading, setLoading] = useState(true);
  const [firstMeal, setFirstMeal] = useState<string | null>(null);
  const [meals, setMeals] = useState<{ id: number; meal_type: string; time: string }[]>([]);
  const [week, setWeek] = useState<{ day: string; time: string | null }[]>([]);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [writeFailed, setWriteFailed] = useState(false);

  // Not `todayStr()` inside load: the screen stays mounted across midnight, and
  // a load keyed on a value read once would keep reporting yesterday. The hook
  // changes at the boundary, which re-creates `load` and re-fires the focus
  // effect below.
  const today = useToday();

  const load = useCallback(async () => {
    try {
      const first = await getFirstMealTime(today);
      setFirstMeal(first);
      setDraft(first ?? clockNow());
      setMeals(await getTodayMeals(today));

      const todayIdx = (new Date().getDay() + 6) % 7;
      const days: { day: string; time: string | null }[] = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        days.push({ day: weekdaysShort()[(todayIdx - i + 7) % 7], time: await getFirstMealTime(localDateStr(d)) });
      }
      setWeek(days);
    } catch (e) {
      console.error('[Food] load failed:', e);
    } finally {
      setLoading(false);
    }
  }, [today]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  /**
   * Writes the time, then reads it back and reports the truth. `setFirstMealTime`
   * cannot create the day's row, so on a day that has not been started this call
   * succeeds and changes nothing — see the header note and H15.
   */
  const saveFirstMeal = async (time: string) => {
    const today = todayStr();
    await setFirstMealTime(today, time);
    const stored = await getFirstMealTime(today);
    setWriteFailed(stored !== time);
    if (stored === time) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Reload rather than just setting the card: the seven-day list at the foot of
    // the screen reads today too, and updating the top while the bottom still
    // said "—" was the screen contradicting itself about the value it had just
    // written.
    await load();
  };

  /**
   * Guarded because the TextInput fires this twice for one edit. `onSubmitEditing`
   * runs `commitDraft`, which sets `editing` false and unmounts the field, and
   * unmounting a focused input fires `onBlur` — which is also wired here. The
   * second pass raced the first: two writes and two `load()` calls, and whichever
   * SELECT returned last won, so a good edit could be overwritten by a stale read
   * of the value it had just replaced.
   */
  const committing = useRef(false);

  const commitDraft = async () => {
    if (committing.current) return;
    committing.current = true;
    setEditing(false);
    try {
      const time = normaliseTime(draft);
      if (!time) { setDraft(firstMeal ?? clockNow()); return; }
      setDraft(time);
      await saveFirstMeal(time);
    } finally {
      committing.current = false;
    }
  };

  const handleLogMeal = async (mealType: string) => {
    const time = clockNow();
    const today = todayStr();
    await logMeal(today, mealType, time);
    // The first meal of the day is exactly that — if nothing has claimed the
    // slot yet, this meal does, so the number dose timing depends on is set by
    // eating rather than by remembering to set it.
    // `saveFirstMeal` reloads on its own, so only the else branch needs to.
    if (!firstMeal) await saveFirstMeal(time);
    else await load();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color="#A3623C" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <Text style={styles.cardLabel}>{t('foodFirstMeal')}</Text>
        {editing ? (
          <TextInput
            style={styles.cardField}
            value={draft}
            onChangeText={setDraft}
            onBlur={commitDraft}
            onSubmitEditing={commitDraft}
            keyboardType="numbers-and-punctuation"
            autoFocus
            accessibilityLabel={t('foodTimeField')}
          />
        ) : (
          <TouchableOpacity
            onPress={() => setEditing(true)}
            accessibilityRole="button"
            accessibilityLabel={
              firstMeal
                ? t('foodFirstMealA11y', { time: firstMeal })
                : t('foodFirstMealUnsetA11y')
            }
          >
            <Text style={[styles.cardValue, firstMeal ? null : styles.cardValueUnset]}>
              {firstMeal ?? t('notSet')}
            </Text>
          </TouchableOpacity>
        )}
        <Text style={styles.cardSub}>
          When the day&apos;s eating started. It is recorded for the doctor report and for
          reading alongside the dose times — the schedule itself still counts from when
          you start the day, not from here.
        </Text>

        {!editing && (
          <TouchableOpacity
            style={styles.nowBtn}
            onPress={() => saveFirstMeal(clockNow())}
            accessibilityRole="button"
            accessibilityLabel={t('foodSetNow')}
          >
            <Text style={styles.nowBtnText}>{firstMeal ? 'Set to now' : 'I just ate'}</Text>
          </TouchableOpacity>
        )}

        {writeFailed && (
          <View style={styles.failure}>
            <Text style={styles.failureTitle}>{t('foodSaveFailed')}</Text>
            <Text style={styles.failureBody}>
              The time was not stored. Nothing was lost — the value you see is the one still
              on record. Try once more, and if it keeps failing the day&apos;s record may need
              to be opened from the Today tab first.
            </Text>
          </View>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('foodLogMeal')}</Text>
        <View style={styles.chipRow}>
          {MEAL_TYPES.map((meal) => (
            <TouchableOpacity
              key={meal.id}
              style={styles.mealChip}
              onPress={() => handleLogMeal(meal.id)}
              accessibilityRole="button"
              accessibilityLabel={t('foodLogMealA11y', { meal: t(meal.labelKey) })}
            >
              <Text style={styles.mealChipText}>{t(meal.labelKey)}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.note}>
          A meal is logged at the time you tap it. There is no portion, ingredient or calorie
          field on purpose — nothing in the protocol reads one.
        </Text>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{t('foodTodaysMeals')}</Text>
          <Text style={styles.sectionCount}>{meals.length}</Text>
        </View>
        {meals.length === 0 ? (
          <Text style={styles.empty}>{t('trkNothingToday')}</Text>
        ) : (
          meals.map((meal) => (
            <View key={meal.id} style={styles.mealRow}>
              <Text style={styles.mealTime}>{meal.time}</Text>
              <Text style={styles.mealType}>
                {(() => {
                  const known = MEAL_TYPES.find((m) => m.id === meal.meal_type);
                  return known ? t(known.labelKey) : meal.meal_type;
                })()}
              </Text>
            </View>
          ))
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('foodFirstMeal7')}</Text>
        {week.map((w) => (
          <View key={w.day} style={styles.weekRow}>
            <Text style={styles.weekDay}>{w.day}</Text>
            <Text style={[styles.weekTime, w.time ? null : styles.weekTimeUnset]}>
              {w.time ?? '—'}
            </Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7FAFE' },
  content: { padding: 20, paddingBottom: 40 },
  loading: { flex: 1, backgroundColor: '#F7FAFE', alignItems: 'center', justifyContent: 'center' },

  card: { backgroundColor: '#FFFFFF', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#8393A3' },
  cardLabel: { color: '#495D72', fontSize: 14, fontWeight: '600' },
  cardValue: { color: '#112438', fontSize: 34, fontWeight: '800', marginTop: 4 },
  cardValueUnset: { color: '#617285', fontSize: 26 },
  cardField: { color: '#112438', fontSize: 34, fontWeight: '800', marginTop: 4, borderBottomWidth: 2, borderBottomColor: '#A3623C', padding: 0 },
  cardSub: { color: '#495D72', fontSize: 13, lineHeight: 19, marginTop: 8 },
  nowBtn: { marginTop: 14, height: 44, borderRadius: 11, backgroundColor: '#A3623C', alignItems: 'center', justifyContent: 'center' },
  nowBtnText: { color: '#F7FAFE', fontSize: 14, fontWeight: '700' },

  failure: { marginTop: 14, borderRadius: 11, backgroundColor: '#FBEAEA', borderWidth: 1, borderColor: '#E7C6C6', padding: 12 },
  failureTitle: { color: '#B3453E', fontSize: 13, fontWeight: '700', marginBottom: 4 },
  failureBody: { color: '#8C5450', fontSize: 12, lineHeight: 18 },

  section: { marginTop: 22 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { color: '#112438', fontSize: 15, fontWeight: '700', marginBottom: 10 },
  sectionCount: { color: '#617285', fontSize: 13, fontWeight: '600', marginBottom: 10 },
  note: { color: '#617285', fontSize: 11, lineHeight: 17, marginTop: 10 },
  empty: { color: '#617285', fontSize: 13, paddingVertical: 8 },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  mealChip: { paddingHorizontal: 14, height: 42, borderRadius: 11, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#8393A3', alignItems: 'center', justifyContent: 'center' },
  mealChipText: { color: '#495D72', fontSize: 13, fontWeight: '600' },

  mealRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#D8E1EA' },
  mealTime: { color: '#112438', fontSize: 15, fontWeight: '700', width: 62 },
  mealType: { color: '#495D72', fontSize: 14 },

  weekRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#D8E1EA' },
  weekDay: { color: '#495D72', fontSize: 13, fontWeight: '600' },
  weekTime: { color: '#112438', fontSize: 14, fontWeight: '600' },
  weekTimeUnset: { color: '#C2C7CF', fontWeight: '400' },
});
