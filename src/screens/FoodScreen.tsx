import { useCallback, useState } from 'react';
import {
  ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import {
  getFirstMealTime, getTodayMeals, localDateStr, logMeal, setFirstMealTime, todayStr,
} from '../db/queries';

import { t, useLanguage, locale } from '../i18n';
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
 * WHY THE SAVE IS READ BACK. `setFirstMealTime` is
 * `UPDATE daily_anchors SET first_meal_time = ? WHERE date = ?` — an UPDATE with
 * no INSERT. On a day with no anchor row yet (the row is created by `setT0` when
 * the day is started, or by the first `addWater`), it matches nothing and
 * succeeds, writing nothing. The Today tab has the same bug and shows the time
 * in local state afterwards, so it looks saved until the next reload. Here the
 * write is read back and a failure is said out loud instead. The fix is an
 * upsert in `src/db/**`, which is Build A's this round — filed as handoff H15.
 */

const DAY3 = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const MEAL_TYPES = [
  { id: 'breakfast', label: 'Breakfast' },
  { id: 'lunch', label: 'Lunch' },
  { id: 'dinner', label: 'Dinner' },
  { id: 'snack', label: 'Snack' },
];

/** The one formatter. Both the button and the manual edit go through it, so the
 *  column never ends up holding "04:27 PM" on one day and "16:27" on the next. */
function clockString(d: Date): string {
  return d.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });
}

function clockNow(): string {
  return clockString(new Date());
}

/**
 * Accepts 7:5, 07:05, 0705, 7.05, and "4 30 pm" — anything that resolves to a
 * real time of day — and returns it in the same format the button writes.
 * Returns null rather than guessing: an unparseable edit leaves the stored time
 * alone, because a wrong first-meal time is worse than an unchanged one.
 */
function normaliseTime(raw: string): string | null {
  const pm = /p\.?m/i.test(raw);
  const am = /a\.?m/i.test(raw);
  const digits = raw.replace(/[^0-9]/g, '');
  let h: number;
  let m: number;
  if (digits.length === 3) { h = parseInt(digits.slice(0, 1), 10); m = parseInt(digits.slice(1), 10); }
  else if (digits.length === 4) { h = parseInt(digits.slice(0, 2), 10); m = parseInt(digits.slice(2), 10); }
  else if (digits.length <= 2 && digits.length > 0) { h = parseInt(digits, 10); m = 0; }
  else return null;
  if (!Number.isFinite(h) || !Number.isFinite(m) || m > 59) return null;
  if (pm && h < 12) h += 12;
  if (am && h === 12) h = 0;
  if (h > 23) return null;
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return clockString(d);
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

  const load = useCallback(async () => {
    try {
      const today = todayStr();
      const first = await getFirstMealTime(today);
      setFirstMeal(first);
      setDraft(first ?? clockNow());
      setMeals(await getTodayMeals(today));

      const todayIdx = (new Date().getDay() + 6) % 7;
      const days: { day: string; time: string | null }[] = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        days.push({ day: DAY3[(todayIdx - i + 7) % 7], time: await getFirstMealTime(localDateStr(d)) });
      }
      setWeek(days);
    } catch (e) {
      console.error('[Food] load failed:', e);
    } finally {
      setLoading(false);
    }
  }, []);

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

  const commitDraft = async () => {
    setEditing(false);
    const time = normaliseTime(draft);
    if (!time) { setDraft(firstMeal ?? clockNow()); return; }
    setDraft(time);
    await saveFirstMeal(time);
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
                ? `First meal today at ${firstMeal}. Tap to change.`
                : 'First meal time not set. Tap to set it.'
            }
          >
            <Text style={[styles.cardValue, firstMeal ? null : styles.cardValueUnset]}>
              {firstMeal ?? 'Not set'}
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
              Today has no anchor row yet, and the first-meal write cannot create one. Start
              the day on the Today tab — or log any water — and set the time again. Filed as
              handoff H15.
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
              accessibilityLabel={`Log ${meal.label} at the current time`}
            >
              <Text style={styles.mealChipText}>{meal.label}</Text>
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
                {MEAL_TYPES.find((m) => m.id === meal.meal_type)?.label ?? meal.meal_type}
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
  container: { flex: 1, backgroundColor: '#F7F7F2' },
  content: { padding: 20, paddingBottom: 40 },
  loading: { flex: 1, backgroundColor: '#F7F7F2', alignItems: 'center', justifyContent: 'center' },

  card: { backgroundColor: '#ECEDE6', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#DBDDD3' },
  cardLabel: { color: '#5A6478', fontSize: 14, fontWeight: '600' },
  cardValue: { color: '#14213D', fontSize: 34, fontWeight: '800', marginTop: 4 },
  cardValueUnset: { color: '#9AA3B2', fontSize: 26 },
  cardField: { color: '#14213D', fontSize: 34, fontWeight: '800', marginTop: 4, borderBottomWidth: 2, borderBottomColor: '#A3623C', padding: 0 },
  cardSub: { color: '#5A6478', fontSize: 13, lineHeight: 19, marginTop: 8 },
  nowBtn: { marginTop: 14, height: 44, borderRadius: 11, backgroundColor: '#A3623C', alignItems: 'center', justifyContent: 'center' },
  nowBtnText: { color: '#F7F7F2', fontSize: 14, fontWeight: '700' },

  failure: { marginTop: 14, borderRadius: 11, backgroundColor: '#FBEAEA', borderWidth: 1, borderColor: '#E7C6C6', padding: 12 },
  failureTitle: { color: '#B3453E', fontSize: 13, fontWeight: '700', marginBottom: 4 },
  failureBody: { color: '#8C5450', fontSize: 12, lineHeight: 18 },

  section: { marginTop: 22 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { color: '#14213D', fontSize: 15, fontWeight: '700', marginBottom: 10 },
  sectionCount: { color: '#9AA3B2', fontSize: 13, fontWeight: '600', marginBottom: 10 },
  note: { color: '#9AA3B2', fontSize: 11, lineHeight: 17, marginTop: 10 },
  empty: { color: '#9AA3B2', fontSize: 13, paddingVertical: 8 },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  mealChip: { paddingHorizontal: 14, height: 42, borderRadius: 11, backgroundColor: '#ECEDE6', borderWidth: 1, borderColor: '#CFD2C6', alignItems: 'center', justifyContent: 'center' },
  mealChipText: { color: '#5A6478', fontSize: 13, fontWeight: '600' },

  mealRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#E4E5DD' },
  mealTime: { color: '#14213D', fontSize: 15, fontWeight: '700', width: 62 },
  mealType: { color: '#5A6478', fontSize: 14 },

  weekRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#E4E5DD' },
  weekDay: { color: '#5A6478', fontSize: 13, fontWeight: '600' },
  weekTime: { color: '#14213D', fontSize: 14, fontWeight: '600' },
  weekTimeUnset: { color: '#C2C7CF', fontWeight: '400' },
});
