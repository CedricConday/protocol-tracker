import { Ionicons } from '@expo/vector-icons';
import { Switch } from 'react-native';
import { useCallback, useEffect, useState } from 'react';
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

  const navigation = useNavigation<any>();
  const { isSimple, toggleSimple } = useSimpleMode();

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

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <Text style={styles.title}>{t('settings')}</Text>
        </View>
        <ScrollView style={styles.form} showsVerticalScrollIndicator={false}>
          {/* PROFILE */}
          <Text style={styles.sectionTitle}>{t('profile')}</Text>
          <View style={styles.sectionCard}>
            <Text style={styles.inputLabel}>{t('yourName')}</Text>
            <TextInput style={styles.input} placeholder="e.g. Alex" placeholderTextColor="#555555" value={name} onChangeText={setName} autoCapitalize="words" />
            <Text style={styles.inputLabel}>{t('weightKg')}</Text>
            <TextInput style={[styles.input, styles.inputLast]} placeholder="e.g. 70" placeholderTextColor="#555555" value={weight} onChangeText={setWeight} keyboardType="numeric" />
            <Text style={styles.inputLabel}>{t('language')}</Text>
            <View style={styles.langRow}>
              {['en', 'de'].map((lang) => (
                <TouchableOpacity key={lang} style={[styles.langButton, currentLanguage === lang ? styles.langActive : null]} onPress={() => handleLanguageSwitch(lang)} activeOpacity={0.7}>
                  <Text style={[styles.langText, currentLanguage === lang ? styles.langTextActive : null]}>{lang.toUpperCase()}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* PROTOCOL */}
          <Text style={styles.sectionTitle}>{t('protocol')}</Text>
          <View style={styles.sectionCard}>
            <Text style={styles.inputLabel}>{t('dailyD3')}</Text>
            <TextInput style={[styles.input, styles.inputLast]} placeholder="e.g. 5000" placeholderTextColor="#555555" value={d3Dose} onChangeText={setD3Dose} keyboardType="numeric" />
          </View>

          {/* STOCK DAYS */}
          <View style={[styles.sectionCard, { marginTop: 12 }]}>
            {supplements.map((s) => (
              <View key={s.id} style={{marginBottom: 16}}>
                <Text style={{color: '#fff', marginBottom: 4}}>{s.name}</Text>
                <Text style={{color: '#888', fontSize: 12, marginBottom: 4}}>Doses on hand (optional)</Text>
                <TextInput
                  style={[styles.input, {marginTop: 0}]}
                  placeholder='e.g. 30'
                  placeholderTextColor='#444444'
                  value={getStockValue(s.id)}
                  onChangeText={(val) => setStockChanges((prev) => { const m = new Map(prev); m.set(s.id, val); return m; })}
                  keyboardType='numeric'
                />
              </View>
            ))}
          </View>

          {/* SUPPLEMENT FORMS — Task 21 */}
          {suppForms.length > 0 ? (
            <>
              <Text style={styles.sectionTitle}>SUPPLEMENT FORMS</Text>
              <View style={styles.sectionCard}>
                {suppForms.map((s, idx) => (
                  <View key={s.id} style={[styles.stockRow, idx === suppForms.length - 1 ? { borderBottomWidth: 0 } : null]}>
                    <Text style={styles.stockName}>{s.name}</Text>
                    <View style={styles.formRow}>
                      {(['capsule', 'tablet', 'powder', 'liquid'] as const).map((f) => (
                        <TouchableOpacity
                          key={f}
                          style={[styles.formBtn, s.form === f ? styles.formBtnActive : null]}
                          onPress={async () => {
                            await updateSupplementForm(s.id, f);
                            setSuppForms((prev) => prev.map((x) => x.id === s.id ? { ...x, form: f } : x));
                          }}
                          activeOpacity={0.7}
                        >
                          <Text style={[styles.formBtnText, s.form === f ? styles.formBtnTextActive : null]}>
                            {f.charAt(0).toUpperCase()}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                ))}
              </View>
            </>
          ) : null}

          {/* SCHEDULE */}
          <Text style={styles.sectionTitle}>{t('schedule')}</Text>
          <View style={styles.sectionCard}>
            <Text style={styles.inputLabel}>{t('bedtimeCutoff')}</Text>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <TextInput style={styles.input} placeholder="HH" value={String(bedtimeHour)} onChangeText={(text) => { const num = parseInt(text, 10); if (!isNaN(num) && num >= 0 && num <= 23) setBedtimeHour(num); }} keyboardType="numeric" />
              <TextInput style={styles.input} placeholder="MM" value={String(bedtimeMinute).padStart(2, '0')} onChangeText={(text) => { const num = parseInt(text, 10); if (!isNaN(num) && num >= 0 && num <= 59) setBedtimeMinute(num); }} keyboardType="numeric" />
            </View>
          </View>

          {/* HEALTH TRACKING */}
          <Text style={styles.sectionTitle}>{t('healthTracking')}</Text>
          <View style={styles.sectionCard}>
            <Text style={styles.inputLabel}>{t('lastBloodTest')}</Text>
            <TextInput style={[styles.input, styles.inputLast]} placeholder="YYYY-MM-DD" placeholderTextColor="#555555" value={bloodTestDate} onChangeText={setBloodTestDate} autoCapitalize="none" />
          </View>

          <TouchableOpacity style={styles.surveyRow} onPress={() => navigation.navigate('CareSurvey')} activeOpacity={0.8}>
            <View style={styles.surveyRowLeft}>
              <Ionicons name="clipboard-outline" size={18} color="#22c55e" />
              <View>
                <Text style={styles.surveyRowTitle}>Care Coordination Survey</Text>
                <Text style={styles.surveyRowSub}>
                  {lastSurveyDate ? `Last: ${lastSurveyDate}` : 'Never taken · ICES-MS validated'}
                </Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#444" />
          </TouchableOpacity>

          <TouchableOpacity style={[styles.surveyRow, { marginTop: 8 }]} onPress={() => navigation.navigate('Mmas')} activeOpacity={0.8}>
            <View style={styles.surveyRowLeft}>
              <Ionicons name="bar-chart-outline" size={18} color="#22c55e" />
              <View>
                <Text style={styles.surveyRowTitle}>MMAS-8 Adherence Check</Text>
                <Text style={styles.surveyRowSub}>Monthly · 8-question validated scale</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#444" />
          </TouchableOpacity>

          <TouchableOpacity style={[styles.surveyRow, { marginTop: 8 }]} onPress={() => navigation.navigate('Quiz')} activeOpacity={0.8}>
            <View style={styles.surveyRowLeft}>
              <Ionicons name="help-circle-outline" size={18} color="#22c55e" />
              <View>
                <Text style={styles.surveyRowTitle}>Fact or Myth Quiz</Text>
                <Text style={styles.surveyRowSub}>Test your protocol knowledge · 8 questions</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#444" />
          </TouchableOpacity>

          {/* NUDGE FOCUS — Task 20 */}
          <Text style={styles.sectionTitle}>NUDGE PREFERENCES</Text>
          <View style={styles.sectionCard}>
            <Text style={styles.inputLabel}>Focus your reminders on</Text>
            <View style={styles.nudgeRow}>
              {(['all', 'doses', 'water', 'exercise'] as const).map((opt) => (
                <TouchableOpacity
                  key={opt}
                  style={[styles.nudgeBtn, nudgeFocus === opt ? styles.nudgeBtnActive : null]}
                  onPress={async () => { setNudgeFocus(opt); await AsyncStorage.setItem('nudge_focus', opt); }}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.nudgeBtnText, nudgeFocus === opt ? styles.nudgeBtnTextActive : null]}>
                    {opt === 'all' ? 'All' : opt.charAt(0).toUpperCase() + opt.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.privacyNotice}>Reminders are local only — no data sent externally.</Text>
          </View>

          {/* DOCTOR */}
          <Text style={styles.sectionTitle}>{t('doctor')}</Text>
          <View style={styles.sectionCard}>
            <Text style={styles.inputLabel}>{t('doctorName')}</Text>
            <TextInput style={styles.input} placeholder="e.g. Dr. Smith" value={doctorName} onChangeText={setDoctorName} />
            <Text style={styles.inputLabel}>{t('clinic')}</Text>
            <TextInput style={styles.input} placeholder="e.g. Coimbra Clinic" value={doctorClinic} onChangeText={setDoctorClinic} />
            <Text style={styles.inputLabel}>{t('email')}</Text>
            <TextInput style={styles.input} placeholder="e.g. doctor@clinic.com" value={doctorEmail} onChangeText={setDoctorEmail} keyboardType="email-address" />
            <Text style={styles.inputLabel}>{t('phone')}</Text>
            <TextInput style={[styles.input, styles.inputLast]} placeholder="e.g. +1 555 123 4567" value={doctorPhone} onChangeText={setDoctorPhone} keyboardType="phone-pad" />
          </View>

          {/* AI WORKSPACE */}
          <Text style={styles.sectionTitle}>AI WORKSPACE</Text>
          <View style={styles.sectionCard}>
            <Text style={styles.inputLabel}>Provider</Text>
            <View style={styles.langRow}>
              {['groq', 'openai', 'anthropic'].map((p) => (
                <TouchableOpacity key={p} style={[styles.langButton, aiProvider === p ? styles.langActive : null]} onPress={() => setAiProvider(p)} activeOpacity={0.7}>
                  <Text style={[styles.langText, aiProvider === p ? styles.langTextActive : null]}>{p === 'groq' ? 'Groq' : p === 'openai' ? 'OpenAI' : 'Anthropic'}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.inputLabel}>API Key</Text>
            <TextInput
              style={[styles.input, styles.inputLast]}
              placeholder="Paste your key here"
              placeholderTextColor="#555555"
              value={aiApiKey}
              onChangeText={setAiApiKey}
              secureTextEntry
              autoCapitalize="none"
            />
            <Text style={styles.privacyNotice}>
              Questions and your health summary are sent to your chosen provider. Nothing stored externally.
            </Text>
          </View>

          {/* TIMING WINDOWS */}
          <Text style={styles.sectionTitle}>{t('timingWindows')}</Text>
          <ProFeatureGate featureName="Timing Windows">
            <View style={styles.sectionCard}>
              {toleranceRules.map((rule) => {
                const val = getToleranceValue(rule.id);
                return (
                  <View key={rule.id} style={[styles.toleranceRow, styles.toleranceRowLast]}>
                    <Text style={styles.toleranceName}>{rule.supplement_name}</Text>
                    <View style={styles.stepper}>
                      <TouchableOpacity style={[styles.stepperBtn, val <= 15 ? styles.stepperBtnDisabled : null]} onPress={() => handleToleranceChange(rule.id, -15)} disabled={val <= 15} activeOpacity={0.6}>
                        <Text style={styles.stepperBtnText}>−</Text>
                      </TouchableOpacity>
                      <Text style={styles.stepperValue}>{val} min</Text>
                      <TouchableOpacity style={[styles.stepperBtn, val >= 120 ? styles.stepperBtnDisabled : null]} onPress={() => handleToleranceChange(rule.id, 15)} disabled={val >= 120} activeOpacity={0.6}>
                        <Text style={styles.stepperBtnText}>+</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
            </View>
          </ProFeatureGate>

          {/* DATA */}
          <Text style={styles.sectionTitle}>DATA</Text>
          <View style={styles.sectionCard}>
            <TouchableOpacity style={styles.toleranceRow} onPress={async () => {
              Alert.alert('Backup', 'Data export feature to be implemented');
            }} activeOpacity={0.7}>
              <Text style={styles.toleranceName}>Export My Data</Text>
              <Ionicons name="download-outline" size={20} color="#22c55e" />
            </TouchableOpacity>
            <TouchableOpacity style={[styles.toleranceRow, styles.toleranceRowLast]} onPress={() => Alert.alert('Reset', 'Are you sure?', [{text: 'Cancel'}, {text: 'Reset', style: 'destructive'}])} activeOpacity={0.7}>
              <Text style={[styles.toleranceName, {color: '#ef4444'}]}>Reset All Data</Text>
              <Ionicons name="trash-outline" size={20} color="#ef4444" />
            </TouchableOpacity>
          </View>

          {/* ADVANCED */}
          <Text style={styles.sectionTitle}>ADVANCED</Text>
          <View style={styles.sectionCard}>
            <View style={styles.toleranceRow}>
              <Text style={styles.toleranceName}>Simple Mode</Text>
              <Switch
                value={isSimple}
                onValueChange={toggleSimple}
                trackColor={{ false: '#3e3e3e', true: '#22c55e' }}
                thumbColor={Platform.OS === 'ios' ? '#ffffff' : isSimple ? '#ffffff' : '#f4f3f4'}
              />
            </View>
            <TouchableOpacity style={styles.toleranceRow} onPress={() => Alert.alert('Siri Shortcut', 'To add this to Siri, open the Shortcuts app, create a new shortcut, and use the "Open URL" action with: coimbra://start-day')} activeOpacity={0.7}>
              <Text style={styles.toleranceName}>Add Siri Shortcut</Text>
              <Ionicons name="add-circle-outline" size={20} color="#22c55e" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.toleranceRow} onPress={() => navigation.navigate('Security')} activeOpacity={0.7}>
              <Text style={styles.toleranceName}>Security & Passkeys</Text>
              <Ionicons name="shield-checkmark-outline" size={20} color="#22c55e" />
            </TouchableOpacity>

            <View style={[styles.toleranceRow, { borderBottomWidth: 0 }]}>
              <Text style={styles.toleranceName}>Font Scale</Text>
              <View style={styles.langRow}>
                {[0.85, 1.0, 1.15].map((s) => (
                  <TouchableOpacity key={s} style={[styles.langButton, s === 1.0 ? styles.langActive : null]} onPress={() => Alert.alert('Font Scale', 'Feature structure ready for implementation.')}>
                    <Text style={[styles.langText, s === 1.0 ? styles.langTextActive : null]}>{s === 0.85 ? 'Small' : s === 1.0 ? 'Normal' : 'Large'}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>

          {/* DANGER ZONE */}
          <Text style={[styles.sectionTitle, { color: '#ef4444', marginTop: 32 }]}>DANGER ZONE</Text>
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
          </View>

          {/* MORE */}
          <Text style={styles.sectionTitle}>MORE</Text>
          <View style={styles.sectionCard}>
            <TouchableOpacity style={styles.toleranceRow} onPress={() => navigation.navigate('Guide')} activeOpacity={0.7}>
              <Text style={styles.toleranceName}>Protocol Guide</Text>
              <Ionicons name="book-outline" size={20} color="#555555" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.toleranceRow} onPress={() => navigation.navigate('Workspace')} activeOpacity={0.7}>
              <Text style={styles.toleranceName}>AI Workspace</Text>
              <Ionicons name="sparkles-outline" size={20} color="#555555" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.toleranceRow} onPress={() => navigation.navigate('Caregiver')} activeOpacity={0.7}>
              <Text style={styles.toleranceName}>Caregiver View</Text>
              <Ionicons name="people-outline" size={20} color="#555555" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.toleranceRow} onPress={() => navigation.navigate('DrugChecker')} activeOpacity={0.7}>
              <Text style={styles.toleranceName}>Drug Checker</Text>
              <Ionicons name="shield-outline" size={20} color="#555555" />
            </TouchableOpacity>
            <TouchableOpacity style={[styles.toleranceRow, { borderBottomWidth: 0 }]} onPress={() => navigation.navigate('Feedback')} activeOpacity={0.7}>
              <Text style={styles.toleranceName}>Send Feedback</Text>
              <Ionicons name="chatbubble-outline" size={20} color="#555555" />
            </TouchableOpacity>
          </View>

          {/* TERMINAL LINK */}
          <TouchableOpacity style={styles.terminalLink} onPress={() => navigation.navigate('TerminalLink')} activeOpacity={0.8}>
            <View style={styles.terminalLinkLeft}>
              <Ionicons name="terminal" size={18} color="#22c55e" />
              <Text style={styles.terminalLinkText}>Link to Coimbra Terminal</Text>
            </View>
            <Text style={styles.terminalLinkSub}>Scan QR on coimbra.app</Text>
          </TouchableOpacity>

          {/* ABOUT */}
          <TouchableOpacity style={[styles.aboutLink, { marginBottom: 40 }]} onPress={() => navigation.navigate('About')} activeOpacity={0.7}>
            <Text style={styles.aboutLinkText}>{t('about')}</Text>
            <Ionicons name="chevron-forward" size={18} color="#555555" />
          </TouchableOpacity>
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
  container: { flex: 1, backgroundColor: '#0d0d0d' },
  flex: { flex: 1 },
  header: { alignItems: 'center', paddingTop: 60, paddingBottom: 24 },
  title: { color: '#ffffff', fontSize: 26, fontWeight: '800' },
  form: { flex: 1, paddingHorizontal: 24 },
  sectionTitle: { color: '#555555', fontSize: 11, fontWeight: '700', letterSpacing: 1.5, marginTop: 24, marginBottom: 8, marginLeft: 4 },
  sectionCard: { backgroundColor: '#1a1a1a', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 4 },
  inputLabel: { color: '#aaaaaa', fontSize: 13, fontWeight: '600', marginBottom: 4, marginTop: 14 },
  input: { backgroundColor: 'transparent', borderRadius: 0, paddingHorizontal: 0, paddingVertical: 12, color: '#ffffff', fontSize: 16, borderBottomWidth: 1, borderBottomColor: '#2a2a2a', marginBottom: 2 },
  inputLast: { borderBottomWidth: 0, marginBottom: 10 },
  langRow: { flexDirection: 'row', gap: 10, marginTop: 8, marginBottom: 12 },
  langButton: { flex: 1, borderRadius: 10, borderWidth: 1.5, borderColor: '#2a2a2a', paddingVertical: 12, alignItems: 'center' },
  langActive: { borderColor: '#22c55e', backgroundColor: '#0d2a1a' },
  langText: { color: '#555555', fontSize: 14, fontWeight: '700' },
  langTextActive: { color: '#22c55e' },
  stockRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#2a2a2a' },
  stockName: { color: '#aaaaaa', fontSize: 13, fontWeight: '600', flex: 1 },
  stockInput: { backgroundColor: '#2a2a2a', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, color: '#ffffff', fontSize: 14, width: 80, textAlign: 'center' },
  toleranceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#2a2a2a' },
  toleranceRowLast: { borderBottomWidth: 0 },
  toleranceName: { color: '#aaaaaa', fontSize: 14, fontWeight: '600', flex: 1, marginRight: 12 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepperBtn: { width: 32, height: 32, borderRadius: 8, backgroundColor: '#2a2a2a', alignItems: 'center', justifyContent: 'center' },
  stepperBtnDisabled: { opacity: 0.3 },
  stepperBtnText: { color: '#ffffff', fontSize: 18, fontWeight: '700' },
  stepperValue: { color: '#ffffff', fontSize: 15, fontWeight: '700', minWidth: 50, textAlign: 'center' },
  privacyNotice: { color: '#555555', fontSize: 11, fontStyle: 'italic', marginTop: 8, marginBottom: 12, lineHeight: 16 },
  surveyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#1a1a1a', borderRadius: 12, padding: 16, marginTop: 8 },
  surveyRowLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  surveyRowTitle: { color: '#ffffff', fontSize: 14, fontWeight: '600' },
  surveyRowSub: { color: '#555555', fontSize: 12, marginTop: 2 },
  terminalLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#0f1f0f', borderRadius: 12, padding: 16, marginTop: 8, borderWidth: 1, borderColor: '#22c55e30' },
  terminalLinkLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  terminalLinkText: { color: '#22c55e', fontSize: 15, fontWeight: '600' },
  terminalLinkSub: { color: '#444', fontSize: 12 },
  formRow: { flexDirection: 'row', gap: 4 },
  formBtn: { width: 30, height: 30, borderRadius: 6, borderWidth: 1, borderColor: '#2a2a2a', alignItems: 'center', justifyContent: 'center' },
  formBtnActive: { borderColor: '#22c55e', backgroundColor: '#0d2a1a' },
  formBtnText: { color: '#555555', fontSize: 11, fontWeight: '700' },
  formBtnTextActive: { color: '#22c55e' },
  nudgeRow: { flexDirection: 'row', gap: 8, marginTop: 8, marginBottom: 8 },
  nudgeBtn: { flex: 1, borderRadius: 8, borderWidth: 1, borderColor: '#2a2a2a', paddingVertical: 10, alignItems: 'center' },
  nudgeBtnActive: { borderColor: '#22c55e', backgroundColor: '#0d2a1a' },
  nudgeBtnText: { color: '#555555', fontSize: 12, fontWeight: '600' },
  nudgeBtnTextActive: { color: '#22c55e' },
  dangerCard: { backgroundColor: '#1a1a1a', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, borderWidth: 1, borderColor: '#ef444430' },
  dangerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dangerTitle: { color: '#ef4444', fontSize: 14, fontWeight: '700' },
  dangerSub: { color: '#555555', fontSize: 12, marginTop: 2 },
  dangerBtn: { backgroundColor: '#1a0a0a', borderRadius: 8, paddingHorizontal: 16, paddingVertical: 10, borderWidth: 1, borderColor: '#ef4444' },
  dangerBtnText: { color: '#ef4444', fontSize: 13, fontWeight: '700' },
  aboutLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#1a1a1a', borderRadius: 12, padding: 16, marginTop: 24 },
  aboutLinkText: { color: '#ffffff', fontSize: 15, fontWeight: '600' },
  footer: { paddingHorizontal: 24, paddingVertical: 20, borderTopWidth: 1, borderTopColor: '#1a1a1a', alignItems: 'center' },
  button: { backgroundColor: '#22c55e', borderRadius: 12, paddingVertical: 16, alignItems: 'center', width: '100%' },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: '#0d0d0d', fontSize: 17, fontWeight: '800' },
  confirmText: { color: '#22c55e', fontSize: 14, fontWeight: '700', marginTop: 12 },
});
