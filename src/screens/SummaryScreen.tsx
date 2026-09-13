import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { t } from '../i18n';

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
 * The four destination screens are Lane B's (PT-trio round 2). Until they land,
 * these cards navigate to route names that are agreed but not yet registered —
 * which is why each `onPress` is guarded rather than optimistic.
 */

type Tracker = {
  route: string;
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

export default function SummaryScreen() {
  const navigation = useNavigation<any>();

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
          accessibilityLabel={`${tracker.label} tracker. ${tracker.sub}`}
        >
          <View style={[styles.iconWrap, { backgroundColor: `${tracker.tint}1A` }]}>
            <Ionicons name={tracker.icon} size={22} color={tracker.tint} />
          </View>
          <View style={styles.cardText}>
            <Text style={styles.cardLabel}>{tracker.label}</Text>
            <Text style={styles.cardSub}>{tracker.sub}</Text>
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
  chevron: { color: '#9AA3B2', fontSize: 24, fontWeight: '300' },
});
