import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  Alert,
  ScrollView,
  Linking,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getProfile, updateProfile, getSupplementsWithRules,
  getMiscFlag, setMiscFlag, getWeatherEnabled, setWeatherEnabled,
} from '../db/queries';
import { SUPPORT_URL, MEDICAL_DISCLAIMER } from '../config/links';
import Pressable from '../components/Pressable';
import { t, setLanguage, getLanguage, useLanguage } from '../i18n';
import { C, space, radius, shadow, text as T } from '../theme';
import { tap as hTap, press as hPress, select as hSelect, success as hSuccess } from '../utils/haptics';
import { seedSimulatedHistory, clearSeededHistory } from '../db/devSeed';
import { QUIET_ENABLED_FLAG, DEFAULT_QUIET_START, DEFAULT_QUIET_END, parseHhMm } from '../notifications/quietHours';


// ── Primitives ────────────────────────────────────────────────────────────────
// Module scope on purpose: as inner functions these were a fresh component type
// on every render, so React unmounted and remounted the subtree on each
// keystroke and the keyboard closed after every digit.

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

const Expand = ({ open, children }: { open: boolean; children: React.ReactNode }) =>
  open ? <View style={styles.expand}>{children}</View> : null;

type D3Display = { dose: string; unit: string } | null;

// The pure-tracker build seeds nothing, so there is no fixed 'vit_d3' id: the
// user creates their own supplements. Find the D3 entry by name, falling back
// to the first row measured in IU.
async function readD3Display(): Promise<D3Display> {
  const rows = await getSupplementsWithRules();
  const byName = rows.find((r) => /(^|\W)(d3|vitamin\s*d)/i.test(r.name));
  const row = byName ?? rows.find((r) => r.dose_unit.trim().toUpperCase() === 'IU');
  if (!row || !row.dose_amount.trim()) return null;
  return { dose: row.dose_amount.trim(), unit: row.dose_unit.trim() || 'IU' };
}


// expo-secure-store has no web implementation: the module's default export has
// no `getValueWithKeyAsync`, so every call throws there and the rejection
// escapes as an uncaught error — the audit sees it on day 3, from Settings.
// `await` sits INSIDE the try on purpose; returning a promise from a try block
// does not bring that promise's rejection into the catch. Same stance as
// `syncClient.getPatientJwt`.
async function readSecret(key: string): Promise<string | null> {
  try {
    const { getItemAsync } = await import('expo-secure-store');
    return await getItemAsync(key);
  } catch {
    return null;
  }
}

/** Store or clear a secret. A platform without secure storage keeps neither. */
async function writeSecret(key: string, value: string | null): Promise<void> {
  try {
    const { setItemAsync, deleteItemAsync } = await import('expo-secure-store');
    if (value) await setItemAsync(key, value);
    else await deleteItemAsync(key);
  } catch {
    /* no secure store on this platform — nothing was written, nothing to clear */
  }
}

const NOTIF_TOPICS = ['supplements', 'water', 'exercise', 'morning_checkin', 'weekly_summary'];

/** The fields handleSave writes. Compared against live state to decide whether
 *  there is anything to save. */
type SavedFields = {
  name: string;
  aiProvider: string;
  aiApiKey: string;
  notifPrefs: Record<string, boolean>;
  quietOn: boolean;
  quietStart: string;
  quietEnd: string;
};

export default function SettingsScreen() {
  useLanguage(); // re-render this screen when the language changes
  const [name, setName] = useState('');
  // Display only: the daily D3 dose is edited in SupplementEditor.
  const [d3, setD3] = useState<D3Display>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [currentLanguage, setCurrentLanguage] = useState('en');

  const [aiProvider, setAiProvider] = useState('groq');
  const [aiApiKey, setAiApiKey] = useState('');
  const [notifPrefs, setNotifPrefs] = useState<Record<string, boolean>>({
    supplements: true, water: true, exercise: true, morning_checkin: true, weekly_summary: true,
  });
  const [weatherOn, setWeatherOn] = useState(true);
  // Opt-in: an install that never opens this panel notifies as it always did.
  const [quietOn, setQuietOn] = useState(false);
  const [quietStart, setQuietStart] = useState(DEFAULT_QUIET_START);
  const [quietEnd, setQuietEnd] = useState(DEFAULT_QUIET_END);
  const [pulseDosing, setPulseDosing] = useState(false);
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  // Set once the initial load finishes; null until then, which keeps the save
  // footer hidden while the screen is still populating itself.
  const [baseline, setBaseline] = useState<SavedFields | null>(null);

  const toggleSection = (key: string) => {
    hSelect();
    setExpandedSection((prev) => (prev === key ? null : key));
  };

  const navigation = useNavigation<any>();

  useEffect(() => {
    (async () => {
      const profile = await getProfile();
      const loadedName = profile ? profile.name : '';
      if (profile) {
        setName(loadedName);
      }
      setD3(await readD3Display());

      const lang = await getLanguage();
      setCurrentLanguage(lang);

      const savedAiProvider = await AsyncStorage.getItem('ai_provider');
      const savedAiApiKey = await readSecret('ai_api_key');
      if (savedAiProvider) setAiProvider(savedAiProvider);
      if (savedAiApiKey) setAiApiKey(savedAiApiKey);

      const loaded: Record<string, boolean> = {};
      for (const tp of NOTIF_TOPICS) {
        const val = await getMiscFlag(`notif_pref_${tp}`);
        loaded[tp] = val === null ? true : val === 'true';
      }
      setNotifPrefs(loaded);
      const qs = await getMiscFlag('notif_quiet_start');
      if (qs) setQuietStart(qs);
      setWeatherOn(await getWeatherEnabled());
      const qe = await getMiscFlag('notif_quiet_end');
      if (qe) setQuietEnd(qe);
      const qOn = await getMiscFlag(QUIET_ENABLED_FLAG);
      setQuietOn(qOn === 'true');
      const pd = await getMiscFlag('pulse_dosing_enabled');
      if (pd) setPulseDosing(pd === 'true');

      // Everything above is now the on-disk truth. Record it so the save
      // footer can tell "nothing touched yet" from "unsaved edits".
      setBaseline({
        name: loadedName,
        aiProvider: savedAiProvider || 'groq',
        aiApiKey: savedAiApiKey || '',
        notifPrefs: loaded,
        quietOn: qOn === 'true',
        quietStart: qs || DEFAULT_QUIET_START,
        quietEnd: qe || DEFAULT_QUIET_END,
      });
    })();
  }, []);

  // SupplementEditor owns the dose, so re-read it when we come back.
  useEffect(() => {
    const unsub = navigation.addListener('focus', async () => setD3(await readD3Display()));
    return unsub;
  }, [navigation]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await updateProfile({
        name: name.trim(),
      });
      await AsyncStorage.setItem('ai_provider', aiProvider);
      await writeSecret('ai_api_key', aiApiKey || null);
      for (const [key, val] of Object.entries(notifPrefs)) {
        await setMiscFlag(`notif_pref_${key}`, val ? 'true' : 'false');
      }
      await setMiscFlag(QUIET_ENABLED_FLAG, quietOn ? 'true' : 'false');
      await setMiscFlag('notif_quiet_start', quietStart);
      await setMiscFlag('notif_quiet_end', quietEnd);
      // Live values, not the trimmed copies written above — otherwise trailing
      // whitespace in a field would leave the footer stuck open after saving.
      setBaseline({
        name,
        aiProvider, aiApiKey, notifPrefs, quietOn, quietStart, quietEnd,
      });
      setSaved(true);
      hSuccess();
      setTimeout(() => setSaved(false), 2000);
    } catch {
      Alert.alert(t('saveFailed'), t('saveFailedSub'));
    } finally {
      setSaving(false);
    }
  }, [name, aiProvider, aiApiKey, notifPrefs, quietOn, quietStart, quietEnd]);

  const isDirty = useMemo(() => {
    if (!baseline) return false;
    return (
      name !== baseline.name ||
      aiProvider !== baseline.aiProvider ||
      aiApiKey !== baseline.aiApiKey ||
      quietOn !== baseline.quietOn ||
      quietStart !== baseline.quietStart ||
      quietEnd !== baseline.quietEnd ||
      NOTIF_TOPICS.some((k) => (notifPrefs[k] ?? true) !== (baseline.notifPrefs[k] ?? true))
    );
  }, [
    baseline, name,
    aiProvider, aiApiKey, quietOn, quietStart, quietEnd, notifPrefs,
  ]);

  const handleLanguageSwitch = async (lang: string) => {
    await setLanguage(lang);
    setCurrentLanguage(lang);
  };

  const initials = useMemo(() => {
    if (!name.trim()) return '·';
    return name.trim().split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  }, [name]);

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >

          <Text style={styles.title}>{t('settings')}</Text>

          {/* ── Profile Hero ──────────────────────────────────────────────
              The old "You" row in the Protocol group edited the same name the
              hero already displays, so its fields hang off the hero instead:
              tap the card to open name and language. */}
          <View style={styles.heroCard}>
            <Pressable
              onPress={() => toggleSection('profile')}
              accessibilityLabel={t('you')} accessibilityRole="button"
            >
              <View style={styles.hero}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{initials}</Text>
                </View>
                <View style={styles.heroInfo}>
                  <Text style={styles.heroName}>{name || 'Add your name'}</Text>
                  <Text style={styles.heroSub}>
                    {d3 ? `${d3.dose} ${d3.unit} D3 · daily` : 'Protocol not configured yet'}
                  </Text>
                </View>
                {pulseDosing ? <View style={styles.statusDot} /> : null}
                <Ionicons
                  name={expandedSection === 'profile' ? 'chevron-up' : 'chevron-down'}
                  size={16} color={C.textMuted} style={{ marginLeft: space.sm }}
                />
              </View>
            </Pressable>
            <Expand open={expandedSection === 'profile'}>
              <Text style={styles.inputLabel}>{t('yourName')}</Text>
              <TextInput style={styles.input} placeholder="Alex" placeholderTextColor={C.textMuted} value={name} onChangeText={setName} autoCapitalize="words" />
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
          </View>

          {/* The Protocol group is gone as of 2026-09-14. Manage supplements
              and Bedtime moved to the Trackers tab; Schedule & reminders,
              Reminder tone, Family Sync and Caregiver mode were all removed at
              Cedric's request. Caregiver went further — screen, route and Home
              header deleted, to be its own app. ScheduleScreen, CoachingStyle
              and FamilySync still exist as screens with no entry point. */}

          {/* ── App ──────────────────────────────────────────────────────
              Unlabelled: with Protocol gone this is the first group on the
              screen, and a caps heading over the only list reads as a section
              of something larger than it is. */}
          <Group>
            <Row icon="notifications-outline"     label={t('notifications')} sub={t('notificationsSub')} onPress={() => toggleSection('notif')} />
            <Expand open={expandedSection === 'notif'}>
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
              <View style={styles.notifRow}>
                <Text style={styles.notifLabel}>{t('setWeatherCard')}</Text>
                <Switch
                  value={weatherOn}
                  onValueChange={async (v) => { hSelect(); setWeatherOn(v); await setWeatherEnabled(v); }}
                  trackColor={{ false: C.surface2, true: C.primary }} thumbColor="#fff"
                  accessibilityLabel={t('setWeatherA11y')}
                />
              </View>
              <Text style={styles.notifHint}>
                On by default. It sends your approximate location — rounded to about 11 km, not
                your address — to open-meteo.com to get the UV window. Turn it off and nothing
                is sent.
              </Text>

              <View style={[styles.notifRow, { marginTop: space.md }]}>
                <Text style={styles.notifLabel}>{t('quietHours')}</Text>
                <Switch
                  value={quietOn}
                  onValueChange={(v) => { hSelect(); setQuietOn(v); }}
                  trackColor={{ false: C.surface2, true: C.primary }} thumbColor="#fff"
                  accessibilityLabel={t('setQuietA11y')}
                />
              </View>
              {quietOn ? (
                <>
                  <View style={styles.quietRow}>
                    <TextInput style={[styles.input, { flex: 1 }]} placeholder={DEFAULT_QUIET_START} placeholderTextColor={C.textMuted} value={quietStart} onChangeText={setQuietStart} autoCapitalize="none" keyboardType="numbers-and-punctuation" />
                    <Text style={styles.quietSep}>to</Text>
                    <TextInput style={[styles.input, { flex: 1 }]} placeholder={DEFAULT_QUIET_END} placeholderTextColor={C.textMuted} value={quietEnd} onChangeText={setQuietEnd} autoCapitalize="none" keyboardType="numbers-and-punctuation" />
                  </View>
                  <Text style={styles.notifHint}>
                    {parseHhMm(quietStart) === null || parseHhMm(quietEnd) === null
                      ? 'Use 24-hour times like 22:00 and 07:00 — anything else is ignored and nothing is silenced.'
                      : 'Reminders due in this window are not sent at all, rather than held until it ends. Doses still count as missed in your log.'}
                  </Text>
                </>
              ) : null}
            </Expand>
            <Row icon="download-outline"            label={t('exportData')} onPress={() => Alert.alert(t('setExportTitle'), t('setExportBody'))} />
            <Row icon="chatbox-ellipses-outline"    label={t('sendFeedback')}  onPress={() => navigation.navigate('Feedback')} />
            {/* Opens the community page in the system browser. Nothing is
                collected in-app and nothing in the app unlocks from this —
                Apple 3.2.2(iv) and 3.2.1(vii). Do not add a supporter tier. */}
            <Row
              icon="open-outline"
              label={t('supportThisApp')}
              sub={t('supportSub')}
              onPress={() => {
                if (!/^https?:\/\//.test(SUPPORT_URL)) {
                  Alert.alert(t('setNotSetUp'), t('setNotSetUpSub'));
                  return;
                }
                Linking.openURL(SUPPORT_URL).catch(() =>
                  Alert.alert(t('setCouldNotOpen'), t('setCouldNotOpenSub')));
              }}
            />
            <Row icon="information-circle-outline"  label={t('aboutRow')}          onPress={() => navigation.navigate('About')} />
            <Row
              icon="person-circle-outline" label={t('accountSettings')} sub={t('accountSettingsSub')}
              onPress={() => navigation.navigate('AccountSettings')} last
            />
          </Group>

          {/* ── Advanced ──────────────────────────────────────────────────
              MRI camera auto-fill needs a vision-capable API key (see
              MriScreen's callVisionApi). The key lives in SecureStore, not
              AsyncStorage, alongside the patient_jwt in api/syncClient.ts. */}
          <Group label={t('advancedGroup')}>
            <Row
              icon="hardware-chip-outline" label={t('aiWorkspace')} sub={t('aiWorkspaceSub')}
              onPress={() => toggleSection('ai')} last
            />
            <Expand open={expandedSection === 'ai'}>
              <Text style={styles.inputLabel}>{t('aiProviderLabel')}</Text>
              <View style={styles.segment}>
                {(['groq', 'openai', 'anthropic'] as const).map((p) => (
                  <Pressable
                    key={p}
                    style={[styles.segmentBtn, aiProvider === p && styles.segmentBtnActive]}
                    onPress={() => setAiProvider(p)}
                    accessibilityLabel={`Use ${p}`} accessibilityRole="button"
                  >
                    <Text style={[styles.segmentText, aiProvider === p && styles.segmentTextActive]}>
                      {p === 'openai' ? 'OpenAI' : p === 'groq' ? 'Groq' : 'Anthropic'}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Text style={styles.inputLabel}>{t('aiApiKeyLabel')}</Text>
              <TextInput
                style={styles.input} placeholder="sk-..." placeholderTextColor={C.textMuted}
                value={aiApiKey} onChangeText={setAiApiKey}
                autoCapitalize="none" autoCorrect={false} secureTextEntry
              />
            </Expand>
          </Group>

          {/* ── Developer ─────────────────────────────────────────────────
              __DEV__ only: never rendered in a release build. Backfills a
              plausible 60-day history against the schedule rules already on
              this device, so charts, streaks and history have something real
              to draw without tapping it all in by hand. */}
          {__DEV__ && (
            <>
              <Text style={styles.groupLabel}>DEVELOPER</Text>
              <View style={styles.group}>
                <Row
                  icon="flask-outline"
                  label="Load 60-day demo history"
                  sub="Uses your own supplements · leaves today alone"
                  onPress={() => {
                    Alert.alert(
                      'Load 60 days of history?',
                      'Writes dose, water, sun, journal, lab and MRI history for the 60 days before today, following the supplements set up on this device. If none are set up, a starter protocol is created first — placeholder amounts you can edit in Manage supplements. Today is left alone.',
                      [
                        { text: 'Cancel', style: 'cancel' },
                        {
                          text: 'Keep existing days',
                          onPress: () => {
                            seedSimulatedHistory(60, 'append')
                              .then((r) => Alert.alert('Done', `${r.days} days written (${r.skippedExistingDays} already had data and were left alone).\n${r.dosesTaken}/${r.doseRows} doses taken, ${r.journalRows} journal entries, ${r.labRows} lab panels, ${r.mriRows} MRI scans.${r.stagedSupplements.length ? `\n\nStarter protocol created (edit in Manage supplements):\n· ${r.stagedSupplements.join('\n· ')}` : ''}`))
                              .catch((e) => Alert.alert('Could not load history', e?.message ?? 'Please try again.'));
                          },
                        },
                        {
                          text: 'Replace those days',
                          style: 'destructive',
                          onPress: () => {
                            seedSimulatedHistory(60, 'replace')
                              .then((r) => Alert.alert('Done', `${r.days} days written.\n${r.dosesTaken}/${r.doseRows} doses taken, ${r.journalRows} journal entries, ${r.labRows} lab panels, ${r.mriRows} MRI scans.${r.stagedSupplements.length ? `\n\nStarter protocol created (edit in Manage supplements):\n· ${r.stagedSupplements.join('\n· ')}` : ''}`))
                              .catch((e) => Alert.alert('Could not load history', e?.message ?? 'Please try again.'));
                          },
                        },
                      ],
                    );
                  }}
                />
                <Row
                  icon="trash-outline"
                  label="Clear the last 60 days"
                  sub="Removes history before today, keeps your protocol"
                  onPress={() => {
                    Alert.alert('Clear 60 days of history?', 'Removes every tracked day before today. Your profile, supplements and schedule stay.', [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Clear',
                        style: 'destructive',
                        onPress: () => {
                          clearSeededHistory(60)
                            .then(() => Alert.alert('Cleared', 'The last 60 days of history were removed.'))
                            .catch((e) => Alert.alert('Could not clear', e?.message ?? 'Please try again.'));
                        },
                      },
                    ]);
                  }}
                  last
                />
              </View>
            </>
          )}

          <Text style={styles.disclaimer}>{MEDICAL_DISCLAIMER}</Text>

          <Text style={styles.version}>{t('setVersionLine', { version: '1.0.0', year: 2026 })}</Text>

        </ScrollView>

        {/* ── Save Footer ──────────────────────────────────────────────────── */}
        {/* Only while there is something to save, plus the in-flight and the
            2s "Saved ✓" states so the confirmation is not cut off. */}
        {(isDirty || saving || saved) && (
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
        )}

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
  heroCard: {
    backgroundColor: '#fff',
    borderRadius: radius.xl,
    overflow: 'hidden',
    marginBottom: space.xl,
    ...shadow.medium,
  },
  hero: {
    flexDirection: 'row', alignItems: 'center',
    padding: space.lg,
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


  // Notifications
  notifRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10 },
  notifLabel: { ...T.body, color: C.text, flex: 1 },
  notifHint: { color: C.textMuted, fontSize: 12, lineHeight: 17, marginTop: 4, marginBottom: 4 },
  quietRow:  { flexDirection: 'row', gap: space.md, alignItems: 'center' },
  quietSep:  { ...T.body, color: C.textSub },

  disclaimer: {
    color: C.textMuted, fontSize: 12, lineHeight: 18,
    paddingHorizontal: space.md, marginTop: space.lg, marginBottom: space.md,
  },

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
