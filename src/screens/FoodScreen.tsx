import { useCallback, useState } from 'react';
import { C, themed, useTheme } from '../theme/colors';
import {
  ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import {
  clearFirstMealTime, deleteMeal, getFirstMealTime, getTodayMeals, localDateStr, logMeal,
  setFirstMealTime, todayStr,
} from '../db/queries';

import { t, useLanguage } from '../i18n';
import { useToday } from '../hooks/useToday';
import { clockNow } from '../utils/time';
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
 * THE FIRST-MEAL CARD IS GONE (2026-09-17). The screen used to open with
 * "First meal today" — a large editable time, a "Set to now" button and a
 * failure notice — which asked the patient to maintain by hand a number that
 * logging a meal already sets. Removed at Cedric's request.
 *
 * The anchor itself stays. The first meal logged on a day still claims the
 * slot, deleting that meal still moves it to the earliest one left, and the
 * seven-day list at the foot of this screen still reads it. What went is the
 * hand-editing, and with it the shared-format helper and the double-commit
 * guard that the text field needed.
 *
 * `setFirstMealTime` used to be an UPDATE with no INSERT, so on a day with no
 * anchor row it matched nothing, succeeded, and wrote nothing. Fixed
 * 2026-09-16 (H15): it is an upsert now, the same shape as `setT0`.
 */

// `id` is the stored `meal_log.meal_type` and stays English; the label is a key.
const MEAL_TYPES = [
  { id: 'breakfast', labelKey: 'mealBreakfast' },
  { id: 'lunch', labelKey: 'mealLunch' },
  { id: 'dinner', labelKey: 'mealDinner' },
  { id: 'snack', labelKey: 'mealSnack' },
];

export default function FoodScreen() {
  useLanguage(); // re-render this screen when the language changes
  useTheme(); // ...and when the theme tier changes
  const [loading, setLoading] = useState(true);
  const [firstMeal, setFirstMeal] = useState<string | null>(null);
  const [meals, setMeals] = useState<{ id: number; meal_type: string; time: string }[]>([]);
  const [week, setWeek] = useState<{ day: string; time: string | null }[]>([]);

  // Not `todayStr()` inside load: the screen stays mounted across midnight, and
  // a load keyed on a value read once would keep reporting yesterday. The hook
  // changes at the boundary, which re-creates `load` and re-fires the focus
  // effect below.
  const today = useToday();

  const load = useCallback(async () => {
    try {
      setFirstMeal(await getFirstMealTime(today));
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
   * Set the anchor, then read it back and only celebrate a write that took.
   * Nothing at the top of the screen shows the value any more, so the
   * seven-day list below is where a failed write would show up — and it reads
   * the same rows, after this reload.
   */
  const saveFirstMeal = async (time: string) => {
    const today = todayStr();
    await setFirstMealTime(today, time);
    const stored = await getFirstMealTime(today);
    if (stored === time) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await load();
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

  /**
   * Remove a meal, and keep the first-meal anchor honest.
   *
   * The anchor is a separate value (`daily_anchors.first_meal_time`), set either
   * by the first meal of the day or by hand. So it is only this function's
   * business when it matches the meal being deleted: then the record behind it
   * is going, and the anchor moves to the earliest meal still logged, or back to
   * unset when none are. A time the user typed themselves is left exactly where
   * it is — deleting a snack should not rewrite the morning.
   */
  const handleRemoveMeal = async (meal: { id: number; time: string }) => {
    const removed = await deleteMeal(meal.id);
    if (!removed) {
      // The row went while the screen was open — reload rather than claim
      // something happened.
      await load();
      return;
    }
    if (firstMeal === meal.time) {
      const day = todayStr();
      const left = await getTodayMeals(day);
      if (left.length > 0) await setFirstMealTime(day, left[0].time);
      else await clearFirstMealTime(day);
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await load();
  };

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={C.warningInk} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
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
              <Text style={styles.mealChipText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                {t(meal.labelKey)}
              </Text>
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
          meals.map((meal) => {
            const known = MEAL_TYPES.find((m) => m.id === meal.meal_type);
            const label = known ? t(known.labelKey) : meal.meal_type;
            return (
              <View key={meal.id} style={styles.mealRow}>
                <Text style={styles.mealTime}>{meal.time}</Text>
                <Text style={styles.mealType}>{label}</Text>
                <TouchableOpacity
                  style={styles.removeBtn}
                  onPress={() => handleRemoveMeal(meal)}
                  accessibilityRole="button"
                  accessibilityLabel={t('foodRemoveA11y', { meal: label, time: meal.time })}
                >
                  <Text style={styles.removeBtnText}>{t('trkRemove')}</Text>
                </TouchableOpacity>
              </View>
            );
          })
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

const styles = themed((C) => StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  content: { padding: 20, paddingBottom: 40 },
  loading: { flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' },



  section: { marginTop: 22 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { color: C.text, fontSize: 15, fontWeight: '700', marginBottom: 10 },
  sectionCount: { color: C.textMuted, fontSize: 13, fontWeight: '600', marginBottom: 10 },
  note: { color: C.textMuted, fontSize: 11, lineHeight: 17, marginTop: 10 },
  empty: { color: C.textMuted, fontSize: 13, paddingVertical: 8 },

  // Four buttons, one row, equal columns. They used to be content-width chips
  // that wrapped, so the row read as three-and-one on a narrow phone and the
  // German labels (Mittagessen, Abendessen) pushed Snack onto its own line.
  chipRow: { flexDirection: 'row', gap: 8 },
  mealChip: { flex: 1, paddingHorizontal: 2, height: 42, borderRadius: 11, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  mealChipText: { color: C.textSub, fontSize: 11, fontWeight: '600', textAlign: 'center' },

  mealRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.borderSoft },
  mealTime: { color: C.text, fontSize: 15, fontWeight: '700', width: 62 },
  mealType: { color: C.textSub, fontSize: 14, flex: 1 },
  removeBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 9, backgroundColor: C.dangerBg, borderWidth: 1, borderColor: C.dangerSoft },
  removeBtnText: { color: C.dangerInk, fontSize: 12, fontWeight: '700' },

  weekRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.borderSoft },
  weekDay: { color: C.textSub, fontSize: 13, fontWeight: '600' },
  weekTime: { color: C.text, fontSize: 14, fontWeight: '600' },
  weekTimeUnset: { color: C.textFaint, fontWeight: '400' },
}));
