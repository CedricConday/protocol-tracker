import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { t } from '../i18n';
import { DEFAULT_GOAL_ML } from '../components/WaterTracker';
import { WATER_GOAL_FLAG } from './WaterScreen';
import {
  getAnchor, getFirstMealTime, getMiscFlag, getTodayExercise, getTodaySunLog, todayStr,
} from '../db/queries';

/**
 * The Trackers tab.
 *
 * This was the Records tab, and it was a summary screen: compliance ring,
 * weighted adherence, streak, a 7-day mood strip, a 7-day water strip and the
 * three clinical entry points. All of that is a reading of history, so on
 * 2026-09-13 it moved to the Calendar tab, which was already showing the
 * history it described. The mood strip was not moved — JournalScreen has
 * rendered the same seven days since before this screen did — and the water
 * strip belongs on the Water screen with the rest of the water data.
 *
 * What is left is a shell: the four things a patient logs every day, each with
 * a screen of its own. The route id is still `Summary` so every existing
 * `navigate('Summary', …)` and the three medical sub-routes keep working; only
 * the tab's visible label changed.
 *
 * The four destination screens landed in round 3 (C1-C4) and are registered
 * under the route names agreed before either lane started, so the guard on
 * `open` is now belt-and-braces rather than load-bearing — it stays because a
 * navigation error thrown at a patient is never the right failure.
 *
 * Each card carries today's real number (C5). Static subtitles made the tab a
 * menu; the point of a tracker tab is to answer "where am I today" before
 * anything is tapped. The reads are four cheap single-row queries and they run
 * on focus, so a value logged on the Today tab is current when this tab is
 * opened rather than one navigation behind.
 */

type Tracker = {
  route: 'Water' | 'Sunlight' | 'Exercise' | 'Food';
  label: string;
  sub: string;
  icon: keyof typeof Ionicons.glyphMap;
  tint: string;
};

const TRACKERS: Tracker[] = [
  { route: 'Water',    label: 'Water',    sub: 'Intake, goal and corrections', icon: 'water-outline',    tint: '#3B9AE1' },
  { route: 'Sunlight', label: 'Sunlight', sub: 'Exposure minutes and history', icon: 'sunny-outline',    tint: '#E9A23C' },
  { route: 'Exercise', label: 'Exercise', sub: 'Movement logged each day',     icon: 'walk-outline',     tint: '#2F8F5B' },
  { route: 'Food',     label: 'Food',     sub: 'Meals and first-meal time',    icon: 'restaurant-outline', tint: '#A3623C' },
];

type TodayValues = Record<Tracker['route'], string>;

// Until the reads land the cards say nothing rather than "0" — a zero the app
// has not actually looked up is a claim, and on this screen it is the wrong one.
const PENDING: TodayValues = { Water: '', Sunlight: '', Exercise: '', Food: '' };

export default function SummaryScreen() {
  const navigation = useNavigation<any>();
  const [today, setToday] = useState<TodayValues>(PENDING);

  const load = useCallback(async () => {
    try {
      const date = todayStr();

      const anchor = await getAnchor(date);
      const storedGoal = await getMiscFlag(WATER_GOAL_FLAG);
      const parsedGoal = storedGoal === null ? NaN : parseInt(storedGoal, 10);
      const goalMl = Number.isFinite(parsedGoal) && parsedGoal > 0 ? parsedGoal : DEFAULT_GOAL_ML;
      const waterMl = anchor?.water_ml ?? 0;

      const sun = await getTodaySunLog();
      const exercise = await getTodayExercise(date);
      const firstMeal = await getFirstMealTime(date);

      setToday({
        Water: `${waterMl} of ${goalMl} ml`,
        Sunlight: `${sun?.minutes ?? 0} min`,
        Exercise: `${exercise.totalMinutes} min`,
        Food: firstMeal ? `First meal ${firstMeal}` : 'First meal not set',
      });
    } catch (e) {
      // One failed read must not blank the tab: the cards fall back to their
      // descriptions and every route still opens.
      console.error('[Trackers] today read failed:', e);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // A card whose screen has not been registered yet must do nothing visible
  // rather than throw a navigation error at the patient. Once Lane B's screens
  // are registered this guard simply never fires.
  const open = (route: string) => {
    try {
      navigation.navigate(route);
    } catch {
      /* route not registered yet — PT-trio round 2, Lane B */
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.heading}>{t('trackers')}</Text>
      <Text style={styles.standfirst}>{t('trackersIntro')}</Text>

      {TRACKERS.map((tracker) => (
        <TouchableOpacity
          key={tracker.route}
          style={styles.card}
          activeOpacity={0.85}
          onPress={() => open(tracker.route)}
          accessibilityRole="button"
          accessibilityLabel={
            today[tracker.route]
              ? `${tracker.label} tracker. Today: ${today[tracker.route]}.`
              : `${tracker.label} tracker. ${tracker.sub}`
          }
        >
          <View style={[styles.iconWrap, { backgroundColor: `${tracker.tint}1A` }]}>
            <Ionicons name={tracker.icon} size={22} color={tracker.tint} />
          </View>
          <View style={styles.cardText}>
            <Text style={styles.cardLabel}>{tracker.label}</Text>
            <Text style={[styles.cardSub, today[tracker.route] ? styles.cardToday : null]}>
              {today[tracker.route] || tracker.sub}
            </Text>
          </View>
          <Text style={styles.chevron}>›</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F7F2' },
  content: { padding: 24, paddingTop: 60, paddingBottom: 40 },
  heading: { color: '#14213D', fontSize: 28, fontWeight: '800', marginBottom: 6 },
  standfirst: { color: '#5A6478', fontSize: 14, lineHeight: 20, marginBottom: 20 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: '#ECEDE6',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#CFD2C6',
  },
  iconWrap: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  cardText: { flex: 1 },
  cardLabel: { color: '#14213D', fontSize: 16, fontWeight: '700' },
  cardSub: { color: '#5A6478', fontSize: 12, marginTop: 2 },
  cardToday: { color: '#14213D', fontSize: 13, fontWeight: '600' },
  chevron: { color: '#9AA3B2', fontSize: 24, fontWeight: '300' },
});
