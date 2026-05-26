import { Ionicons } from '@expo/vector-icons';
import { Switch } from 'react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAppReset } from '../context/AppResetContext';
import {
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Alert,
  ScrollView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getProfile, updateProfile, getScheduleRules, updateRuleDose,
  updateRuleTolerance, getLastBloodTestDate,
  setLastBloodTestDate, getAllSupplements, updateSupplementStock,
  getSupplementForms, updateSupplementForm, getMiscFlag, setMiscFlag,
} from '../db/queries';
import { getDb } from '../db/schema';
import Pressable from '../components/Pressable';
import { t, setLanguage, getLanguage } from '../i18n';
import { C, space, radius, shadow, text as T } from '../theme';
import { tap as hTap, press as hPress, select as hSelect, success as hSuccess } from '../utils/haptics';

type ToleranceRule = { id: number; supplement_name: string; tolerance_window: number };
type Supplement = { id: string; name: string; stock_days: number | null };

export default function SettingsScreen() {
  const [name, setName] = useState('');
  const [weight, setWeight] = useState('');
  const [d3Dose, setD3Dose] = useState('');
  const [d3RuleId, setD3RuleId] = useState<number | null>(null);
  const [bedtimeHour, setBedtimeHour] = useState(22);
  const [bedtimeMinute, setBedtimeMinute] = useState(0);
  const [toleranceRules, setToleranceRules] = useState<ToleranceRule[]>([]);
  const [toleranceChanges, setToleranceChanges] = useState<Map<number, number>>(new Map());
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [bloodTestDate, setBloodTestDate] = useState('');
  const [supplements, setSupplements] = useState<Supplement[]>([]);
  const [stockChanges, setStockChanges] = useState<Map<string, string>>(new Map());
  const [currentLanguage, setCurrentLanguage] = useState('en');

  const [aiProvider, setAiProvider] = useState('groq');
  const [aiApiKey, setAiApiKey] = useState('');
  const [nudgeFocus, setNudgeFocus] = useState<string>('all');
  const [suppForms, setSuppForms] = useState<{ id: string; name: string; form: string }[]>([]);
  const [notifPrefs, setNotifPrefs] = useState<Record<string, boolean>>({
    supplements: true, water: true, exercise: true, morning_checkin: true, weekly_summary: true,
  });
  const [quietStart, setQuietStart] = useState('22:00');
  const [quietEnd, setQuietEnd] = useState('07:00');
  const [pulseDosing, setPulseDosing] = useState(false);
  const [strictMode, setStrictMode] = useState(false);
  const [expandedSection, setExpandedSection] = useState<string | null>(null);

  const toggleSection = (key: string) => {
    hSelect();
    setExpandedSection((prev) => (prev === key ? null : key));
  };

  const navigation = useNavigation<any>();
  const resetToOnboarding = useAppReset();

  useEffect(() => {
    (async () => {
      const profile = await getProfile();
      if (profile) {
        setName(profile.name);
        setWeight(String(profile.weight_kg));
        setBedtimeHour(profile.bedtime_hour ?? 22);
        setBedtimeMinute(profile.bedtime_minute ?? 0);
      }
      const rules = await getScheduleRules();
      const d3 = rules.find((r) => r.supplement_id === 'vit_d3');
      if (d3) { setD3RuleId(d3.id); setD3Dose(d3.dose_amount); }

      const db = await getDb();
      const toleranceRulesData = await db.getAllAsync(`
        SELECT sr.id, s.name as supplement_name, sr.tolerance_window
        FROM schedule_rules sr
        JOIN supplements s ON sr.supplement_id = s.id
        ORDER BY sr.display_order ASC
      `) as ToleranceRule[];
      setToleranceRules(toleranceRulesData);

      const lastTest = await getLastBloodTestDate();
      if (lastTest) setBloodTestDate(lastTest);

      const allSupps = await getAllSupplements();
      setSupplements(allSupps);

      const lang = await getLanguage();
      setCurrentLanguage(lang);

      const savedAiProvider = await AsyncStorage.getItem('ai_provider');
      const savedAiApiKey = await AsyncStorage.getItem('ai_api_key');
      if (savedAiProvider) setAiProvider(savedAiProvider);
      if (savedAiApiKey) setAiApiKey(savedAiApiKey);

      const nudge = await AsyncStorage.getItem('nudge_focus');
      if (nudge) setNudgeFocus(nudge);
      const forms = await getSupplementForms();
      setSuppForms(forms);

      const topics = ['supplements', 'water', 'exercise', 'morning_checkin', 'weekly_summary'];
      const loaded: Record<string, boolean> = {};
      for (const tp of topics) {
        const val = await getMiscFlag(`notif_pref_${tp}`);
        loaded[tp] = val === null ? true : val === 'true';
      }
      setNotifPrefs(loaded);
      const qs = await getMiscFlag('notif_quiet_start');
      if (qs) setQuietStart(qs);
      const qe = await getMiscFlag('notif_quiet_end');
      if (qe) setQuietEnd(qe);
      const pd = await getMiscFlag('pulse_dosing_enabled');
      if (pd) setPulseDosing(pd === 'true');
      const sm = await getMiscFlag('strict_mode_enabled');
      if (sm) setStrictMode(sm === 'true');
    })();
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await updateProfile({
        name: name.trim(),
        weight_kg: parseFloat(weight),
        bedtime_hour: bedtimeHour,
        bedtime_minute: bedtimeMinute,
      });
      if (d3RuleId != null && d3Dose.trim()) {
        await updateRuleDose(d3RuleId, d3Dose.trim(), 'IU');
      }
      for (const [ruleId, value] of toleranceChanges) {
        await updateRuleTolerance(ruleId, value);
      }
      setToleranceChanges(new Map());
      if (bloodTestDate.trim()) await setLastBloodTestDate(bloodTestDate.trim());
      for (const [id, val] of stockChanges) {
        const num = parseInt(val, 10);
        await updateSupplementStock(id, isNaN(num) ? null : num);
      }
      setStockChanges(new Map());
      await AsyncStorage.setItem('ai_provider', aiProvider);
      await AsyncStorage.setItem('ai_api_key', aiApiKey);
      for (const [key, val] of Object.entries(notifPrefs)) {
        await setMiscFlag(`notif_pref_${key}`, val ? 'true' : 'false');
      }
      await setMiscFlag('notif_quiet_start', quietStart);
      await setMiscFlag('notif_quiet_end', quietEnd);
      setSaved(true);
      hSuccess();
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }, [name, weight, d3Dose, d3RuleId, bedtimeHour, bedtimeMinute, toleranceChanges, bloodTestDate, stockChanges, aiProvider, aiApiKey, notifPrefs, quietStart, quietEnd]);

  const handleResetAll = () => {
    Alert.alert(
      'Reset tracking data',
      'Clears dose logs, water, journal, exercise, meals, surveys. Your schedule and profile stay.\n\nThis cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset', style: 'destructive',
          onPress: async () => {
            const db = await getDb();
            await db.execAsync(`
              DELETE FROM dose_logs; DELETE FROM water_logs; DELETE FROM daily_anchors;
              DELETE FROM exercise_logs; DELETE FROM journal_entries; DELETE FROM sun_log;
              DELETE FROM meal_log; DELETE FROM relapse_events; DELETE FROM care_surveys;
              DELETE FROM sleep_checkins; DELETE FROM calcium_logs;
            `);
            await AsyncStorage.multiRemove(['fatigue_alert_shown','last_care_survey_date','auto_report_last_week','review_prompted']);
            Alert.alert('Done', 'Tracking data cleared.');
          },
        },
      ],
    );
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete account',
      'Erases everything — profile, schedule, all logs. The app restarts at setup.\n\nThis cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete everything', style: 'destructive',
          onPress: async () => {
            const db = await getDb();
            await db.execAsync(`
              DELETE FROM user_profile; DELETE FROM supplements; DELETE FROM schedule_rules;
              DELETE FROM supplement_conflicts; DELETE FROM daily_anchors; DELETE FROM dose_logs;
              DELETE FROM water_logs; DELETE FROM exercise_logs; DELETE FROM journal_entries;
              DELETE FROM relapse_events; DELETE FROM sun_log; DELETE FROM meal_log;
              DELETE FROM care_surveys; DELETE FROM blood_test_reminders; DELETE FROM lab_results;
              DELETE FROM mri_scans; DELETE FROM sleep_checkins; DELETE FROM calcium_logs;
            `);
            await AsyncStorage.clear();
            resetToOnboarding();
          },
        },
      ],
    );
  };

  const handleToleranceChange = (ruleId: number, delta: number) => {
    const current = toleranceChanges.get(ruleId) ?? toleranceRules.find((r) => r.id === ruleId)?.tolerance_window ?? 30;
    const next = Math.min(120, Math.max(15, current + delta));
    setToleranceChanges((prev) => {
      const m = new Map(prev); m.set(ruleId, next); return m;
    });
  };

  const getToleranceValue = (ruleId: number): number => {
    if (toleranceChanges.has(ruleId)) return toleranceChanges.get(ruleId)!;
    const rule = toleranceRules.find((r) => r.id === ruleId);
    return rule?.tolerance_window ?? 30;
  };

  const getStockValue = (id: string): string => {
    if (stockChanges.has(id)) return stockChanges.get(id)!;
    const s = supplements.find((sup) => sup.id === id);
    return s?.stock_days != null ? String(s.stock_days) : '';
  };

  const handleLanguageSwitch = async (lang: string) => {
    await setLanguage(lang);
    setCurrentLanguage(lang);
  };

  const initials = useMemo(() => {
    if (!name.trim()) return '·';
    return name.trim().split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  }, [name]);

  // ── Primitives ──────────────────────────────────────────────────────────────

  const Row = ({
    icon, label, sub, onPress, right, last, badge, dim,
  }: {
    icon: string; label: string; sub?: string; onPress?: () => void;
    right?: React.ReactNode; last?: boolean; badge?: number; dim?: boolean;
  }) => {
    const inner = (
      <View style={[styles.row, last && styles.rowLast, dim && { opacity: 0.45 }]}>
        <View style={styles.iconPill}>
          <Ionicons name={icon as any} size={17} color={C.primary} />
        </View>
        <View style={styles.rowContent}>
          <Text style={styles.rowLabel}>{label}</Text>
          {sub ? <Text style={styles.rowSub}>{sub}</Text> : null}
        </View>
        {badge ? (
          <View style={styles.badge}><Text style={styles.badgeText}>{badge}</Text></View>
        ) : null}
        {right ?? (onPress ? (
          <Ionicons name="chevron-forward" size={16} color={C.textMuted} />
        ) : null)}
      </View>
    );
    if (!onPress) return inner;
    return (
      <Pressable onPress={onPress} accessibilityLabel={label} accessibilityRole="button">
        {inner}
      </Pressable>
    );
  };

  const Group = ({ label, children }: { label?: string; children: React.ReactNode }) => (
    <View style={styles.groupWrap}>
      {label ? <Text style={styles.groupLabel}>{label}</Text> : null}
      <View style={styles.group}>{children}</View>
    </View>
  );

  const Expand = ({ k, children }: { k: string; children: React.ReactNode }) =>
    expandedSection === k ? <View style={styles.expand}>{children}</View> : null;

  const BEDTIME_HOURS = [18, 19, 20, 21, 22, 23];
  const BEDTIME_MINUTES = [0, 15, 30, 45];

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >

          <Text style={styles.title}>Settings</Text>

          {/* ── Profile Hero ──────────────────────────────────────────────── */}
          <View style={styles.hero}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>
            <View style={styles.heroInfo}>
              <Text style={styles.heroName}>{name || 'Add your name'}</Text>
              <Text style={styles.heroSub}>
                {d3Dose ? `${d3Dose} IU D3 · daily` : 'Protocol not configured yet'}
              </Text>
            </View>
            {pulseDosing ? <View style={styles.statusDot} /> : null}
          </View>

          {/* ── Protocol ──────────────────────────────────────────────────── */}
          <Group label="Protocol">
            <Row icon="person-outline" label="You" sub={name ? `${name}${weight ? ` · ${weight} kg` : ''}` : 'Name, weight, language'} onPress={() => toggleSection('profile')} />
            <Expand k="profile">
              <Text style={styles.inputLabel}>{t('yourName')}</Text>
              <TextInput style={styles.input} placeholder="Alex" placeholderTextColor={C.textMuted} value={name} onChangeText={setName} autoCapitalize="words" />
              <Text style={styles.inputLabel}>{t('weightKg')}</Text>
              <TextInput style={styles.input} placeholder="70" placeholderTextColor={C.textMuted} value={weight} onChangeText={setWeight} keyboardType="numeric" />
              <Text style={styles.inputLabel}>{t('language')}</Text>
              <View style={styles.segment}>
                {['en', 'de'].map((lang) => (
                  <Pressable
                    key={lang}
                    style={[styles.segmentBtn, currentLanguage === lang && styles.segmentBtnActive]}
                    onPress={() => handleLanguageSwitch(lang)}
                    accessibilityLabel={`Switch to ${lang}`} accessibilityRole="button"
                  >
                    <Text style={[styles.segmentText, currentLanguage === lang && styles.segmentTextActive]}>{lang.toUpperCase()}</Text>
                  </Pressable>
                ))}
              </View>
            </Expand>

            <Row icon="flask-outline" label="Daily D3" sub={d3Dose ? `${d3Dose} IU` : 'Not set'} onPress={() => toggleSection('dose')} />
            <Expand k="dose">
              <Text style={styles.inputLabel}>{t('dailyD3')}</Text>
              <TextInput style={styles.input} placeholder="5000" placeholderTextColor={C.textMuted} value={d3Dose} onChangeText={setD3Dose} keyboardType="numeric" />
            </Expand>

            <Row icon="list-outline" label="Manage supplements" sub="Add, edit, remove" onPress={() => navigation.navigate('SupplementEditor')} />

            <Row icon="timer-outline" label="Timing windows" sub="Tolerance per supplement" onPress={() => toggleSection('timing')} />
            <Expand k="timing">
              {toleranceRules.map((rule) => {
                const val = getToleranceValue(rule.id);
                return (
                  <View key={rule.id} style={styles.toleranceRow}>
                    <Text style={styles.toleranceName}>{rule.supplement_name}</Text>
                    <View style={styles.stepper}>
                      <Pressable haptic style={[styles.stepperBtn, val <= 15 && styles.stepperBtnDisabled]} onPress={() => handleToleranceChange(rule.id, -15)} disabled={val <= 15}>
                        <Text style={styles.stepperBtnText}>−</Text>
                      </Pressable>
                      <Text style={styles.stepperValue}>{val}m</Text>
                      <Pressable haptic style={[styles.stepperBtn, val >= 120 && styles.stepperBtnDisabled]} onPress={() => handleToleranceChange(rule.id, 15)} disabled={val >= 120}>
                        <Text style={styles.stepperBtnText}>+</Text>
                      </Pressable>
                    </View>
                  </View>
                );
              })}
            </Expand>

            <Row
              icon="moon-outline" label="Bedtime"
              sub={`${String(bedtimeHour).padStart(2, '0')}:${String(bedtimeMinute).padStart(2, '0')}`}
              onPress={() => toggleSection('bedtime')}
              last
            />
            <Expand k="bedtime">
              <Text style={styles.miniLabel}>Hour</Text>
              <View style={styles.chipWrap}>
                {BEDTIME_HOURS.map((h) => (
                  <Pressable
                    key={h}
                    style={[styles.chip, bedtimeHour === h && styles.chipActive]}
                    onPress={() => setBedtimeHour(h)}
                    accessibilityLabel={`Hour ${h}`} accessibilityRole="button"
                  >
                    <Text style={[styles.chipText, bedtimeHour === h && styles.chipTextActive]}>
                      {String(h).padStart(2, '0')}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Text style={styles.miniLabel}>Minutes</Text>
              <View style={styles.chipWrap}>
                {BEDTIME_MINUTES.map((m) => (
                  <Pressable
                    key={m}
                    style={[styles.chip, bedtimeMinute === m && styles.chipActive]}
                    onPress={() => setBedtimeMinute(m)}
                    accessibilityLabel={`Minute ${m}`} accessibilityRole="button"
                  >
                    <Text style={[styles.chipText, bedtimeMinute === m && styles.chipTextActive]}>
                      :{String(m).padStart(2, '0')}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </Expand>
          </Group>

          {/* ── Behaviour ─────────────────────────────────────────────────── */}
          <Group label="Behaviour">
            <View style={styles.row}>
              <View style={styles.iconPill}><Ionicons name="repeat-outline" size={17} color={C.primary} /></View>
              <View style={styles.rowContent}>
                <Text style={styles.rowLabel}>Pulse dosing</Text>
                <Text style={styles.rowSub}>Sunday is a rest day</Text>
              </View>
              {pulseDosing && <View style={styles.dotInline} />}
              <Switch
                value={pulseDosing}
                onValueChange={async (v) => { hSelect(); setPulseDosing(v); await setMiscFlag('pulse_dosing_enabled', v ? 'true' : 'false'); }}
                trackColor={{ false: C.surface2, true: C.primary }} thumbColor="#fff"
                accessibilityLabel="Toggle pulse dosing"
              />
            </View>
            <View style={styles.row}>
              <View style={styles.iconPill}><Ionicons name="shield-outline" size={17} color={C.primary} /></View>
              <View style={styles.rowContent}>
                <Text style={styles.rowLabel}>Strict mode</Text>
                <Text style={styles.rowSub}>Flag every interaction</Text>
              </View>
              {strictMode && <View style={styles.dotInline} />}
              <Switch
                value={strictMode}
                onValueChange={async (v) => { hSelect(); setStrictMode(v); await setMiscFlag('strict_mode_enabled', v ? 'true' : 'false'); }}
                trackColor={{ false: C.surface2, true: C.primary }} thumbColor="#fff"
                accessibilityLabel="Toggle strict mode"
              />
            </View>
            <Row icon="cube-outline" label="Supplement stock" sub="Days on hand" onPress={() => toggleSection('stock')} last />
            <Expand k="stock">
              {supplements.map((s) => (
                <View key={s.id} style={{ marginBottom: space.md }}>
                  <Text style={styles.toleranceName}>{s.name}</Text>
                  <TextInput
                    style={[styles.input, { marginTop: 4 }]}
                    placeholder="Days (e.g. 30)"
                    placeholderTextColor={C.textMuted}
                    value={getStockValue(s.id)}
                    onChangeText={(val) => setStockChanges((prev) => { const m = new Map(prev); m.set(s.id, val); return m; })}
                    keyboardType="numeric"
                  />
                </View>
              ))}
              {suppForms.map((s) => (
                <View key={s.id} style={styles.formRowWrap}>
                  <Text style={styles.stockName}>{s.name}</Text>
                  <View style={styles.formRow}>
                    {(['capsule', 'tablet', 'powder', 'liquid'] as const).map((f) => (
                      <Pressable
                        key={f}
                        style={[styles.formBtn, s.form === f && styles.formBtnActive]}
                        onPress={async () => { await updateSupplementForm(s.id, f); setSuppForms((prev) => prev.map((x) => x.id === s.id ? { ...x, form: f } : x)); }}
                        accessibilityLabel={`${s.name} ${f}`} accessibilityRole="button"
                      >
                        <Text style={[styles.formBtnText, s.form === f && styles.formBtnTextActive]}>{f[0].toUpperCase()}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              ))}
            </Expand>
          </Group>

          {/* ── Health ────────────────────────────────────────────────────── */}
          <Group label="Health">
            <Row icon="flask-outline"    label="Lab results"        sub="PTH · Vitamin D · Calcium" onPress={() => navigation.navigate('LabResults')} />
            <Row icon="moon-outline"       label="Sleep check-in"    sub="Weekly hygiene score"     onPress={() => navigation.navigate('Sleep')} />
            <Row icon="flame-outline"      label="Calcium log"       sub="3-day reintroduction"     onPress={() => navigation.navigate('CalciumLog')} last />
          </Group>

          {/* ── App ───────────────────────────────────────────────────────── */}
          <Group label="App">
            <Row icon="notifications-outline"     label="Notifications" sub="Topics, quiet hours" onPress={() => toggleSection('notif')} />
            <Expand k="notif">
              {[
                { key: 'supplements',    label: 'Supplement reminders' },
                { key: 'water',          label: 'Water' },
                { key: 'exercise',       label: 'Exercise' },
                { key: 'morning_checkin',label: 'Morning check-in' },
                { key: 'weekly_summary', label: 'Weekly summary' },
              ].map((item) => (
                <View key={item.key} style={styles.notifRow}>
                  <Text style={styles.notifLabel}>{item.label}</Text>
                  <Switch
                    value={notifPrefs[item.key]}
                    onValueChange={(v) => { hSelect(); setNotifPrefs((prev) => ({ ...prev, [item.key]: v })); }}
                    trackColor={{ false: C.surface2, true: C.primary }} thumbColor="#fff"
                  />
                </View>
              ))}
              <Text style={[styles.miniLabel, { marginTop: space.md }]}>Quiet hours</Text>
              <View style={styles.quietRow}>
                <TextInput style={[styles.input, { flex: 1 }]} placeholder="22:00" placeholderTextColor={C.textMuted} value={quietStart} onChangeText={setQuietStart} autoCapitalize="none" />
                <Text style={styles.quietSep}>to</Text>
                <TextInput style={[styles.input, { flex: 1 }]} placeholder="07:00" placeholderTextColor={C.textMuted} value={quietEnd} onChangeText={setQuietEnd} autoCapitalize="none" />
              </View>
            </Expand>
            <Row icon="download-outline"            label="Export my data" onPress={() => Alert.alert('Backup', 'Data export feature to be implemented')} />
            <Row icon="information-circle-outline"  label="About"          onPress={() => navigation.navigate('About')} />
            <Row icon="key-outline"                 label="Passkeys"       sub="Coming soon" dim last />
          </Group>

          {/* ── Danger ────────────────────────────────────────────────────── */}
          <Text style={[styles.groupLabel, { color: C.danger }]}>Danger zone</Text>
          <View style={[styles.group, styles.dangerGroup]}>
            <Pressable onPress={handleResetAll} accessibilityLabel="Reset tracking data" accessibilityRole="button">
              <View style={styles.dangerRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.dangerTitle}>Reset tracking data</Text>
                  <Text style={styles.dangerSub}>Clears logs. Keeps schedule and profile.</Text>
                </View>
                <Text style={styles.dangerCta}>Reset</Text>
              </View>
            </Pressable>
            <View style={styles.dangerSep} />
            <Pressable onPress={handleDeleteAccount} accessibilityLabel="Delete account" accessibilityRole="button">
              <View style={styles.dangerRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.dangerTitle, { color: C.danger }]}>Delete account</Text>
                  <Text style={styles.dangerSub}>Wipes everything. Restarts setup.</Text>
                </View>
                <Text style={[styles.dangerCta, { color: C.danger }]}>Delete</Text>
              </View>
            </Pressable>
          </View>

          <Text style={styles.version}>the Protocol App · v1.0.0 · © 2026</Text>

        </ScrollView>

        {/* ── Save Footer ──────────────────────────────────────────────────── */}
        <View style={styles.footer}>
          <Pressable
            onPress={() => { hPress(); handleSave(); }}
            disabled={saving}
            style={[styles.saveBtn, saving && { opacity: 0.4 }]}
            accessibilityLabel={saving ? 'Saving' : 'Save changes'} accessibilityRole="button"
          >
            <Text style={styles.saveBtnText}>{saving ? t('saving') : saved ? `${t('saved')} ✓` : t('save')}</Text>
          </Pressable>
        </View>

      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: C.bg },
  flex:         { flex: 1 },
  scrollView:   { flex: 1 },
  scrollContent:{ paddingHorizontal: space.lg, paddingTop: space.xxxl, paddingBottom: space.xl },

  title: { ...T.display, color: C.text, marginBottom: space.lg },

  // Hero
  hero: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: radius.xl,
    padding: space.lg,
    marginBottom: space.xl,
    ...shadow.medium,
  },
  avatar: {
    width: 56, height: 56, borderRadius: radius.pill,
    backgroundColor: C.primaryBg,
    alignItems: 'center', justifyContent: 'center',
    marginRight: space.md,
  },
  avatarText: { ...T.subheading, color: C.primary },
  heroInfo:   { flex: 1 },
  heroName:   { ...T.subheading, color: C.text },
  heroSub:    { ...T.small, color: C.textSub, marginTop: 2 },
  statusDot:  { width: 8, height: 8, borderRadius: radius.pill, backgroundColor: C.success },

  // Groups (iOS-style)
  groupWrap:  { marginBottom: space.xl },
  groupLabel: { ...T.caps, color: C.textSub, marginBottom: space.sm, marginLeft: space.sm },
  group: {
    backgroundColor: '#fff',
    borderRadius: radius.lg,
    overflow: 'hidden',
    ...shadow.subtle,
  },

  // Rows
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: space.md, paddingVertical: space.md,
    minHeight: 60,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.surface,
  },
  rowLast:    { borderBottomWidth: 0 },
  iconPill: {
    width: 32, height: 32, borderRadius: radius.sm,
    backgroundColor: C.primaryBg,
    alignItems: 'center', justifyContent: 'center',
    marginRight: space.md,
  },
  rowContent: { flex: 1 },
  rowLabel:   { ...T.bodyLg, color: C.text, fontWeight: '600' },
  rowSub:     { ...T.small, color: C.textSub, marginTop: 2 },
  dotInline:  { width: 8, height: 8, borderRadius: radius.pill, backgroundColor: C.success, marginRight: space.sm },

  badge: {
    backgroundColor: C.primary, borderRadius: radius.pill,
    minWidth: 22, height: 22, paddingHorizontal: 6,
    alignItems: 'center', justifyContent: 'center',
    marginRight: space.sm,
  },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: '800' },

  // Expand panels
  expand: {
    paddingHorizontal: space.md,
    paddingTop: space.sm,
    paddingBottom: space.md,
    backgroundColor: C.bg,
  },

  // Inputs
  inputLabel: { ...T.small, color: C.textSub, marginTop: space.md, marginBottom: 4, fontWeight: '600' },
  miniLabel:  { ...T.caps,  color: C.textSub, marginTop: space.sm, marginBottom: space.sm },
  input: {
    backgroundColor: 'transparent',
    paddingVertical: 12, paddingHorizontal: 0,
    color: C.text, fontSize: 16,
    borderBottomWidth: 1, borderBottomColor: C.border,
  },

  // Segment (language)
  segment: { flexDirection: 'row', gap: space.sm, marginTop: space.sm },
  segmentBtn: {
    flex: 1, paddingVertical: 12,
    borderRadius: radius.md,
    backgroundColor: C.surface,
    alignItems: 'center',
  },
  segmentBtnActive: { backgroundColor: C.primaryBg },
  segmentText:      { ...T.body, color: C.textSub, fontWeight: '700' },
  segmentTextActive:{ color: C.primary },

  // Chips
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: {
    paddingHorizontal: space.md, paddingVertical: 10,
    borderRadius: radius.md,
    backgroundColor: C.surface,
  },
  chipActive:    { backgroundColor: C.primaryBg },
  chipText:      { ...T.body, color: C.textSub, fontWeight: '600' },
  chipTextActive:{ color: C.primary, fontWeight: '700' },

  // Tolerance stepper
  toleranceRow:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: space.sm },
  toleranceName:   { ...T.body, color: C.textSub, fontWeight: '600', flex: 1 },
  stepper:         { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  stepperBtn:      { width: 36, height: 36, borderRadius: radius.md, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' },
  stepperBtnDisabled: { opacity: 0.3 },
  stepperBtnText:  { color: C.text, fontSize: 18, fontWeight: '700' },
  stepperValue:    { color: C.text, fontSize: 15, fontWeight: '700', minWidth: 44, textAlign: 'center' },

  // Supplement form
  formRowWrap: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: space.sm },
  stockName:   { ...T.body, color: C.textSub, fontWeight: '600', flex: 1 },
  formRow:     { flexDirection: 'row', gap: 4 },
  formBtn:     { width: 32, height: 32, borderRadius: radius.sm, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' },
  formBtnActive:{ backgroundColor: C.primaryBg },
  formBtnText: { color: C.textMuted, fontSize: 11, fontWeight: '700' },
  formBtnTextActive: { color: C.primary },

  // Notifications
  notifRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10 },
  notifLabel: { ...T.body, color: C.text, flex: 1 },
  quietRow:  { flexDirection: 'row', gap: space.md, alignItems: 'center' },
  quietSep:  { ...T.body, color: C.textSub },

  // Danger
  dangerGroup: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#C0404020' },
  dangerRow: { flexDirection: 'row', alignItems: 'center', padding: space.md, gap: space.sm },
  dangerTitle: { ...T.body, color: C.text, fontWeight: '700' },
  dangerSub:   { ...T.small, color: C.textSub, marginTop: 2 },
  dangerCta:   { ...T.body, color: C.danger, fontWeight: '800' },
  dangerSep:   { height: StyleSheet.hairlineWidth, backgroundColor: C.border, marginHorizontal: space.md },

  // Footer
  version: { ...T.small, color: C.textMuted, textAlign: 'center', marginTop: space.md, marginBottom: space.lg },
  footer:  { paddingHorizontal: space.lg, paddingVertical: space.md, paddingBottom: space.lg },
  saveBtn: {
    backgroundColor: C.primary, borderRadius: radius.lg,
    paddingVertical: 18, alignItems: 'center',
    ...shadow.medium,
  },
  saveBtnText: { ...T.bodyLg, color: '#fff', fontWeight: '800' },
});
