import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
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
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getProfile, updateProfile, getSupplementsWithRules,
  getMiscFlag, setMiscFlag, getWeatherEnabled, setWeatherEnabled,
} from '../db/queries';
import { medicalDisclaimer } from '../config/links';
import Pressable from '../components/Pressable';
import SunMascot from '../components/SunMascot';
import { t, setLanguage, getLanguage, useLanguage } from '../i18n';
import ShareSheet from '../share/ShareSheet';
import { C, space, radius, shadow, text as T, themed, useTheme, setThemeMode, THEME_MODES } from '../theme';
import { tap as hTap, press as hPress, select as hSelect, success as hSuccess } from '../utils/haptics';
import { seedSimulatedHistory, clearSeededHistory } from '../db/devSeed';
import { QUIET_ENABLED_FLAG, DEFAULT_QUIET_START, DEFAULT_QUIET_END, parseHhMm } from '../notifications/quietHours';
import { fireTestReminder, describeReminderChannel } from '../notifications';
import { playReminderTone } from '../sound/reminderTone';
import { useAppUpdate, type UpdateState } from '../hooks/useAppUpdate';


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

// The update row is one Row in six states, so the copy and the icon are resolved
// in one place rather than as nested ternaries in the middle of the tree.
const updateRowContent = (state: UpdateState, lastChecked: Date | null) => {
  switch (state) {
    case 'unsupported':
      return { icon: 'cloud-offline-outline', label: t('setUpdateOff'), sub: t('setUpdateOffSub') };
    case 'checking':
      return { icon: 'cloud-download-outline', label: t('setUpdateChecking'), sub: undefined };
    case 'downloading':
      return { icon: 'cloud-download-outline', label: t('setUpdateDownloading'), sub: undefined };
    case 'ready':
      return { icon: 'refresh-outline', label: t('setUpdateReady'), sub: t('setUpdateReadySub') };
    case 'current':
      return {
        icon: 'checkmark-circle-outline',
        label: t('setUpdateCurrent'),
        sub: lastChecked
          ? t('setUpdateCurrentSub', {
              time: lastChecked.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            })
          : undefined,
      };
    case 'error':
      return { icon: 'alert-circle-outline', label: t('setUpdateError'), sub: t('setUpdateErrorSub') };
    default:
      return { icon: 'cloud-download-outline', label: t('setUpdateCheck'), sub: t('setUpdateIdleSub') };
  }
};


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


const NOTIF_TOPICS = ['supplements', 'water', 'exercise', 'morning_checkin', 'weekly_summary'];

/** The fields handleSave writes. Compared against live state to decide whether
 *  there is anything to save. */
type SavedFields = {
  name: string;
  notifPrefs: Record<string, boolean>;
  quietOn: boolean;
  quietStart: string;
  quietEnd: string;
};

/** One string key per tier, so the row's subtitle and its buttons agree. */
const THEME_LABEL = { light: 'themeLight', dim: 'themeDim', dark: 'themeDark' } as const;

export default function SettingsScreen() {
  useLanguage(); // re-render this screen when the language changes
  const themeMode = useTheme(); // the tier, and a re-render when it changes
  const [shareOpen, setShareOpen] = useState(false);
  const update = useAppUpdate();
  const updateRow = updateRowContent(update.state, update.lastChecked);
  const [name, setName] = useState('');
  // Display only: the daily D3 dose is edited in SupplementEditor.
  const [d3, setD3] = useState<D3Display>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [currentLanguage, setCurrentLanguage] = useState('en');

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
        notifPrefs, quietOn, quietStart, quietEnd,
      });
      setSaved(true);
      hSuccess();
      setTimeout(() => setSaved(false), 2000);
    } catch {
      Alert.alert(t('saveFailed'), t('saveFailedSub'));
    } finally {
      setSaving(false);
    }
  }, [name, notifPrefs, quietOn, quietStart, quietEnd]);

  const isDirty = useMemo(() => {
    if (!baseline) return false;
    return (
      name !== baseline.name ||
      quietOn !== baseline.quietOn ||
      quietStart !== baseline.quietStart ||
      quietEnd !== baseline.quietEnd ||
      NOTIF_TOPICS.some((k) => (notifPrefs[k] ?? true) !== (baseline.notifPrefs[k] ?? true))
    );
  }, [
    baseline, name,
    quietOn, quietStart, quietEnd, notifPrefs,
  ]);

  const handleLanguageSwitch = async (lang: string) => {
    await setLanguage(lang);
    setCurrentLanguage(lang);
  };

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
                  <SunMascot size={40} />
                </View>
                <View style={styles.heroInfo}>
                  <Text style={styles.heroName}>{name || t('setAddYourName')}</Text>
                  <Text style={styles.heroSub}>
                    {d3 ? t('setD3Daily', { dose: d3.dose, unit: d3.unit }) : t('setNoProtocol')}
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
              <TextInput style={styles.input} placeholder={t('setNamePlaceholder')} placeholderTextColor={C.textMuted} value={name} onChangeText={setName} autoCapitalize="words" />
              <Text style={styles.inputLabel}>{t('language')}</Text>
              <View style={styles.segment}>
                {['en', 'de'].map((lang) => (
                  <Pressable
                    key={lang}
                    style={[styles.segmentBtn, currentLanguage === lang && styles.segmentBtnActive]}
                    onPress={() => handleLanguageSwitch(lang)}
                    accessibilityLabel={t('setSwitchLanguageA11y', { language: t(lang === 'de' ? 'langGerman' : 'langEnglish') })} accessibilityRole="button"
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
              header deleted, to be its own app; FamilySync followed on
              2026-09-17, the last direct `shareAsync` outside src/share.
              ScheduleScreen and CoachingStyle still exist with no entry
              point. */}

          {/* ── App ──────────────────────────────────────────────────────
              Unlabelled: with Protocol gone this is the first group on the
              screen, and a caps heading over the only list reads as a section
              of something larger than it is. */}
          <Group>
            {/* Appearance sits above Notifications because it is the first
                thing a light-sensitive patient goes looking for, and because
                dim — not dark — is the tier most of them settle on. */}
            <Row icon="contrast-outline" label={t('appearance')} sub={t(THEME_LABEL[themeMode])} onPress={() => toggleSection('theme')} />
            <Expand open={expandedSection === 'theme'}>
              <View style={styles.segment}>
                {THEME_MODES.map((tier) => (
                  <Pressable
                    key={tier}
                    style={[styles.segmentBtn, themeMode === tier && styles.segmentBtnActive]}
                    onPress={() => setThemeMode(tier)}
                    accessibilityLabel={t('setSwitchThemeA11y', { theme: t(THEME_LABEL[tier]) })}
                    accessibilityRole="button"
                  >
                    <Text style={[styles.segmentText, themeMode === tier && styles.segmentTextActive]}>{t(THEME_LABEL[tier])}</Text>
                  </Pressable>
                ))}
              </View>
              <Text style={styles.themeHint}>{t('themeHint')}</Text>
            </Expand>
            <Row icon="notifications-outline"     label={t('notifications')} sub={t('notificationsSub')} onPress={() => toggleSection('notif')} />
            <Expand open={expandedSection === 'notif'}>
              {[
                { key: 'supplements',    labelKey: 'setNotifSupplements' },
                { key: 'water',          labelKey: 'water' },
                { key: 'exercise',       labelKey: 'exercise' },
                { key: 'morning_checkin',labelKey: 'setNotifMorning' },
                { key: 'weekly_summary', labelKey: 'setNotifWeekly' },
              ].map((item) => (
                <View key={item.key} style={styles.notifRow}>
                  <Text style={styles.notifLabel}>{t(item.labelKey)}</Text>
                  <Switch
                    value={notifPrefs[item.key]}
                    onValueChange={(v) => { hSelect(); setNotifPrefs((prev) => ({ ...prev, [item.key]: v })); }}
                    trackColor={{ false: C.sunken, true: C.primary }} thumbColor={C.surface}
                  />
                </View>
              ))}
              <View style={styles.notifRow}>
                <Text style={styles.notifLabel}>{t('setWeatherCard')}</Text>
                <Switch
                  value={weatherOn}
                  onValueChange={async (v) => { hSelect(); setWeatherOn(v); await setWeatherEnabled(v); }}
                  trackColor={{ false: C.sunken, true: C.primary }} thumbColor={C.surface}
                  accessibilityLabel={t('setWeatherA11y')}
                />
              </View>
              <Text style={styles.notifHint}>
                On by default. It sends your approximate location — rounded to about 11 km, not
                your address — to open-meteo.com to get the UV window. Turn it off and nothing
                is sent.
              </Text>

              {/* Hear one before it matters.
                  Reminders were firing silently on Android because the channels
                  carried no sound; this fires a real one through the real
                  channel so the fix can be checked in five seconds instead of at
                  the next scheduled dose. */}
              <Pressable
                style={[styles.notifRow, { marginTop: space.md }]}
                onPress={async () => {
                  hPress();
                  try {
                    await fireTestReminder(10);
                    // The channel's own settings go in the dialog: if the
                    // reminder lands silently, this says whether the phone was
                    // ever told to make a sound, which is the difference
                    // between an app bug and a device setting.
                    // Play the app's own tone straight away as well. On a
                    // device where the OS swallows notification sound this is
                    // the only half the user will hear, and it is the half that
                    // now fires when a dose comes due.
                    await playReminderTone({ force: true });
                    const diag = await describeReminderChannel();
                    Alert.alert(t('setTestSoundTitle'), `${t('setTestSoundSent')}\n\n${diag}`);
                  } catch {
                    Alert.alert(t('setTestSoundTitle'), t('setTestSoundFailed'));
                  }
                }}
                accessibilityRole="button"
                accessibilityLabel={t('setTestSound')}
              >
                <Text style={styles.notifLabel}>{t('setTestSound')}</Text>
                <Ionicons name="volume-high-outline" size={20} color={C.primary} />
              </Pressable>
              <Text style={styles.notifHint}>{t('setTestSoundHint')}</Text>

              <View style={[styles.notifRow, { marginTop: space.md }]}>
                <Text style={styles.notifLabel}>{t('quietHours')}</Text>
                <Switch
                  value={quietOn}
                  onValueChange={(v) => { hSelect(); setQuietOn(v); }}
                  trackColor={{ false: C.sunken, true: C.primary }} thumbColor={C.surface}
                  accessibilityLabel={t('setQuietA11y')}
                />
              </View>
              {quietOn ? (
                <>
                  <View style={styles.quietRow}>
                    <TextInput style={[styles.input, { flex: 1 }]} placeholder={DEFAULT_QUIET_START} placeholderTextColor={C.textMuted} value={quietStart} onChangeText={setQuietStart} autoCapitalize="none" keyboardType="numbers-and-punctuation" />
                    <Text style={styles.quietSep}>{t('toJoiner')}</Text>
                    <TextInput style={[styles.input, { flex: 1 }]} placeholder={DEFAULT_QUIET_END} placeholderTextColor={C.textMuted} value={quietEnd} onChangeText={setQuietEnd} autoCapitalize="none" keyboardType="numbers-and-punctuation" />
                  </View>
                  <Text style={styles.notifHint}>
                    {parseHhMm(quietStart) === null || parseHhMm(quietEnd) === null
                      ? t('setQuietHintBad')
                      : t('setQuietHintGood')}
                  </Text>
                </>
              ) : null}
            </Expand>
            <Row
              icon="person-circle-outline" label={t('accountSettings')} sub={t('accountSettingsSub')}
              onPress={() => navigation.navigate('AccountSettings')}
            />
            {/* Was an alert reading "Data export feature to be implemented"
                while `exportAllData()` sat in queries.ts with no caller. It
                opens the share sheet now, preset to everything as a JSON
                backup — the same sheet the two History buttons open, so a
                backup and a doctor's PDF are one mechanism with two presets. */}
            <Row
              icon="download-outline"
              label={t('exportData')}
              sub={t('setExportSub')}
              onPress={() => setShareOpen(true)}
            />
            <Row icon="chatbox-ellipses-outline"    label={t('sendFeedback')}  onPress={() => navigation.navigate('Feedback')} />
            <Row icon="information-circle-outline"  label={t('aboutRow')}          onPress={() => navigation.navigate('About')} last />
          </Group>


          {/* ── Developer ─────────────────────────────────────────────────
              __DEV__ only: never rendered in a release build. Backfills a
              plausible 60-day history against the schedule rules already on
              this device, so charts, streaks and history have something real
              to draw without tapping it all in by hand. */}
          {__DEV__ && (
            <>
              {/* Developer tools, behind __DEV__ — they never render in a
                  release build, so their strings stay English rather than
                  carrying 20 keys into the shipped dictionary. */}
              <Text style={styles.groupLabel}>DEVELOPER</Text>
              <View style={styles.group}>
                <Row
                  icon="flask-outline"
                  label={t('setLoadDemo')}
                  sub="Uses your own supplements · leaves today alone"
                  onPress={() => {
                    Alert.alert(
                      'Load 60 days of history?',
                      'Writes dose, water, sun and journal history for the 60 days before today, following the supplements set up on this device. If none are set up, a starter protocol is created first — placeholder amounts you can edit in Manage supplements. Today is left alone.',
                      [
                        { text: 'Cancel', style: 'cancel' },
                        {
                          text: 'Keep existing days',
                          onPress: () => {
                            seedSimulatedHistory(60, 'append')
                              .then((r) => Alert.alert('Done', `${r.days} days written (${r.skippedExistingDays} already had data and were left alone).\n${r.dosesTaken}/${r.doseRows} doses taken, ${r.journalRows} journal entries.${r.stagedSupplements.length ? `\n\nStarter protocol created (edit in Manage supplements):\n· ${r.stagedSupplements.join('\n· ')}` : ''}`))
                              .catch((e) => Alert.alert('Could not load history', e?.message ?? 'Please try again.'));
                          },
                        },
                        {
                          text: 'Replace those days',
                          style: 'destructive',
                          onPress: () => {
                            seedSimulatedHistory(60, 'replace')
                              .then((r) => Alert.alert('Done', `${r.days} days written.\n${r.dosesTaken}/${r.doseRows} doses taken, ${r.journalRows} journal entries.${r.stagedSupplements.length ? `\n\nStarter protocol created (edit in Manage supplements):\n· ${r.stagedSupplements.join('\n· ')}` : ''}`))
                              .catch((e) => Alert.alert('Could not load history', e?.message ?? 'Please try again.'));
                          },
                        },
                      ],
                    );
                  }}
                />
                <Row
                  icon="trash-outline"
                  label={t('setClearDemo')}
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

          {/* Over-the-air updates. Deliberately the last actionable row: it is
              maintenance, not something a patient needs mid-protocol. */}
          <Group>
            <Row
              icon={updateRow.icon}
              label={updateRow.label}
              sub={updateRow.sub}
              dim={update.state === 'unsupported'}
              onPress={
                update.state === 'unsupported' || update.state === 'checking' || update.state === 'downloading'
                  ? undefined
                  : () => {
                      hPress();
                      if (update.state === 'ready') update.restart();
                      else update.check();
                    }
              }
              right={
                update.state === 'checking' || update.state === 'downloading'
                  ? <ActivityIndicator size="small" color={C.textMuted} />
                  : undefined
              }
              last
            />
          </Group>

          <Text style={styles.disclaimer}>{medicalDisclaimer()}</Text>

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
              accessibilityLabel={saving ? t('saving') : t('setSaveChanges')} accessibilityRole="button"
            >
              <Text style={styles.saveBtnText}>{saving ? t('saving') : saved ? `${t('saved')} ✓` : t('save')}</Text>
            </Pressable>
          </View>
        )}

        <ShareSheet
          visible={shareOpen}
          onClose={() => setShareOpen(false)}
          initialPreset="all"
          initialFormat="json"
        />

      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = themed((C) => StyleSheet.create({
  container:    { flex: 1, backgroundColor: C.bg },
  flex:         { flex: 1 },
  scrollView:   { flex: 1 },
  scrollContent:{ paddingHorizontal: space.lg, paddingTop: space.xxxl, paddingBottom: space.xl },

  title: { ...T.display, color: C.text, marginBottom: space.lg },

  // Hero
  heroCard: {
    backgroundColor: C.surface,
    borderRadius: radius.xl,
    overflow: 'hidden',
    marginBottom: space.xl,
    // The shadow alone separated this card, which works on the light ground
    // and disappears at 6% opacity on dim and dark. The edge is what every
    // other screen draws, and it holds in all three tiers.
    borderWidth: 1,
    borderColor: C.border,
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
  heroInfo:   { flex: 1 },
  heroName:   { ...T.subheading, color: C.text },
  heroSub:    { ...T.small, color: C.textSub, marginTop: 2 },
  statusDot:  { width: 8, height: 8, borderRadius: radius.pill, backgroundColor: C.success },

  // Groups (iOS-style)
  groupWrap:  { marginBottom: space.xl },
  groupLabel: { ...T.caps, color: C.textSub, marginBottom: space.sm, marginLeft: space.sm },
  group: {
    backgroundColor: C.surface,
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: C.border,
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
  badgeText: { color: C.onPrimary, fontSize: 12, fontWeight: '800' },

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
  themeHint: { ...T.caption, color: C.textMuted, marginTop: space.sm },
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
  saveBtnText: { ...T.bodyLg, color: C.onPrimary, fontWeight: '800' },
}));
