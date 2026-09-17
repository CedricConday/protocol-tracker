import { useCallback, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { getProfile, updateProfile } from '../db/queries';
import { getLatestStartTime } from '../engine/scheduler';
import { t, useLanguage, locale } from '../i18n';
import { formatHourMinute, parseTimeOfDay } from '../utils/time';
import { C, space, radius, text as T } from '../theme';
import { select as hSelect, success as hSuccess } from '../utils/haptics';

/**
 * Bedtime.
 *
 * Moved out of Settings on 2026-09-14: bedtime is not a preference, it is the
 * day's closing boundary, so it sits with the trackers.
 *
 * REVAMPED 2026-09-16, on two counts.
 *
 * 1. **Any time, not a menu.** The picker offered hours 18–23 and minutes
 *    0/15/30/45, so 01:30, 23:50 and every shift worker's bedtime were simply
 *    not expressible. It is now a typed field sharing `parseTimeOfDay` with the
 *    Food screen, which takes 7:5, 0705, "11 30 pm" and so on.
 *
 * 2. **It informs, it no longer forbids.** `startDay()` used to throw
 *    `BEDTIME_GATE` once the clock passed this time minus the last dose's
 *    offset — a fixed wall-clock boundary vetoing a T=0 system, so a patient who
 *    woke at 14:00 could not open a day at all. The gate is gone; the same
 *    arithmetic now feeds `dosesPastBedtime()`, which Today shows as a warning
 *    before starting.
 *
 * `getLatestStartTime()` still works back from this time by the last
 * supplement's offset, and the line below still shows it, so the number being
 * set stays visibly connected to what it affects.
 */

export default function BedtimeScreen() {
  useLanguage(); // re-render this screen when the language changes
  const [hour, setHour] = useState(22);
  const [minute, setMinute] = useState(0);
  const [saved, setSaved] = useState<{ hour: number; minute: number } | null>(null);
  const [cutoff, setCutoff] = useState<Date | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  const load = useCallback(async () => {
    const profile = await getProfile();
    const h = profile?.bedtime_hour ?? 22;
    const m = profile?.bedtime_minute ?? 0;
    setHour(h);
    setMinute(m);
    setDraft(formatHourMinute(h, m));
    setSaved({ hour: h, minute: m });
    setCutoff(await getLatestStartTime().catch(() => null));
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  /**
   * Commits the typed draft. Guarded for the same reason as the Food screen:
   * `onSubmitEditing` closes the field, unmounting a focused input fires
   * `onBlur`, and both are wired here — so one edit would otherwise write twice
   * and race its own reload.
   */
  const committing = useRef(false);

  const commitDraft = async () => {
    if (committing.current) return;
    committing.current = true;
    setEditing(false);
    try {
      const parsed = parseTimeOfDay(draft);
      // An unparseable entry leaves the stored bedtime alone. A wrong boundary
      // silently mis-warns about every dose, so guessing is worse than refusing.
      if (!parsed) { setDraft(formatHourMinute(hour, minute)); return; }

      setHour(parsed.hour);
      setMinute(parsed.minute);
      setDraft(formatHourMinute(parsed.hour, parsed.minute));

      try {
        await updateProfile({ bedtime_hour: parsed.hour, bedtime_minute: parsed.minute });
        setSaved({ hour: parsed.hour, minute: parsed.minute });
        setCutoff(await getLatestStartTime().catch(() => null));
        hSuccess();
      } catch {
        Alert.alert(t('saveFailed'), t('saveFailedSub'));
      }
    } finally {
      committing.current = false;
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <View style={styles.iconWrap}>
          <Ionicons name="moon-outline" size={22} color="#5B5BD6" />
        </View>
        <View style={{ flex: 1 }}>
          {editing ? (
            <TextInput
              style={styles.heroField}
              value={draft}
              onChangeText={setDraft}
              onBlur={commitDraft}
              onSubmitEditing={commitDraft}
              keyboardType="numbers-and-punctuation"
              autoFocus
              accessibilityLabel={t('bedTimeField')}
            />
          ) : (
            <TouchableOpacity
              onPress={() => { hSelect(); setDraft(formatHourMinute(hour, minute)); setEditing(true); }}
              accessibilityRole="button"
              accessibilityLabel={t('bedTimeA11y', { time: formatHourMinute(hour, minute) })}
            >
              <Text style={styles.heroValue}>{formatHourMinute(hour, minute)}</Text>
            </TouchableOpacity>
          )}
          <Text style={styles.heroSub}>
            {cutoff
              ? t('bedLatestStart', { time: cutoff.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' }) })
              : t('bedNoSupplements')}
          </Text>
        </View>
      </View>

      <Text style={styles.note}>
        {t('bedGateNote')}
      </Text>

      <Text style={styles.hint}>{t('bedTimeHint')}</Text>

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
  heroField: { ...T.display, color: C.text, padding: 0 },
  heroSub:   { ...T.small, color: C.textSub, marginTop: 2 },

  note:  { ...T.small, color: C.textSub, marginTop: space.md, lineHeight: 20 },
  hint:  { ...T.small, color: C.textMuted, marginTop: space.sm, lineHeight: 20 },
});
