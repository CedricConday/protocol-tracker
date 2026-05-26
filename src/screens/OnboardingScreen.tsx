import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getScheduleRules, updateRuleDose, setMiscFlag } from '../db/queries';
import { createDefaultProfile } from '../db/seed';
import * as Notifications from 'expo-notifications';
import { DISEASE_PROFILES } from '../data/diseaseProfiles';

const { width } = Dimensions.get('window');

interface Props {
  onComplete: () => void;
}

const CONDITION_ICONS: Record<string, string> = {
  ms: '🧠', lupus: '🦋', psoriasis: '🔴', vitiligo: '⬜',
  ra: '🦴', hashimoto: '🦋', crohn: '🫁', t1d: '🩸',
};

const STEPS = [
  {
    title: 'Welcome to the Protocol',
    icon: '🧬',
    body: 'A personal companion on Dr. Coimbra\'s high-dose Vitamin D3 protocol. Track your supplements, monitor compliance, and stay connected with your care plan.',
  },
  {
    title: 'Set Up Your Profile',
    icon: '👤',
    body: 'Your information stays on your device — nothing is shared without your consent.',
  },
  {
    title: 'How do you want to use this app?',
    icon: '🎯',
    body: 'Choose the mode that fits your style.',
  },
  {
    title: 'Your Condition',
    icon: '🏥',
    body: 'Select your condition so the app can show the most relevant lab markers and protocol information.',
  },
  {
    title: 'Almost Ready',
    icon: '🔔',
    body: 'Enable notifications so you never miss a dose. You can change this later in Settings.',
  },
];

export default function OnboardingScreen({ onComplete }: Props) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [weight, setWeight] = useState('');
  const [d3Dose, setD3Dose] = useState('');
  const [patientType, setPatientType] = useState<'new' | 'experienced' | 'caregiver'>('new');
  const [caregiverPatientName, setCaregiverPatientName] = useState('');
  const [onboardingTrack, setOnboardingTrack] = useState<'simple' | 'full'>('full');
  const [saving, setSaving] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState<string | null>(null);
  const translateX = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const iconScale = useRef(new Animated.Value(0.5)).current;
  const iconOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(iconScale, { toValue: 1, useNativeDriver: true, friction: 6, tension: 80 }),
      Animated.timing(iconOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
    ]).start();
  }, []);

  const slideTo = (index: number) => {
    Animated.parallel([
      Animated.timing(translateX, {
        toValue: -index * width,
        duration: 350,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 350,
        useNativeDriver: true,
      }),
    ]).start();
  };

  useEffect(() => {
    slideTo(step);
  }, [step]);

  const handleNext = async () => {
    Keyboard.dismiss();
    if (step < STEPS.length - 1) {
      setStep(step + 1);
    } else {
      setSaving(true);
      try {
        await createDefaultProfile(name.trim(), isCaregiver ? 0 : parseFloat(weight));
        await AsyncStorage.setItem('patient_type', patientType);
        if (isCaregiver && caregiverPatientName.trim()) {
          await AsyncStorage.setItem('caregiver_patient_name', caregiverPatientName.trim());
        }
        if (d3Dose.trim()) {
          const rules = await getScheduleRules();
          const d3Rule = rules.find((r) => r.supplement_id === 'vit_d3');
          if (d3Rule) {
            await updateRuleDose(d3Rule.id, d3Dose.trim(), 'IU');
          }
        }
        await setMiscFlag('onboarding_track', onboardingTrack);
        if (selectedProfile) {
          await setMiscFlag('disease_profile', selectedProfile);
        }
        try {
          await Notifications.requestPermissionsAsync();
        } catch {
          // permission denied
        }
        onComplete();
      } finally {
        setSaving(false);
      }
    }
  };

  const isCaregiver = patientType === 'caregiver';

  const canProceed = () => {
    if (step === 1) {
      if (isCaregiver) return name.trim().length > 0 && caregiverPatientName.trim().length > 0;
      return name.trim().length > 0 && weight.trim().length > 0 && !isNaN(parseFloat(weight));
    }
    if (step === 2) return onboardingTrack !== null;
    if (step === 3) return selectedProfile !== null;
    return true;
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Top dots */}
        <View style={styles.dots}>
          {STEPS.map((_, i) => (
            <View key={i} style={[styles.dot, i === step ? styles.dotActive : null]} />
          ))}
        </View>

        {/* Sliding pages */}
        <Animated.View
          style={[
            styles.slider,
            { transform: [{ translateX }] },
          ]}
        >
          {/* Step 0: Welcome */}
          <View style={styles.page}>
            <Animated.View style={[styles.welcomeCircle, { transform: [{ scale: iconScale }], opacity: iconOpacity }]}>
              <Ionicons name="medical" size={28} color="#22c55e" />
            </Animated.View>
            <Text style={styles.title}>Welcome, let's get you set up</Text>
            <Text style={styles.body}>
              This app is your daily companion for the Protocol. We'll keep it simple.
            </Text>
            <View style={styles.qolCard}>
              <Text style={styles.qolStat}>83.6 <Text style={styles.qolUnit}>/ 100</Text></Text>
              <Text style={styles.qolLabel}>Physical QoL in the Protocol patients</Text>
              <Text style={styles.qolSource}>vs 66.9 in controls · doi:10.3390/ctn7020012</Text>
            </View>
            <Text style={styles.inputLabel}>Who is using this app?</Text>
            <View style={styles.typeRow}>
              {([
                { key: 'new', label: 'New Patient', desc: 'Just starting the protocol' },
                { key: 'experienced', label: 'Experienced', desc: 'Already on the protocol' },
                { key: 'caregiver', label: 'Caregiver', desc: 'Supporting someone on protocol' },
              ] as const).map((t) => (
                <TouchableOpacity
                  key={t.key}
                  style={[styles.typeBtn, patientType === t.key ? styles.typeBtnActive : null]}
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setPatientType(t.key); }}
                  activeOpacity={0.7}
                  accessibilityLabel={`Select patient type: ${t.label}`}
                  accessibilityRole="button"
                >
                  <Text style={[styles.typeBtnLabel, patientType === t.key ? styles.typeBtnLabelActive : null]}>{t.label}</Text>
                  <Text style={styles.typeBtnDesc}>{t.desc}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Step 1: Profile */}
          <ScrollView
            style={{ width }}
            contentContainerStyle={[styles.page, { justifyContent: 'flex-start', paddingTop: 32, paddingBottom: 40 }]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.icon}>👤</Text>
            <Text style={styles.title}>Set Up Your Profile</Text>
            <Text style={styles.body}>Your information stays on your device — nothing is shared without your consent.</Text>

            <View style={styles.form}>
              <Text style={styles.inputLabel}>What should we call you?</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Alex"
                placeholderTextColor="#B0A098"
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
              />
              {isCaregiver ? (
                <>
                  <Text style={styles.inputLabel}>Patient's Name</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="The person you're supporting"
                    placeholderTextColor="#B0A098"
                    value={caregiverPatientName}
                    onChangeText={setCaregiverPatientName}
                    autoCapitalize="words"
                  />
                  <View style={styles.caregiverNote}>
                    <Text style={styles.caregiverNoteText}>
                      You'll track their protocol from your device. The patient controls what data you can view.
                    </Text>
                  </View>
                </>
              ) : (
                <>
                  <Text style={styles.inputLabel}>What's your weight? (we use this for your D3 dose)</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. 70"
                    placeholderTextColor="#B0A098"
                    value={weight}
                    onChangeText={setWeight}
                    keyboardType="numeric"
                  />
                  <Text style={styles.inputLabel}>Daily Vitamin D3 Dose (IU)</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. 5000"
                    placeholderTextColor="#B0A098"
                    value={d3Dose}
                    onChangeText={setD3Dose}
                    keyboardType="numeric"
                  />
                  <Text style={styles.hint}>
                    Your doctor determines the right dose. Protocol doses typically range from 10,000 to 100,000+ IU/day based on body weight. Low-dose (1,000–5,000 IU) is NOT the Protocol.
                  </Text>
                </>
              )}
            </View>
          </ScrollView>

          {/* Step 2: Track Selection */}
          <View style={styles.page}>
            <Text style={styles.icon}>🎯</Text>
            <Text style={styles.title}>How do you want to use this app?</Text>
            <View style={{ width: '100%', gap: 10, marginTop: 12 }}>
              <TouchableOpacity
                style={[styles.trackCard, onboardingTrack === 'simple' && styles.trackCardActive]}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setOnboardingTrack('simple'); }}
                activeOpacity={0.7}
                accessibilityLabel="Select daily companion track"
                accessibilityRole="button"
              >
                <Ionicons name="sunny-outline" size={24} color={onboardingTrack === 'simple' ? '#C96A50' : '#7A6A62'} accessible={false} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.trackTitle, onboardingTrack === 'simple' && styles.trackTitleActive]}>Daily companion</Text>
                  <Text style={styles.trackDesc}>Simple daily check-ins. I just want to stay on track.</Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.trackCard, onboardingTrack === 'full' && styles.trackCardActive]}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setOnboardingTrack('full'); }}
                activeOpacity={0.7}
                accessibilityLabel="Select full protocol track"
                accessibilityRole="button"
              >
                <Ionicons name="flask-outline" size={24} color={onboardingTrack === 'full' ? '#C96A50' : '#7A6A62'} accessible={false} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.trackTitle, onboardingTrack === 'full' && styles.trackTitleActive]}>Full protocol</Text>
                  <Text style={styles.trackDesc}>I want everything — labs, reports, full tracking.</Text>
                </View>
              </TouchableOpacity>
            </View>
          </View>

          {/* Step 3: Condition (disease profile) */}
          <ScrollView
            style={{ width }}
            contentContainerStyle={[styles.page, { justifyContent: 'flex-start', paddingTop: 32, paddingBottom: 40 }]}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.icon}>🏥</Text>
            <Text style={styles.title}>Your Condition</Text>
            <Text style={styles.body}>Select your condition so the app can show the most relevant lab markers and protocol information.</Text>
            <View style={{ width: '100%', gap: 8, marginTop: 12 }}>
              {DISEASE_PROFILES.map((p) => (
                <TouchableOpacity
                  key={p.id}
                  style={[styles.trackCard, selectedProfile === p.id && styles.trackCardActive]}
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setSelectedProfile(p.id); }}
                  activeOpacity={0.7}
                  accessibilityLabel={`Select condition: ${p.name}`}
                  accessibilityRole="button"
                >
                  <Text style={{ fontSize: 24 }}>{CONDITION_ICONS[p.id] || '🏥'}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.trackTitle, selectedProfile === p.id && styles.trackTitleActive]}>{p.name}</Text>
                    <Text style={styles.trackDesc}>{p.patientDescription.length > 60 ? p.patientDescription.slice(0, 60) + '…' : p.patientDescription}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>

          {/* Step 4: Notifications / Done */}
          <View style={styles.page}>
            <Text style={styles.icon}>🔔</Text>
            <Text style={styles.title}>Almost Ready</Text>
            {isCaregiver ? (
              <>
                <Text style={styles.body}>
                  Enable notifications to stay in the loop. You'll only receive updates the patient has approved sharing.
                </Text>
                <View style={styles.featureList}>
                  <Text style={styles.featureItem}>• Alert when a dose is overdue</Text>
                  <Text style={styles.featureItem}>• Daily compliance summary (if patient approves)</Text>
                  <Text style={styles.featureItem}>• Relapse or symptom events logged</Text>
                </View>
                <View style={styles.infoNote}>
                  <Text style={styles.infoNoteText}>
                    The patient controls what you see. They can turn sharing on or off anytime in their Settings.
                  </Text>
                </View>
              </>
            ) : (
              <>
                <Text style={styles.body}>Enable notifications so you never miss a dose. You can change this later in Settings.</Text>
                <View style={styles.featureList}>
                  <Text style={styles.featureItem}>• Dose reminders</Text>
                  <Text style={styles.featureItem}>• Water intake nudges</Text>
                  <Text style={styles.featureItem}>• End-of-day summaries</Text>
                  <Text style={styles.featureItem}>• Awareness calendar alerts</Text>
                </View>
              </>
            )}
          </View>

        </Animated.View>

        {/* Bottom buttons */}
        <View style={styles.footer}>
          {step > 0 ? (
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setStep(step - 1); }}
              activeOpacity={0.7}
              accessibilityLabel="Go back to previous step"
              accessibilityRole="button"
            >
              <Text style={styles.backText}>Back</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.backPlaceholder} />
          )}

          <TouchableOpacity
            style={[styles.nextButton, !canProceed() ? styles.buttonDisabled : null]}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); handleNext(); }}
            disabled={!canProceed() || saving}
            activeOpacity={0.8}
            accessibilityLabel={saving ? 'Saving' : step < STEPS.length - 1 ? 'Next step' : "Let's begin"}
            accessibilityRole="button"
          >
            <Text style={styles.nextText}>
              {saving ? 'Saving...' : step < STEPS.length - 1 ? 'Next' : "Let's begin →"}
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAF7F4',
  },
  flex: {
    flex: 1,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    paddingTop: 60,
    paddingBottom: 24,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#D8CFC8',
  },
  dotActive: {
    backgroundColor: '#C96A50',
    width: 28,
    borderRadius: 5,
  },
  slider: {
    flex: 1,
    flexDirection: 'row',
    width: width * 5,
  },
  page: {
    width,
    paddingHorizontal: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    fontSize: 48,
    marginBottom: 20,
  },
  welcomeCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#22c55e22',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  title: {
    color: '#2C2420',
    fontSize: 26,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 12,
  },
  body: {
    color: '#7A6A62',
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 24,
  },
  form: {
    width: '100%',
  },
  inputLabel: {
    color: '#7A6A62',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6,
    marginTop: 16,
  },
  input: {
    backgroundColor: '#F2EDE8',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: '#2C2420',
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#E8E0D8',
    marginBottom: 4,
  },
  qolCard: { backgroundColor: '#F0FDF4', borderRadius: 14, padding: 16, marginTop: 12, marginBottom: 4, borderLeftWidth: 3, borderLeftColor: '#22c55e' },
  qolStat: { color: '#166534', fontSize: 28, fontWeight: '800' },
  qolUnit: { color: '#166534', fontSize: 16, fontWeight: '600' },
  qolLabel: { color: '#7A6A62', fontSize: 13, marginTop: 2 },
  qolSource: { color: '#B0A098', fontSize: 11, marginTop: 4 },
  hint: {
    color: '#7A6A62',
    fontSize: 13,
    marginTop: 8,
    lineHeight: 20,
  },
  featureList: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#F0EDEA',
  },
  featureItem: {
    color: '#7A6A62',
    fontSize: 15,
    lineHeight: 24,
  },
  infoNote: {
    width: '100%',
    backgroundColor: '#FFF8EC',
    borderRadius: 14,
    padding: 14,
    marginTop: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#eab308',
  },
  infoNoteText: {
    color: '#7A6A62',
    fontSize: 15,
    lineHeight: 22,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 20,
    borderTopWidth: 1,
    borderTopColor: '#D8CFC8',
  },
  backButton: {
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  backText: {
    color: '#7A6A62',
    fontSize: 15,
    fontWeight: '600',
  },
  backPlaceholder: {
    width: 50,
  },
  nextButton: {
    backgroundColor: '#C96A50',
    borderRadius: 10,
    paddingVertical: 16,
    paddingHorizontal: 32,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  nextText: {
    color: '#FAF7F4',
    fontSize: 16,
    fontWeight: '800',
  },
  caregiverNote: { width: '100%', backgroundColor: '#FFF8EC', borderRadius: 14, padding: 14, marginTop: 12, borderLeftWidth: 3, borderLeftColor: '#eab308' },
  caregiverNoteText: { color: '#7A6A62', fontSize: 13, lineHeight: 18 },
  typeRow: { width: '100%', gap: 8, marginTop: 4 },
  trackCard: { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 14, borderWidth: 1, borderColor: '#E8E0D8', padding: 16, backgroundColor: '#F2EDE8' },
  trackCardActive: { borderColor: '#C96A50', backgroundColor: '#FBF0ED' },
  trackTitle: { color: '#7A6A62', fontSize: 15, fontWeight: '700' },
  trackTitleActive: { color: '#C96A50' },
  trackDesc: { color: '#B0A098', fontSize: 13, marginTop: 2 },
  typeBtn: { borderRadius: 14, borderWidth: 1, borderColor: '#E8E0D8', padding: 14, backgroundColor: '#F2EDE8' },
  typeBtnActive: { borderColor: '#C96A50', backgroundColor: '#FBF0ED' },
  typeBtnLabel: { color: '#7A6A62', fontSize: 15, fontWeight: '700' },
  typeBtnLabelActive: { color: '#C96A50' },
  typeBtnDesc: { color: '#7A6A62', fontSize: 13, marginTop: 2 },
});
