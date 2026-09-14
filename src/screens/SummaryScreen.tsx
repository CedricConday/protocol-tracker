import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { t } from '../i18n';
import { DEFAULT_SUN_GOAL_MIN } from '../components/SunTracker';
import { SUN_GOAL_FLAG } from './SunlightScreen';
import { EXERCISE_GOAL_FLAG, DEFAULT_GOAL_MIN as DEFAULT_EXERCISE_GOAL_MIN } from './ExerciseScreen';
import { DEFAULT_GOAL_ML } from '../components/WaterTracker';
import { WATER_GOAL_FLAG } from './WaterScreen';
import {
  getAnchor, getFirstMealTime, getMiscFlag, getTodayExercise, getTodaySunLog, todayStr,
  getSunEntries, getExerciseLogs, getWaterLogs, getTodayMeals,
  getSupplementsWithRules, getProfile,
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
 * What is left is a shell: the things a patient logs every day, each with a
 * screen of its own. Manage supplements and Bedtime joined them on 2026-09-14 —
 * they were buried in Settings, and neither is a preference: one is the
 * protocol the day is built from, the other is the boundary `startDay()`
 * enforces. The route id is still `Summary` so every existing
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
  route: 'Water' | 'Sunlight' | 'Exercise' | 'Food' | 'SupplementEditor' | 'Bedtime';
  label: string;
  sub: string;
  icon: keyof typeof Ionicons.glyphMap;
  tint: string;
};

const TRACKERS: Tracker[] = [
  { route: 'SupplementEditor', label: 'Doses',       sub: 'Supplements, timing and order', icon: 'list-outline', tint: '#7A5BD6' },
  { route: 'Water',    label: 'Water',    sub: 'Intake, goal and corrections', icon: 'water-outline',    tint: '#3B9AE1' },
  { route: 'Sunlight', label: 'Sunlight', sub: 'Exposure minutes and history', icon: 'sunny-outline',    tint: '#E9A23C' },
  { route: 'Exercise', label: 'Exercise', sub: 'Movement logged each day',     icon: 'walk-outline',     tint: '#2F8F5B' },
  { route: 'Food',     label: 'Food',     sub: 'Meals and first-meal time',    icon: 'restaurant-outline', tint: '#A3623C' },
  { route: 'Bedtime',  label: 'Bedtime',  sub: 'When the day closes',          icon: 'moon-outline',     tint: '#5B5BD6' },
];

const GRID_GAP = 12;

/** Two per row. Pairs are fixed, so the rows do not reflow as values load. */
const ROWS: Tracker[][] = TRACKERS.reduce<Tracker[][]>((acc, tracker, i) => {
  if (i % 2 === 0) acc.push([tracker]);
  else acc[acc.length - 1].push(tracker);
  return acc;
}, []);

type CardData = {
  /** The headline number, e.g. "1200 of 3500 ml". */
  value: string;
  /** A second line of context — goal, session count, last entry. */
  detail: string;
  /** 0..1 against the day's goal, or null where a goal makes no sense. */
  progress: number | null;
};
type TodayValues = Record<Tracker['route'], CardData>;

// Until the reads land the cards say nothing rather than "0" — a zero the app
// has not actually looked up is a claim, and on this screen it is the wrong one.
const EMPTY: CardData = { value: '', detail: '', progress: null };
const PENDING: TodayValues = {
  Water: EMPTY, Sunlight: EMPTY, Exercise: EMPTY, Food: EMPTY,
  SupplementEditor: EMPTY, Bedtime: EMPTY,
};

export default function SummaryScreen() {
  const navigation = useNavigation<any>();
  const [today, setToday] = useState<TodayValues>(PENDING);
  // What one row actually gets, measured rather than assumed: three rows plus
  // two gaps out of whatever the grid was given. A 667pt screen leaves ~120pt a
  // row and a 844pt one ~190pt, and the same type does not fit both — at the
  // small end the third line is what pushes the last row under the tab bar.
  const [rowHeight, setRowHeight] = useState<number | null>(null);
  const compact = rowHeight !== null && rowHeight < 140;

  const load = useCallback(async () => {
    try {
      const date = todayStr();

      const anchor = await getAnchor(date);
      const storedGoal = await getMiscFlag(WATER_GOAL_FLAG);
      const parsedGoal = storedGoal === null ? NaN : parseInt(storedGoal, 10);
      const goalMl = Number.isFinite(parsedGoal) && parsedGoal > 0 ? parsedGoal : DEFAULT_GOAL_ML;
      const waterMl = anchor?.water_ml ?? 0;

      const sun = await getTodaySunLog();
      const sunGoal = Number(await getMiscFlag(SUN_GOAL_FLAG)) || DEFAULT_SUN_GOAL_MIN;
      const sunEntries = await getSunEntries(date);

      const exercise = await getTodayExercise(date);
      const exGoal = Number(await getMiscFlag(EXERCISE_GOAL_FLAG)) || DEFAULT_EXERCISE_GOAL_MIN;
      const exEntries = await getExerciseLogs(date);

      const firstMeal = await getFirstMealTime(date);
      const meals = await getTodayMeals(date);

      const waterEntries = await getWaterLogs(date);
      const sunMin = sun?.minutes ?? 0;

      // Neither of these is a "today" number — they are the settings the day is
      // built from, so the card shows what is configured rather than progress.
      const supplements = await getSupplementsWithRules();
      const d3 = supplements.find((r) => /(^|\W)(d3|vitamin\s*d)/i.test(r.name));
      const profile = await getProfile();
      const bedH = profile?.bedtime_hour ?? 22;
      const bedM = profile?.bedtime_minute ?? 0;

      const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

      setToday({
        Water: {
          value: `${waterMl} of ${goalMl} ml`,
          detail: waterEntries.length
            ? `${plural(waterEntries.length, 'entry', 'entries')} · ${Math.max(0, goalMl - waterMl)} ml to go`
            : 'Nothing logged yet',
          progress: goalMl > 0 ? Math.min(1, waterMl / goalMl) : null,
        },
        Sunlight: {
          value: `${sunMin} of ${sunGoal} min`,
          detail: sunEntries.length
            ? `${plural(sunEntries.length, 'session', 'sessions')} · last ${new Date(sunEntries[0].logged_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
            : 'Nothing logged yet',
          progress: sunGoal > 0 ? Math.min(1, sunMin / sunGoal) : null,
        },
        Exercise: {
          value: `${exercise.totalMinutes} of ${exGoal} min`,
          detail: exEntries.length
            ? `${plural(exEntries.length, 'session', 'sessions')} · ${exEntries[0].type}, ${exEntries[0].intensity}`
            : 'Nothing logged yet',
          progress: exGoal > 0 ? Math.min(1, exercise.totalMinutes / exGoal) : null,
        },
        Food: {
          value: firstMeal ? `First meal ${firstMeal}` : 'First meal not set',
          detail: meals.length
            ? `${plural(meals.length, 'meal', 'meals')} logged today`
            : 'Dose timing keys off your first meal',
          progress: null,
        },
        SupplementEditor: {
          value: supplements.length
            ? plural(supplements.length, 'supplement', 'supplements')
            : 'Nothing set up yet',
          detail: d3?.dose_amount?.trim()
            ? `Daily D3 ${d3.dose_amount.trim()} ${d3.dose_unit.trim() || 'IU'}`
            : 'Add, edit and reorder your doses',
          progress: null,
        },
        Bedtime: {
          value: `${String(bedH).padStart(2, '0')}:${String(bedM).padStart(2, '0')}`,
          detail: 'A day cannot be started after this time',
          progress: null,
        },
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

      <View
        style={styles.grid}
        onLayout={(e) => setRowHeight((e.nativeEvent.layout.height - 2 * GRID_GAP) / ROWS.length)}
      >
      {ROWS.map((row, i) => (
        <View key={i} style={styles.row}>
          {row.map((tracker) => (
            <TouchableOpacity
              key={tracker.route}
              style={styles.card}
              activeOpacity={0.85}
              onPress={() => open(tracker.route)}
              accessibilityRole="button"
              accessibilityLabel={
                today[tracker.route].value
                  ? `${tracker.label} tracker. Today: ${today[tracker.route].value}. ${today[tracker.route].detail}`
                  : `${tracker.label} tracker. ${tracker.sub}`
              }
            >
              <View style={styles.cardHead}>
                <View
                  style={[
                    styles.iconWrap,
                    compact && styles.iconWrapCompact,
                    { backgroundColor: `${tracker.tint}1A` },
                  ]}
                >
                  <Ionicons name={tracker.icon} size={compact ? 20 : 24} color={tracker.tint} />
                </View>
                <Text style={[styles.cardLabel, compact && styles.cardLabelCompact]} numberOfLines={2}>
                  {tracker.label}
                </Text>
              </View>
              <View>
                <Text
                  style={[
                    styles.cardSub,
                    today[tracker.route].value ? styles.cardToday : null,
                    compact && (today[tracker.route].value ? styles.cardTodayCompact : styles.cardSubCompact),
                  ]}
                  numberOfLines={2}
                >
                  {today[tracker.route].value || tracker.sub}
                </Text>
                {/* The third line is the first thing to go when the row is short:
                    it is context, and the number above it is the point. */}
                {today[tracker.route].detail && !compact ? (
                  <Text style={styles.cardDetail} numberOfLines={2}>{today[tracker.route].detail}</Text>
                ) : null}
                {today[tracker.route].progress !== null ? (
                  <View style={styles.barTrack}>
                    <View
                      style={[
                        styles.barFill,
                        { backgroundColor: tracker.tint },
                        { width: `${Math.round((today[tracker.route].progress ?? 0) * 100)}%` as `${number}%` },
                      ]}
                    />
                  </View>
                ) : null}
              </View>
            </TouchableOpacity>
          ))}
        </View>
      ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F7F2' },
  // The tab is one page: the grid takes whatever is left under the heading and
  // the three rows divide it, so the cards grow with the screen instead of
  // sitting small above a blank half. flexGrow on the content container is what
  // gives the grid a height to divide in the first place.
  content: { padding: 20, paddingTop: 52, paddingBottom: 20, flexGrow: 1 },
  heading: { color: '#14213D', fontSize: 26, fontWeight: '800', marginBottom: 4 },
  standfirst: { color: '#5A6478', fontSize: 13, lineHeight: 18, marginBottom: 16 },

  grid: { flex: 1, gap: GRID_GAP },
  row:  { flex: 1, flexDirection: 'row', gap: GRID_GAP },
  card: {
    flex: 1,
    minHeight: 104,
    // Centred, not space-between: on a tall screen the tiles grow, and pinning
    // the label to the top and the number to the bottom just moves the blank
    // space inside the card. As one block in the middle they read at any height.
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#ECEDE6',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#CFD2C6',
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconWrap: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  iconWrapCompact: { width: 34, height: 34, borderRadius: 17 },
  cardLabel: { flex: 1, color: '#14213D', fontSize: 17, fontWeight: '700' },
  cardLabelCompact: { fontSize: 15 },
  cardSub: { color: '#5A6478', fontSize: 13, lineHeight: 18 },
  cardSubCompact: { fontSize: 12, lineHeight: 16 },
  cardToday: { color: '#14213D', fontSize: 16, fontWeight: '700', lineHeight: 21 },
  cardTodayCompact: { fontSize: 14, lineHeight: 18 },
  cardDetail: { color: '#9AA3B2', fontSize: 12, lineHeight: 16, marginTop: 3 },
  barTrack: { height: 6, borderRadius: 3, backgroundColor: '#DDDFD4', overflow: 'hidden', marginTop: 9 },
  barFill: { height: 6, borderRadius: 3 },
});
