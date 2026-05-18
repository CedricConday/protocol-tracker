import { Ionicons } from '@expo/vector-icons';
import { Switch } from 'react-native';
import { useCallback, useEffect, useState } from 'react';
import { useAppReset } from '../context/AppResetContext';
import {
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Alert,
  ScrollView,
} from 'react-native';
import * as Sharing from 'expo-sharing';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getProfile, updateProfile, getScheduleRules, updateRuleDose,
  updateRuleTolerance, getDoctor, updateDoctor, getLastBloodTestDate,
  setLastBloodTestDate, getAllSupplements, updateSupplementStock,
  getSupplementForms, updateSupplementForm,
} from '../db/queries';
import { getDb } from '../db/schema';
import { useSimpleMode } from '../context/SimpleModeContext';
import ProFeatureGate from '../components/ProFeatureGate';
import { t, setLanguage, getLanguage } from '../i18n';

type ToleranceRule = { id: number; supplement_name: string; tolerance_window: number };
type Supplement = { id: string; name: string; stock_days: number | null };

export default function SettingsScreen() {
  const [name, setName] = useState('');
  const [weight, setWeight] = useState('');
  const [d3Dose, setD3Dose] = useState('');
  const [d3RuleId, setD3RuleId] = useState<number | null>(null);
  const [bedtimeHour, setBedtimeHour] = useState(22);
  const [bedtimeMinute, setBedtimeMinute] = useState(0);
  const [doctorName, setDoctorName] = useState('');
  const [doctorClinic, setDoctorClinic] = useState('');
  const [doctorEmail, setDoctorEmail] = useState('');
  const [doctorPhone, setDoctorPhone] = useState('');
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
  const [lastSurveyDate, setLastSurveyDate] = useState<string | null>(null);
  const [nudgeFocus, setNudgeFocus] = useState<string>('all');
  const [suppForms, setSuppForms] = useState<{ id: string; name: string; form: string }[]>([]);
  const [patientType, setPatientTypeState] = useState<string>('new');
  const [infoShareApproved, setInfoShareApproved] = useState(false);
  const [expandedSection, setExpandedSection] = useState<string | null>(null);

  const toggleSection = (key: string | null) => setExpandedSection((prev) => (!key || prev === key ? null : key));

  const navigation = useNavigation<any>();
  const { isSimple, toggleSimple } = useSimpleMode();
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
      if (d3) {
        setD3RuleId(d3.id);
        setD3Dose(d3.dose_amount);
      }

      const doctor = await getDoctor();
      if (doctor) {
        setDoctorName(doctor.name ?? '');
        setDoctorClinic(doctor.clinic ?? '');
        setDoctorEmail(doctor.email ?? '');
        setDoctorPhone(doctor.phone ?? '');
      }

      const db = await getDb();
      const toleranceRulesData = await db.getAllAsync(`
        SELECT sr.id, s.name as supplement_name, sr.tolerance_window
        FROM schedule_rules sr
        JOIN supplements s ON sr.supplement_id = s.id
        ORDER BY sr.display_order ASC
      `) as ToleranceRule[];
      setToleranceRules(toleranceRulesData);

      const valuesMap = new Map<number, number>();
      toleranceRulesData.forEach((rule: ToleranceRule) => {
        valuesMap.set(rule.id, rule.tolerance_window);
      });

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

      const surveyDate = await AsyncStorage.getItem('last_care_survey_date');
      setLastSurveyDate(surveyDate);
      const nudge = await AsyncStorage.getItem('nudge_focus');
      if (nudge) setNudgeFocus(nudge);
      const forms = await getSupplementForms();
      setSuppForms(forms);
      const pt = await AsyncStorage.getItem('patient_type');
      if (pt) setPatientTypeState(pt);
      const share = await AsyncStorage.getItem('info_share_approved');
      setInfoShareApproved(share === '1');
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

      await updateDoctor({
        name: doctorName.trim(),
        clinic: doctorClinic.trim(),
        email: doctorEmail.trim(),
        phone: doctorPhone.trim(),
      });

      if (bloodTestDate.trim()) {
        await setLastBloodTestDate(bloodTestDate.trim());
      }

      for (const [id, val] of stockChanges) {
        const num = parseInt(val, 10);
        await updateSupplementStock(id, isNaN(num) ? null : num);
      }
      setStockChanges(new Map());

      await AsyncStorage.setItem('ai_provider', aiProvider);
      await AsyncStorage.setItem('ai_api_key', aiApiKey);

      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }, [name, weight, d3Dose, d3RuleId, bedtimeHour, bedtimeMinute, toleranceChanges, doctorName, doctorClinic, doctorEmail, doctorPhone, bloodTestDate, stockChanges, aiProvider, aiApiKey]);

  const handleResetAll = () => {
    Alert.alert(
      'Reset All Data',
      'This will permanently delete all dose logs, water logs, journal entries, sun logs, exercise logs, and meal logs. Your supplement schedule and profile will be kept.\n\nThis cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            const db = await getDb();
            await db.execAsync(`
              DELETE FROM dose_logs;
              DELETE FROM water_logs;
              DELETE FROM daily_anchors;
              DELETE FROM exercise_logs;
              DELETE FROM journal_entries;
              DELETE FROM sun_log;
              DELETE FROM meal_log;
              DELETE FROM relapse_events;
              DELETE FROM care_surveys;
            `);
            await AsyncStorage.multiRemove([
              'fatigue_alert_shown',
              'last_care_survey_date',
              'auto_report_last_week',
              'review_prompted',
            ]);
            Alert.alert('Reset Complete', 'All tracking data has been cleared.');
          },
        },
      ],
    );
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'This will erase everything — your profile, schedule, and all logs. The app will restart and ask you to set up again.\n\nThis cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Everything',
          style: 'destructive',
          onPress: async () => {
            const db = await getDb();
            await db.execAsync(`
              DELETE FROM user_profile;
              DELETE FROM supplements;
              DELETE FROM schedule_rules;
              DELETE FROM supplement_conflicts;
              DELETE FROM daily_anchors;
              DELETE FROM dose_logs;
              DELETE FROM water_logs;
              DELETE FROM exercise_logs;
              DELETE FROM journal_entries;
              DELETE FROM relapse_events;
              DELETE FROM sun_log;
              DELETE FROM meal_log;
              DELETE FROM care_surveys;
              DELETE FROM blood_test_reminders;
              DELETE FROM lab_results;
              DELETE FROM mri_scans;
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
      const nextMap = new Map(prev);
      nextMap.set(ruleId, next);
      return nextMap;
    });
  };

  const getToleranceValue = (ruleId: number): number => {
    if (toleranceChanges.has(ruleId)) return toleranceChanges.get(ruleId)!;
    const rule = toleranceRules.find((r) => r.id === ruleId);
    return rule?.tolerance_window ?? 30;
  };

  const getStockValue = (id: string): string => {
    if (stockChanges.has(id)) return stockChanges.get(id)!;
    const s = supplements.find(s => s.id === id);
    return s?.stock_days != null ? String(s.stock_days) : '';
  };

  const handleLanguageSwitch = async (lang: string) => {
    await setLanguage(lang);
    setCurrentLanguage(lang);
  };

  const NavRow = ({ icon, label, sub, onPress }: { icon: string; label: string; sub?: string; onPress: () => void }) => (
    <TouchableOpacity style={styles.navRow} onPress={onPress} activeOpacity={0.7}>
      <Ionicons name={icon as any} size={20} color="#C96A50" style={{ marginRight: 12 }} />
      <View style={{ flex: 1 }}>
        <Text style={styles.navRowLabel}>{label}</Text>
        {sub ? <Text style={styles.navRowSub}>{sub}</Text> : null}
      </View>
      <Ionicons name="chevron-forward" size={16} color="#B0A098" />
    </TouchableOpacity>
  );

  const SectionHeader = ({ sectionKey, icon, label, sub }: { sectionKey: string; icon: string; label: string; sub?: string }) => (
    <TouchableOpacity style={styles.navRow} onPress={() => toggleSection(sectionKey)} activeOpacity={0.7}>
      <Ionicons name={icon as any} size={20} color="#C96A50" style={{ marginRight: 12 }} />
      <View style={{ flex: 1 }}>
        <Text style={styles.navRowLabel}>{label}</Text>
        {sub ? <Text style={styles.navRowSub}>{sub}</Text> : null}
      </View>
      <Ionicons name={expandedSection === sectionKey ? 'chevron-down' : 'chevron-forward'} size={16} color="#B0A098" />
    </TouchableOpacity>
  );

  const BEDTIME_HOURS = [18, 19, 20, 21, 22, 23];
  const BEDTIME_MINUTES = [0, 15, 30, 45];

  const BedtimeWheel = () => (
    <View style={{ paddingVertical: 8 }}>
      <Text style={styles.wheelLabel}>Hour</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        {BEDTIME_HOURS.map((h) => (
          <TouchableOpacity
            key={h}
            style={[styles.timeChip, bedtimeHour === h && styles.timeChipActive]}
            onPress={() => setBedtimeHour(h)}
            activeOpacity={0.7}
          >
            <Text style={[styles.timeChipText, bedtimeHour === h && styles.timeChipTextActive]}>
              {String(h).padStart(2, '0')}:00
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={styles.wheelLabel}>Minutes</Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {BEDTIME_MINUTES.map((m) => (
          <TouchableOpacity
            key={m}
            style={[styles.timeChip, bedtimeMinute === m && styles.timeChipActive]}
            onPress={() => setBedtimeMinute(m)}
            activeOpacity={0.7}
          >
            <Text style={[styles.timeChipText, bedtimeMinute === m && styles.timeChipTextActive]}>
              :{String(m).padStart(2, '0')}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={[styles.privacyNotice, { textAlign: 'center', marginTop: 12 }]}>
        Bedtime cutoff: {String(bedtimeHour).padStart(2, '0')}:{String(bedtimeMinute).padStart(2, '0')}
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <Text style={styles.title}>{t('settings')}</Text>
        </View>
        <ScrollView style={styles.form} showsVerticalScrollIndicator={false}>

          {/* ── PRIMARY BUTTONS ─────────────────────────────────────────── */}
          <View style={styles.primaryBtnRow}>
            <TouchableOpacity style={styles.primaryBtn} onPress={() => toggleSection(expandedSection === 'profile' ? null : 'profile')} activeOpacity={0.85}>
              <Ionicons name="person-outline" size={20} color="#FAF7F4" style={{ marginBottom: 4 }} />
              <Text style={styles.primaryBtnText}>Profile</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.primaryBtn} onPress={() => toggleSection(expandedSection === 'protocol' ? null : 'protocol')} activeOpacity={0.85}>
              <Ionicons name="flask-outline" size={20} color="#FAF7F4" style={{ marginBottom: 4 }} />
              <Text style={styles.primaryBtnText}>Supplements</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.primaryBtn} onPress={() => toggleSection(expandedSection === 'bedtime' ? null : 'bedtime')} activeOpacity={0.85}>
              <Ionicons name="moon-outline" size={20} color="#FAF7F4" style={{ marginBottom: 4 }} />
              <Text style={styles.primaryBtnText}>Bedtime</Text>
            </TouchableOpacity>
          </View>

          {/* ── EXPANDED PRIMARY SECTIONS ────────────────────────────────── */}
          {expandedSection === 'profile' && (
            <View style={styles.primaryExpanded}>
              <Text style={styles.inputLabel}>{t('yourName')}</Text>
              <TextInput style={styles.input} placeholder="e.g. Alex" placeholderTextColor="#B0A098" value={name} onChangeText={setName} autoCapitalize="words" />
              <Text style={styles.inputLabel}>{t('weightKg')}</Text>
              <TextInput style={styles.input} placeholder="e.g. 70" placeholderTextColor="#B0A098" value={weight} onChangeText={setWeight} keyboardType="numeric" />
              <Text style={styles.inputLabel}>{t('language')}</Text>
              <View style={[styles.langRow, { marginBottom: 12 }]}>
                {['en', 'de'].map((lang) => (
                  <TouchableOpacity key={lang} style={[styles.langButton, currentLanguage === lang ? styles.langActive : null]} onPress={() => handleLanguageSwitch(lang)} activeOpacity={0.7}>
                    <Text style={[styles.langText, currentLanguage === lang ? styles.langTextActive : null]}>{lang.toUpperCase()}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {expandedSection === 'protocol' && (
            <View style={styles.primaryExpanded}>
              <Text style={styles.inputLabel}>{t('dailyD3')}</Text>
              <TextInput style={[styles.input, { marginBottom: 12 }]} placeholder="e.g. 5000" placeholderTextColor="#B0A098" value={d3Dose} onChangeText={setD3Dose} keyboardType="numeric" />
              {supplements.map((s) => (
                <View key={s.id} style={{ marginBottom: 14 }}>
                  <Text style={styles.toleranceName}>{s.name}</Text>
                  <TextInput style={[styles.input, { marginTop: 4 }]} placeholder="Days on hand (e.g. 30)" placeholderTextColor="#B0A098" value={getStockValue(s.id)} onChangeText={(val) => setStockChanges((prev) => { const m = new Map(prev); m.set(s.id, val); return m; })} keyboardType="numeric" />
                </View>
              ))}
            </View>
          )}

          {expandedSection === 'bedtime' && (
            <View style={styles.primaryExpanded}>
              <BedtimeWheel />
              <Text style={[styles.privacyNotice, { textAlign: 'center', marginTop: 8 }]}>
                Bedtime cutoff: {String(bedtimeHour).padStart(2,'0')}:{String(bedtimeMinute).padStart(2,'0')}
              </Text>
            </View>
          )}

          {/* ── ACCOUNT ─────────────────────────────────────────────────── */}
          <Text style={styles.sectionTitle}>Account</Text>
          <View style={styles.sectionCard}>
            <SectionHeader sectionKey="profile" icon="person-outline" label="Profile" sub={name || 'Name, weight, language'} />
            {expandedSection === 'profile' && (
              <View style={styles.expandedContent}>
                <Text style={styles.inputLabel}>{t('yourName')}</Text>
                <TextInput style={styles.input} placeholder="e.g. Alex" placeholderTextColor="#B0A098" value={name} onChangeText={setName} autoCapitalize="words" />
                <Text style={styles.inputLabel}>{t('weightKg')}</Text>
                <TextInput style={styles.input} placeholder="e.g. 70" placeholderTextColor="#B0A098" value={weight} onChangeText={setWeight} keyboardType="numeric" />
                <Text style={styles.inputLabel}>{t('language')}</Text>
                <View style={[styles.langRow, { marginBottom: 12 }]}>
                  {['en', 'de'].map((lang) => (
                    <TouchableOpacity key={lang} style={[styles.langButton, currentLanguage === lang ? styles.langActive : null]} onPress={() => handleLanguageSwitch(lang)} activeOpacity={0.7}>
                      <Text style={[styles.langText, currentLanguage === lang ? styles.langTextActive : null]}>{lang.toUpperCase()}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}
          </View>

          {/* ── SUPPLEMENTS ─────────────────────────────────────────────── */}
          <Text style={styles.sectionTitle}>Supplements</Text>
          <View style={styles.sectionCard}>
            <SectionHeader sectionKey="protocol" icon="flask-outline" label="Protocol Doses" sub={d3Dose ? `D3: ${d3Dose} IU` : 'Daily D3 dose'} />
            {expandedSection === 'protocol' && (
              <View style={styles.expandedContent}>
                <Text style={styles.inputLabel}>{t('dailyD3')}</Text>
                <TextInput style={[styles.input, { marginBottom: 12 }]} placeholder="e.g. 5000" placeholderTextColor="#B0A098" value={d3Dose} onChangeText={setD3Dose} keyboardType="numeric" />
              </View>
            )}
            <View style={styles.rowDivider} />
            <NavRow icon="list-outline" label="Manage Supplements" sub="Add, edit, or remove" onPress={() => navigation.navigate('SupplementEditor')} />
            <View style={styles.rowDivider} />
            <SectionHeader sectionKey="stock" icon="cube-outline" label="Supplement Stock" sub="Days on hand per supplement" />
            {expandedSection === 'stock' && (
              <View style={styles.expandedContent}>
                {supplements.map((s) => (
                  <View key={s.id} style={{ marginBottom: 14 }}>
                    <Text style={styles.toleranceName}>{s.name}</Text>
                    <TextInput style={[styles.input, { marginTop: 4 }]} placeholder="Days on hand (e.g. 30)" placeholderTextColor="#444444" value={getStockValue(s.id)} onChangeText={(val) => setStockChanges((prev) => { const m = new Map(prev); m.set(s.id, val); return m; })} keyboardType="numeric" />
                  </View>
                ))}
                {suppForms.map((s, idx) => (
                  <View key={s.id} style={[styles.stockRow, idx === suppForms.length - 1 ? { borderBottomWidth: 0 } : null]}>
                    <Text style={styles.stockName}>{s.name}</Text>
                    <View style={styles.formRow}>
                      {(['capsule', 'tablet', 'powder', 'liquid'] as const).map((f) => (
                        <TouchableOpacity key={f} style={[styles.formBtn, s.form === f ? styles.formBtnActive : null]} onPress={async () => { await updateSupplementForm(s.id, f); setSuppForms((prev) => prev.map((x) => x.id === s.id ? { ...x, form: f } : x)); }} activeOpacity={0.7}>
                          <Text style={[styles.formBtnText, s.form === f ? styles.formBtnTextActive : null]}>{f.charAt(0).toUpperCase()}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* ── SCHEDULE ─────────────────────────────────────────────────── */}
          <Text style={styles.sectionTitle}>Schedule</Text>
          <View style={styles.sectionCard}>
            <SectionHeader sectionKey="bedtimeInline" icon="moon-outline" label="Bedtime Schedule" sub={`Cutoff: ${String(bedtimeHour).padStart(2,'0')}:${String(bedtimeMinute).padStart(2,'0')}`} />
            {expandedSection === 'bedtimeInline' && (
              <View style={styles.expandedContent}>
                <BedtimeWheel />
              </View>
            )}
            <View style={styles.rowDivider} />
            <ProFeatureGate featureName="Timing Windows">
              <SectionHeader sectionKey="timing" icon="timer-outline" label="Timing Windows" sub="Per-supplement tolerance" />
              {expandedSection === 'timing' && (
                <View style={styles.expandedContent}>
                  {toleranceRules.map((rule) => {
                    const val = getToleranceValue(rule.id);
                    return (
                      <View key={rule.id} style={[styles.toleranceRow, { borderBottomWidth: 0, marginBottom: 8 }]}>
                        <Text style={styles.toleranceName}>{rule.supplement_name}</Text>
                        <View style={styles.stepper}>
                          <TouchableOpacity style={[styles.stepperBtn, val <= 15 ? styles.stepperBtnDisabled : null]} onPress={() => handleToleranceChange(rule.id, -15)} disabled={val <= 15} activeOpacity={0.6}><Text style={styles.stepperBtnText}>−</Text></TouchableOpacity>
                          <Text style={styles.stepperValue}>{val} min</Text>
                          <TouchableOpacity style={[styles.stepperBtn, val >= 120 ? styles.stepperBtnDisabled : null]} onPress={() => handleToleranceChange(rule.id, 15)} disabled={val >= 120} activeOpacity={0.6}><Text style={styles.stepperBtnText}>+</Text></TouchableOpacity>
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}
            </ProFeatureGate>
          </View>

          {/* ── HEALTH TRACKING ──────────────────────────────────────────── */}
          <Text style={styles.sectionTitle}>Health tracking</Text>
          <View style={styles.sectionCard}>
            <SectionHeader sectionKey="healthChecks" icon="medical-outline" label="Health Checks" sub="Blood test · Care survey" />
            {expandedSection === 'healthChecks' && (
              <View style={styles.expandedContent}>
                <Text style={styles.inputLabel}>Last Blood Test (YYYY-MM-DD)</Text>
                <TextInput style={[styles.input, { marginBottom: 12 }]} placeholder="e.g. 2026-03-15" placeholderTextColor="#B0A098" value={bloodTestDate} onChangeText={setBloodTestDate} autoCapitalize="none" />
                <TouchableOpacity style={styles.subMenuRow} onPress={() => navigation.navigate('Journal', { screen: 'CareSurvey' })} activeOpacity={0.7}>
                  <Text style={styles.subMenuRowText}>Care Coordination Survey</Text>
                  <Text style={styles.subMenuRowSub}>{lastSurveyDate ? `Last: ${lastSurveyDate}` : 'ICES-MS validated'}</Text>
                </TouchableOpacity>
              </View>
            )}
            <View style={styles.rowDivider} />
            <NavRow icon="bar-chart-outline" label="MMAS-8 Adherence Check" sub="Monthly · 8-question scale" onPress={() => navigation.navigate('Mmas')} />
            <View style={styles.rowDivider} />
            <NavRow icon="help-circle-outline" label="Fact or Myth Quiz" sub="Protocol knowledge · 8 questions" onPress={() => navigation.navigate('Quiz')} />
          </View>

          {/* ── DOCTOR ───────────────────────────────────────────────────── */}
          <Text style={styles.sectionTitle}>Your doctor</Text>
          <View style={styles.sectionCard}>
            <SectionHeader sectionKey="doctor" icon="medical-outline" label="Doctor & Clinic" sub={doctorName || 'Not set'} />
            {expandedSection === 'doctor' && (
              <View style={styles.expandedContent}>
                <Text style={styles.inputLabel}>{t('doctorName')}</Text>
                <TextInput style={styles.input} placeholder="e.g. Dr. Smith" placeholderTextColor="#B0A098" value={doctorName} onChangeText={setDoctorName} />
                <Text style={styles.inputLabel}>{t('clinic')}</Text>
                <TextInput style={styles.input} placeholder="e.g. Coimbra Clinic" placeholderTextColor="#B0A098" value={doctorClinic} onChangeText={setDoctorClinic} />
                <Text style={styles.inputLabel}>{t('email')}</Text>
                <TextInput style={styles.input} placeholder="e.g. doctor@clinic.com" placeholderTextColor="#B0A098" value={doctorEmail} onChangeText={setDoctorEmail} keyboardType="email-address" />
                <Text style={styles.inputLabel}>{t('phone')}</Text>
                <TextInput style={[styles.input, { marginBottom: 12 }]} placeholder="e.g. +1 555 123 4567" placeholderTextColor="#B0A098" value={doctorPhone} onChangeText={setDoctorPhone} keyboardType="phone-pad" />
              </View>
            )}
          </View>

          {/* ── NOTIFICATIONS ────────────────────────────────────────────── */}
          <Text style={styles.sectionTitle}>Reminders</Text>
          <View style={styles.sectionCard}>
            <SectionHeader sectionKey="nudge" icon="notifications-outline" label="Reminder Focus" sub={nudgeFocus === 'all' ? 'All reminders' : nudgeFocus.charAt(0).toUpperCase() + nudgeFocus.slice(1) + ' only'} />
            {expandedSection === 'nudge' && (
              <View style={styles.expandedContent}>
                <View style={styles.nudgeRow}>
                  {(['all', 'doses', 'water', 'exercise'] as const).map((opt) => (
                    <TouchableOpacity key={opt} style={[styles.nudgeBtn, nudgeFocus === opt ? styles.nudgeBtnActive : null]} onPress={async () => { setNudgeFocus(opt); await AsyncStorage.setItem('nudge_focus', opt); }} activeOpacity={0.7}>
                      <Text style={[styles.nudgeBtnText, nudgeFocus === opt ? styles.nudgeBtnTextActive : null]}>{opt === 'all' ? 'All' : opt.charAt(0).toUpperCase() + opt.slice(1)}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={[styles.privacyNotice, { marginBottom: 8 }]}>Reminders are local only — no data sent externally.</Text>
              </View>
            )}
            {patientType !== 'caregiver' && (
              <>
                <View style={styles.rowDivider} />
                <View style={[styles.navRow, { paddingVertical: 14 }]}>
                  <Ionicons name="people-outline" size={20} color="#22c55e" style={{ marginRight: 12 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.navRowLabel}>Caregiver Notifications</Text>
                    <Text style={styles.navRowSub}>Allow caregiver alerts for missed doses</Text>
                  </View>
                  <Switch value={infoShareApproved} onValueChange={async (v) => { setInfoShareApproved(v); await AsyncStorage.setItem('info_share_approved', v ? '1' : '0'); }} trackColor={{ false: '#D8CFC8', true: '#C96A50' }} thumbColor="#ffffff" />
                </View>
              </>
            )}
          </View>

          {/* ── ADVANCED ─────────────────────────────────────────────────── */}
          <Text style={styles.sectionTitle}>Advanced</Text>
          <View style={styles.sectionCard}>
            <View style={[styles.navRow, { paddingVertical: 14 }]}>
              <Ionicons name="contrast-outline" size={20} color="#22c55e" style={{ marginRight: 12 }} />
              <Text style={[styles.navRowLabel, { flex: 1 }]}>Simple Mode</Text>
              <Switch value={isSimple} onValueChange={toggleSimple} trackColor={{ false: '#D8CFC8', true: '#C96A50' }} thumbColor={Platform.OS === 'ios' ? '#ffffff' : isSimple ? '#ffffff' : '#f4f3f4'} />
            </View>
            <View style={styles.rowDivider} />
            <SectionHeader sectionKey="ai" icon="sparkles-outline" label="AI Workspace" sub={aiProvider} />
            {expandedSection === 'ai' && (
              <View style={styles.expandedContent}>
                <Text style={styles.inputLabel}>Provider</Text>
                <View style={styles.langRow}>
                  {['groq', 'openai', 'anthropic'].map((p) => (
                    <TouchableOpacity key={p} style={[styles.langButton, aiProvider === p ? styles.langActive : null]} onPress={() => setAiProvider(p)} activeOpacity={0.7}>
                      <Text style={[styles.langText, aiProvider === p ? styles.langTextActive : null]}>{p === 'groq' ? 'Groq' : p === 'openai' ? 'OpenAI' : 'Anthropic'}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={styles.inputLabel}>API Key</Text>
                <TextInput style={[styles.input, { marginBottom: 8 }]} placeholder="Paste your key here" placeholderTextColor="#B0A098" value={aiApiKey} onChangeText={setAiApiKey} secureTextEntry autoCapitalize="none" />
                <Text style={[styles.privacyNotice, { marginBottom: 8 }]}>Questions and your health summary are sent to your chosen provider. Nothing stored externally.</Text>
              </View>
            )}
            <View style={styles.rowDivider} />
            <NavRow icon="shield-checkmark-outline" label="Security & Passkeys" onPress={() => navigation.navigate('Security')} />
            <View style={styles.rowDivider} />
            <NavRow icon="download-outline" label="Export My Data" onPress={() => Alert.alert('Backup', 'Data export feature to be implemented')} />
          </View>

          {/* ── MORE ─────────────────────────────────────────────────────── */}
          <Text style={styles.sectionTitle}>More</Text>
          <View style={styles.sectionCard}>
            <NavRow icon="book-outline" label="Protocol Guide" onPress={() => navigation.navigate('Guide')} />
            <View style={styles.rowDivider} />
            <NavRow icon="people-outline" label="Caregiver View" onPress={() => navigation.navigate('Caregiver')} />
            <View style={styles.rowDivider} />
            <NavRow icon="shield-outline" label="Drug Checker" onPress={() => navigation.navigate('DrugChecker')} />
            <View style={styles.rowDivider} />
            <NavRow icon="terminal" label="Link to Coimbra Terminal" sub="Scan QR on coimbra.app" onPress={() => navigation.navigate('TerminalLink')} />
            <View style={styles.rowDivider} />
            <NavRow icon="chatbubble-outline" label="Send Feedback" onPress={() => navigation.navigate('Feedback')} />
            <View style={styles.rowDivider} />
            <NavRow icon="information-circle-outline" label="About" onPress={() => navigation.navigate('About')} />
          </View>

          {/* ── SUPPORT ──────────────────────────────────────────────────── */}
          <Text style={styles.sectionTitle}>Support</Text>
          <View style={styles.sectionCard}>
            <NavRow icon="help-buoy-outline" label="FAQ" sub="Frequently asked questions" onPress={() => Alert.alert('FAQ', 'Visit coimbra.app/faq for frequently asked questions.')} />
            <View style={styles.rowDivider} />
            <NavRow icon="mail-outline" label="Contact" sub="support@coimbra.app" onPress={() => Alert.alert('Contact', 'Email us at support@coimbra.app')} />
            <View style={styles.rowDivider} />
            <View style={[styles.navRow, { paddingVertical: 14 }]}>
              <Ionicons name="information-circle-outline" size={20} color="#C96A50" style={{ marginRight: 12 }} />
              <View style={{ flex: 1 }}>
                <Text style={styles.navRowLabel}>Version</Text>
                <Text style={styles.navRowSub}>1.0.0</Text>
              </View>
            </View>
          </View>

          {/* ── DANGER ZONE ──────────────────────────────────────────────── */}
          <Text style={[styles.sectionTitle, { color: '#C04040', marginTop: 32 }]}>Danger zone</Text>
          <View style={styles.dangerCard}>
            <View style={styles.dangerRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.dangerTitle}>Reset All Tracking Data</Text>
                <Text style={styles.dangerSub}>Clears logs, journal, water, exercise, meals. Keeps your schedule and profile.</Text>
              </View>
              <TouchableOpacity style={styles.dangerBtn} onPress={handleResetAll} activeOpacity={0.8}>
                <Text style={styles.dangerBtnText}>Reset</Text>
              </TouchableOpacity>
            </View>
            <View style={[styles.dangerRow, { marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: '#2a2a2a' }]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.dangerTitle}>Delete Account</Text>
                <Text style={styles.dangerSub}>Wipes everything — profile, schedule, all logs. Restarts setup from scratch.</Text>
              </View>
              <TouchableOpacity style={[styles.dangerBtn, { borderColor: '#ef4444', backgroundColor: '#1a0a0a' }]} onPress={handleDeleteAccount} activeOpacity={0.8}>
                <Text style={[styles.dangerBtnText, { color: '#ef4444' }]}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* ── VERSION ──────────────────────────────────────────────────── */}
          <Text style={styles.versionText}>Coimbra Protocol App · v1.0.0 · © 2026</Text>

        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity style={[styles.button, saving ? styles.buttonDisabled : null]} onPress={handleSave} disabled={saving}>
            <Text style={styles.buttonText}>{saving ? t('saving') : t('save')}</Text>
          </TouchableOpacity>
          {saved && <Text style={styles.confirmText}>{t('saved')} ✓</Text>}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAF7F4' },
  flex: { flex: 1 },
  header: { alignItems: 'center', paddingTop: 60, paddingBottom: 24 },
  title: { color: '#2C2420', fontSize: 26, fontWeight: '800' },
  form: { flex: 1, paddingHorizontal: 24 },
  sectionTitle: { color: '#7A6A62', fontSize: 13, fontWeight: '600', letterSpacing: 0.2, marginTop: 28, marginBottom: 8, marginLeft: 4 },
  sectionCard: { backgroundColor: '#F2EDE8', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 4, borderWidth: 1, borderColor: '#E8E0D8', shadowColor: '#2C2420', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 },
  primaryBtnRow: { flexDirection: 'row', gap: 10, marginTop: 8, marginBottom: 4 },
  primaryBtn: { flex: 1, backgroundColor: '#C96A50', borderRadius: 12, paddingVertical: 18, alignItems: 'center', justifyContent: 'center' },
  primaryBtnText: { color: '#FAF7F4', fontSize: 13, fontWeight: '700' },
  primaryExpanded: { backgroundColor: '#F2EDE8', borderRadius: 12, padding: 16, marginBottom: 8, borderWidth: 1, borderColor: '#D8CFC8' },
  subMenuRow: { backgroundColor: '#FAF7F4', borderRadius: 8, padding: 12, borderWidth: 1, borderColor: '#D8CFC8', marginBottom: 4 },
  subMenuRowText: { color: '#2C2420', fontSize: 14, fontWeight: '600' },
  subMenuRowSub: { color: '#7A6A62', fontSize: 12, marginTop: 2 },
  wheelLabel: { color: '#7A6A62', fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: 8 },
  timeChip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, backgroundColor: '#E8E0D8', borderWidth: 1, borderColor: '#D8CFC8' },
  timeChipActive: { backgroundColor: '#FBF0ED', borderColor: '#C96A50' },
  timeChipText: { color: '#7A6A62', fontSize: 15, fontWeight: '600' },
  timeChipTextActive: { color: '#C96A50', fontWeight: '700' },
  inputLabel: { color: '#7A6A62', fontSize: 13, fontWeight: '600', marginBottom: 4, marginTop: 14 },
  input: { backgroundColor: 'transparent', borderRadius: 0, paddingHorizontal: 0, paddingVertical: 12, color: '#2C2420', fontSize: 16, borderBottomWidth: 1, borderBottomColor: '#D8CFC8', marginBottom: 2 },
  inputLast: { borderBottomWidth: 0, marginBottom: 10 },
  langRow: { flexDirection: 'row', gap: 10, marginTop: 8, marginBottom: 12 },
  langButton: { flex: 1, borderRadius: 10, borderWidth: 1.5, borderColor: '#D8CFC8', paddingVertical: 12, alignItems: 'center' },
  langActive: { borderColor: '#C96A50', backgroundColor: '#FBF0ED' },
  langText: { color: '#B0A098', fontSize: 14, fontWeight: '700' },
  langTextActive: { color: '#C96A50' },
  stockRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#D8CFC8' },
  stockName: { color: '#7A6A62', fontSize: 13, fontWeight: '600', flex: 1 },
  stockInput: { backgroundColor: '#E8E0D8', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, color: '#2C2420', fontSize: 14, width: 80, textAlign: 'center' },
  toleranceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#D8CFC8' },
  toleranceRowLast: { borderBottomWidth: 0 },
  toleranceName: { color: '#7A6A62', fontSize: 14, fontWeight: '600', flex: 1, marginRight: 12 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepperBtn: { width: 32, height: 32, borderRadius: 8, backgroundColor: '#E8E0D8', alignItems: 'center', justifyContent: 'center' },
  stepperBtnDisabled: { opacity: 0.3 },
  stepperBtnText: { color: '#2C2420', fontSize: 18, fontWeight: '700' },
  stepperValue: { color: '#2C2420', fontSize: 15, fontWeight: '700', minWidth: 50, textAlign: 'center' },
  privacyNotice: { color: '#B0A098', fontSize: 11, fontStyle: 'italic', marginTop: 8, marginBottom: 12, lineHeight: 16 },
  surveyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#F2EDE8', borderRadius: 12, padding: 16, marginTop: 8 },
  surveyRowLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  surveyRowTitle: { color: '#2C2420', fontSize: 14, fontWeight: '600' },
  surveyRowSub: { color: '#7A6A62', fontSize: 12, marginTop: 2 },
  terminalLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#FBF0ED', borderRadius: 12, padding: 16, marginTop: 8, borderWidth: 1, borderColor: '#C96A5030' },
  terminalLinkLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  terminalLinkText: { color: '#C96A50', fontSize: 15, fontWeight: '600' },
  terminalLinkSub: { color: '#B0A098', fontSize: 12 },
  formRow: { flexDirection: 'row', gap: 4 },
  formBtn: { width: 30, height: 30, borderRadius: 6, borderWidth: 1, borderColor: '#D8CFC8', alignItems: 'center', justifyContent: 'center' },
  formBtnActive: { borderColor: '#C96A50', backgroundColor: '#FBF0ED' },
  formBtnText: { color: '#B0A098', fontSize: 11, fontWeight: '700' },
  formBtnTextActive: { color: '#C96A50' },
  nudgeRow: { flexDirection: 'row', gap: 8, marginTop: 8, marginBottom: 8 },
  nudgeBtn: { flex: 1, borderRadius: 8, borderWidth: 1, borderColor: '#D8CFC8', paddingVertical: 10, alignItems: 'center' },
  nudgeBtnActive: { borderColor: '#C96A50', backgroundColor: '#FBF0ED' },
  nudgeBtnText: { color: '#B0A098', fontSize: 12, fontWeight: '600' },
  nudgeBtnTextActive: { color: '#C96A50' },
  dangerCard: { backgroundColor: '#F2EDE8', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, borderWidth: 1, borderColor: '#C0404030' },
  dangerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dangerTitle: { color: '#C04040', fontSize: 14, fontWeight: '700' },
  dangerSub: { color: '#7A6A62', fontSize: 12, marginTop: 2 },
  dangerBtn: { backgroundColor: '#FDF5F5', borderRadius: 8, paddingHorizontal: 16, paddingVertical: 10, borderWidth: 1, borderColor: '#C04040' },
  dangerBtnText: { color: '#C04040', fontSize: 13, fontWeight: '700' },
  aboutLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#F2EDE8', borderRadius: 12, padding: 16, marginTop: 24 },
  aboutLinkText: { color: '#2C2420', fontSize: 15, fontWeight: '600' },
  navRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14 },
  navRowLabel: { color: '#2C2420', fontSize: 15, fontWeight: '600' },
  navRowSub: { color: '#7A6A62', fontSize: 12, marginTop: 2 },
  expandedContent: { paddingTop: 8, paddingBottom: 4 },
  rowDivider: { height: 1, backgroundColor: '#D8CFC8' },
  versionText: { color: '#B0A098', fontSize: 12, textAlign: 'center', marginTop: 24, marginBottom: 40 },
  footer: { paddingHorizontal: 24, paddingVertical: 20, borderTopWidth: 1, borderTopColor: '#D8CFC8', alignItems: 'center' },
  button: { backgroundColor: '#C96A50', borderRadius: 12, paddingVertical: 16, alignItems: 'center', width: '100%' },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: '#FAF7F4', fontSize: 17, fontWeight: '800' },
  confirmText: { color: '#C96A50', fontSize: 14, fontWeight: '700', marginTop: 12 },
});
