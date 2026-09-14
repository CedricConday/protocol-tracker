import { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import Pressable from '../components/Pressable';
import { getProfile, updateProfile } from '../db/queries';
import { getLatestStartTime } from '../engine/scheduler';
import { t, useLanguage, locale } from '../i18n';
import { C, space, radius, text as T } from '../theme';
import { select as hSelect, success as hSuccess } from '../utils/haptics';

/**
 * Bedtime.
 *
 * Moved out of Settings on 2026-09-14: bedtime is not a preference, it is the
 * day's closing boundary, so it sits with the trackers.
 *
 * It is load-bearing. `startDay()` refuses to open a day once the clock is past
 * this time (`BEDTIME_GATE` in engine/scheduler.ts), and `getLatestStartTime()`
 * works back from it by the last supplement's offset. The cutoff line below is
 * that same figure, so the number being set is visibly connected to what it
 * does rather than being a time the app merely stores.
 */

const HOURS = [18, 19, 20, 21, 22, 23];
const MINUTES = [0, 15, 30, 45];

const hhmm = (h: number, m: number) =>
  `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

export default function BedtimeScreen() {
  useLanguage(); // re-render this screen when the language changes
  const [hour, setHour] = useState(22);
  const [minute, setMinute] = useState(0);
  const [saved, setSaved] = useState<{ hour: number; minute: number } | null>(null);
  const [cutoff, setCutoff] = useState<Date | null>(null);

  const load = useCallback(async () => {
    const profile = await getProfile();
    const h = profile?.bedtime_hour ?? 22;
    const m = profile?.bedtime_minute ?? 0;
    setHour(h);
    setMinute(m);
    setSaved({ hour: h, minute: m });
    setCutoff(await getLatestStartTime().catch(() => null));
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const dirty = saved !== null && (saved.hour !== hour || saved.minute !== minute);

  const save = async () => {
    try {
      await updateProfile({ bedtime_hour: hour, bedtime_minute: minute });
      setSaved({ hour, minute });
      setCutoff(await getLatestStartTime().catch(() => null));
      hSuccess();
    } catch {
      Alert.alert(t('saveFailed'), t('saveFailedSub'));
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <View style={styles.iconWrap}>
          <Ionicons name="moon-outline" size={22} color="#5B5BD6" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.heroValue}>{hhmm(hour, minute)}</Text>
          <Text style={styles.heroSub}>
            {cutoff
              ? `Latest start for a full day: ${cutoff.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' })}`
              : 'Set up your supplements to see the latest start time'}
          </Text>
        </View>
      </View>

      <Text style={styles.note}>
        {t('bedGateNote')}
      </Text>

      <Text style={styles.label}>{t('hour')}</Text>
      <View style={styles.chipWrap}>
        {HOURS.map((h) => (
          <Pressable
            key={h}
            style={[styles.chip, hour === h && styles.chipActive]}
            onPress={() => { hSelect(); setHour(h); }}
            accessibilityLabel={`Hour ${h}`} accessibilityRole="button"
          >
            <Text style={[styles.chipText, hour === h && styles.chipTextActive]}>
              {String(h).padStart(2, '0')}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>{t('minutes')}</Text>
      <View style={styles.chipWrap}>
        {MINUTES.map((m) => (
          <Pressable
            key={m}
            style={[styles.chip, minute === m && styles.chipActive]}
            onPress={() => { hSelect(); setMinute(m); }}
            accessibilityLabel={`Minute ${m}`} accessibilityRole="button"
          >
            <Text style={[styles.chipText, minute === m && styles.chipTextActive]}>
              :{String(m).padStart(2, '0')}
            </Text>
          </Pressable>
        ))}
      </View>

      {dirty ? (
        <Pressable onPress={save} style={styles.saveBtn} accessibilityLabel={t('save')} accessibilityRole="button">
          <Text style={styles.saveBtnText}>{t('save')}</Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  content:   { padding: space.lg, paddingBottom: space.xxxl },

  hero: {
    flexDirection: 'row', alignItems: 'center', gap: space.md,
    backgroundColor: '#fff', borderRadius: radius.lg, padding: space.lg,
  },
  iconWrap: {
    width: 44, height: 44, borderRadius: radius.pill,
    backgroundColor: '#5B5BD61A', alignItems: 'center', justifyContent: 'center',
  },
  heroValue: { ...T.display, color: C.text },
  heroSub:   { ...T.small, color: C.textSub, marginTop: 2 },

  note:  { ...T.small, color: C.textSub, marginTop: space.md, lineHeight: 20 },
  label: { ...T.caps, color: C.textSub, marginTop: space.lg, marginBottom: space.sm },

  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: {
    paddingHorizontal: space.md, paddingVertical: space.sm,
    borderRadius: radius.pill, backgroundColor: C.surface,
  },
  chipActive:     { backgroundColor: C.primaryBg },
  chipText:       { ...T.body, color: C.textSub, fontWeight: '600' },
  chipTextActive: { color: C.primary, fontWeight: '700' },

  saveBtn: {
    marginTop: space.xl, backgroundColor: C.primary,
    borderRadius: radius.pill, paddingVertical: space.md, alignItems: 'center',
  },
  saveBtnText: { ...T.bodyLg, color: '#fff', fontWeight: '800' },
});
