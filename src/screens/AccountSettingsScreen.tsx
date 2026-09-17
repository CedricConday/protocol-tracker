import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Pressable from '../components/Pressable';
import { useAppReset } from '../context/AppResetContext';
import { getDb } from '../db/schema';
import { getMigrationStatus } from '../db/migrations';
import { t, useLanguage } from '../i18n';
import { C, space, radius, text as T, themed, useTheme } from '../theme';

/**
 * Account settings.
 *
 * The two destructive actions used to sit in a red "Danger zone" at the foot of
 * Settings, under the version line — the last thing on a screen a user scrolls
 * through looking for something else. They are behind one row under About now.
 * Both still confirm before they run, and both say plainly what they erase.
 */
export default function AccountSettingsScreen() {
  useLanguage(); // re-render this screen when the language changes
  useTheme(); // ...and when the theme tier changes
  const resetToOnboarding = useAppReset();

  // Shown only when something is actually wrong. A schema line on a healthy
  // install is noise; on a stalled one it is the only visible symptom, and
  // without it the app looks like it is simply refusing to save.
  const [schema, setSchema] = useState<{ version: number; latest: number; error: string | null } | null>(null);
  useEffect(() => {
    getDb()
      .then(getMigrationStatus)
      .then((s) => setSchema(s.error !== null || s.version < s.latest ? s : null))
      .catch(() => setSchema(null));
  }, []);

  const handleResetAll = () => {
    Alert.alert(
      t('resetTracking'),
      t('accResetBody'),
      [
        { text: t('commonCancel'), style: 'cancel' },
        {
          text: t('accResetCta'), style: 'destructive',
          onPress: async () => {
            const db = await getDb();
            await db.withTransactionAsync(async () => {
              await db.execAsync(`
                DELETE FROM dose_logs; DELETE FROM water_logs; DELETE FROM daily_anchors;
                DELETE FROM exercise_logs; DELETE FROM journal_entries; DELETE FROM sun_log;
                DELETE FROM meal_log; DELETE FROM relapse_events; DELETE FROM calcium_logs;
              `);
            });
            // `fatigue_alert_shown` and `last_care_survey_date` no longer have
            // anything behind them (both removed 2026-09-17) — they stay in this
            // list so a reset still clears them on installs made before then.
            await AsyncStorage.multiRemove(['fatigue_alert_shown', 'last_care_survey_date', 'auto_report_last_week', 'review_prompted']);
            Alert.alert(t('accDone'), t('accClearedBody'));
          },
        },
      ],
    );
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      t('deleteAccount'),
      t('accDeleteBody'),
      [
        { text: t('commonCancel'), style: 'cancel' },
        {
          text: t('accDeleteCta'), style: 'destructive',
          onPress: async () => {
            const db = await getDb();
            await db.withTransactionAsync(async () => {
              await db.execAsync(`
                DELETE FROM user_profile; DELETE FROM supplements; DELETE FROM schedule_rules;
                DELETE FROM supplement_conflicts; DELETE FROM daily_anchors; DELETE FROM dose_logs;
                DELETE FROM water_logs; DELETE FROM exercise_logs; DELETE FROM journal_entries;
                DELETE FROM relapse_events; DELETE FROM sun_log; DELETE FROM meal_log;
                DELETE FROM blood_test_reminders; DELETE FROM lab_results;
                DELETE FROM mri_scans; DELETE FROM calcium_logs;
              `);
            });
            await AsyncStorage.clear();
            const { deleteItemAsync } = await import('expo-secure-store');
            await deleteItemAsync('ai_api_key');
            resetToOnboarding();
          },
        },
      ],
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.intro}>{t('accIntro')}</Text>

      {schema ? (
        <View style={styles.schemaWarn}>
          <Text style={styles.schemaWarnTitle}>{t('accSchemaStalled')}</Text>
          <Text style={styles.schemaWarnBody}>
            {t('accSchemaStalledBody', { version: schema.version, latest: schema.latest })}
          </Text>
          {schema.error ? <Text style={styles.schemaWarnDetail}>{schema.error}</Text> : null}
        </View>
      ) : null}

      <View style={styles.group}>
        <Pressable onPress={handleResetAll} accessibilityLabel={t('resetTracking')} accessibilityRole="button">
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{t('resetTracking')}</Text>
              <Text style={styles.rowSub}>{t('resetTrackingSub')}</Text>
            </View>
            <Text style={styles.cta}>{t('reset')}</Text>
          </View>
        </Pressable>
        <View style={styles.sep} />
        <Pressable onPress={handleDeleteAccount} accessibilityLabel={t('deleteAccount')} accessibilityRole="button">
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowTitle, { color: C.danger }]}>{t('deleteAccount')}</Text>
              <Text style={styles.rowSub}>{t('deleteAccountSub')}</Text>
            </View>
            <Text style={[styles.cta, { color: C.danger }]}>{t('delete')}</Text>
          </View>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = themed((C) => StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  content:   { padding: space.lg },
  intro:     { ...T.small, color: C.textSub, lineHeight: 20, marginBottom: space.lg },
  group: {
    backgroundColor: C.surface,
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#C0392B20',
  },
  schemaWarn: {
    backgroundColor: C.warningBg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: C.warning,
    padding: space.md,
    marginBottom: space.lg,
    gap: 4,
  },
  schemaWarnTitle:  { ...T.body, color: C.warningInk, fontWeight: '700' },
  schemaWarnBody:   { ...T.small, color: C.warningInk, lineHeight: 19 },
  schemaWarnDetail: { ...T.small, color: C.warningInk, opacity: 0.8, fontSize: 11 },
  row:      { flexDirection: 'row', alignItems: 'center', padding: space.md, gap: space.sm },
  rowTitle: { ...T.body, color: C.text, fontWeight: '700' },
  rowSub:   { ...T.small, color: C.textSub, marginTop: 2 },
  cta:      { ...T.body, color: C.danger, fontWeight: '800' },
  sep:      { height: StyleSheet.hairlineWidth, backgroundColor: C.border, marginHorizontal: space.md },
}));
