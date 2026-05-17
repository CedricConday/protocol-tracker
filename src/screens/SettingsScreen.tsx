import { Ionicons } from '@expo/vector-icons';
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
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getProfile, updateProfile, getScheduleRules, updateRuleDose,
  updateRuleTolerance, getDoctor, updateDoctor, getLastBloodTestDate,
  setLastBloodTestDate, getAllSupplements, updateSupplementStock,
} from '../db/queries';
import { getDb } from '../db/schema';
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
  const navigation = useNavigation<any>();

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

      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }, [name, weight, d3Dose, d3RuleId, bedtimeHour, bedtimeMinute, toleranceChanges, doctorName, doctorClinic, doctorEmail, doctorPhone, bloodTestDate, stockChanges]);

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
        <View style={styles.form}>
          {/* PROFILE */}
          <Text style={styles.sectionTitle}>{t('profile')}</Text>
          <View style={styles.sectionCard}>
            <Text style={styles.inputLabel}>{t('yourName')}</Text>
            <TextInput style={styles.input} placeholder="e.g. Alex" placeholderTextColor="#555555" value={name} onChangeText={setName} autoCapitalize="words" />
            <Text style={styles.inputLabel}>{t('weightKg')}</Text>
            <TextInput style={[styles.input, styles.inputLast]} placeholder="e.g. 70" placeholderTextColor="#555555" value={weight} onChangeText={setWeight} keyboardType="numeric" />
            <Text style={styles.inputLabel}>{t('language')}</Text>
            <View style={styles.langRow}>
              <TouchableOpacity style={[styles.langButton, currentLanguage === 'en' ? styles.langActive : null]} onPress={() => handleLanguageSwitch('en')} activeOpacity={0.7}>
                <Text style={[styles.langText, currentLanguage === 'en' ? styles.langTextActive : null]}>EN</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.langButton, currentLanguage === 'de' ? styles.langActive : null]} onPress={() => handleLanguageSwitch('de')} activeOpacity={0.7}>
                <Text style={[styles.langText, currentLanguage === 'de' ? styles.langTextActive : null]}>DE</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* PROTOCOL */}
          <Text style={styles.sectionTitle}>{t('protocol')}</Text>
          <View style={styles.sectionCard}>
            <Text style={styles.inputLabel}>{t('dailyD3')}</Text>
            <TextInput style={[styles.input, styles.inputLast]} placeholder="e.g. 5000" placeholderTextColor="#555555" value={d3Dose} onChangeText={setD3Dose} keyboardType="numeric" />
          </View>

          {/* STOCK DAYS */}
          <View style={styles.sectionCard}>
            {supplements.map((s) => (
              <View key={s.id} style={styles.stockRow}>
                <Text style={styles.stockName}>{s.name}</Text>
                <TextInput
                  style={styles.stockInput}
                  placeholder={t('days')}
                  placeholderTextColor="#444444"
                  value={getStockValue(s.id)}
                  onChangeText={(val) => setStockChanges((prev) => { const m = new Map(prev); m.set(s.id, val); return m; })}
                  keyboardType="numeric"
                />
              </View>
            ))}
          </View>

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

          {/* ABOUT */}
          <TouchableOpacity style={styles.aboutLink} onPress={() => navigation.navigate('About')} activeOpacity={0.7}>
            <Text style={styles.aboutLinkText}>{t('about')}</Text>
            <Ionicons name="chevron-forward" size={18} color="#555555" />
          </TouchableOpacity>
        </View>

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
  header: { alignItems: 'center', paddingTop: 60, paddingBottom: 32 },
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
  aboutLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#1a1a1a', borderRadius: 12, padding: 16, marginTop: 24 },
  aboutLinkText: { color: '#ffffff', fontSize: 15, fontWeight: '600' },
  footer: { paddingHorizontal: 24, paddingVertical: 20, borderTopWidth: 1, borderTopColor: '#1a1a1a', alignItems: 'center' },
  button: { backgroundColor: '#22c55e', borderRadius: 12, paddingVertical: 16, alignItems: 'center', width: '100%' },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: '#0d0d0d', fontSize: 17, fontWeight: '800' },
  confirmText: { color: '#22c55e', fontSize: 14, fontWeight: '700', marginTop: 12 },
});
