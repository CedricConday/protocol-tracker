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
import { getScheduleRules, updateRuleDose } from '../db/queries';
import { createDefaultProfile } from '../db/seed';
import * as Notifications from 'expo-notifications';

const { width } = Dimensions.get('window');

interface Props {
  onComplete: () => void;
}

const STEPS = [
  {
    title: 'Welcome to Coimbra Protocol',
    icon: '🧬',
    body: 'A personal companion for MS patients on Dr. Coimbra\'s high-dose Vitamin D3 protocol. Track your supplements, monitor compliance, and stay connected with your care plan.',
  },
  {
    title: 'Set Up Your Profile',
    icon: '👤',
    body: 'Your information stays on your device — nothing is shared without your consent.',
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
  const [saving, setSaving] = useState(false);
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
        await createDefaultProfile(name.trim(), parseFloat(weight));
        await AsyncStorage.setItem('patient_type', patientType);
        if (d3Dose.trim()) {
          const rules = await getScheduleRules();
          const d3Rule = rules.find((r) => r.supplement_id === 'vit_d3');
          if (d3Rule) {
            await updateRuleDose(d3Rule.id, d3Dose.trim(), 'IU');
          }
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
      if (isCaregiver) return name.trim().length > 0;
      return name.trim().length > 0 && weight.trim().length > 0 && !isNaN(parseFloat(weight));
    }
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
            <Animated.Text style={[styles.icon, { transform: [{ scale: iconScale }], opacity: iconOpacity }]}>🧬</Animated.Text>
            <Text style={styles.title}>Welcome to{'  '}Coimbra Protocol</Text>
            <Text style={styles.body}>
              A personal companion for MS patients on Dr. Coimbra's high-dose Vitamin D3 protocol. Track your supplements, monitor compliance, and stay connected with your care plan.
            </Text>
            <View style={styles.qolCard}>
              <Text style={styles.qolStat}>83.6 <Text style={styles.qolUnit}>/ 100</Text></Text>
              <Text style={styles.qolLabel}>Physical QoL in Coimbra Protocol patients</Text>
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
                  onPress={() => setPatientType(t.key)}
                  activeOpacity={0.7}
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
              <Text style={styles.inputLabel}>Your Name</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Alex"
                placeholderTextColor="#555555"
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
              />
              {!isCaregiver && (
                <>
                  <Text style={styles.inputLabel}>Weight (kg)</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. 70"
                    placeholderTextColor="#555555"
                    value={weight}
                    onChangeText={setWeight}
                    keyboardType="numeric"
                  />
                  <Text style={styles.inputLabel}>Daily Vitamin D3 Dose (IU)</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. 5000"
                    placeholderTextColor="#555555"
                    value={d3Dose}
                    onChangeText={setD3Dose}
                    keyboardType="numeric"
                  />
                  <Text style={styles.hint}>
                    Your doctor determines the right dose. Protocol doses typically range from 10,000 to 100,000+ IU/day based on body weight. Low-dose (1,000–5,000 IU) is NOT the Coimbra Protocol.
                  </Text>
                </>
              )}
            </View>
          </ScrollView>

          {/* Step 2: Notifications */}
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
              onPress={() => setStep(step - 1)}
              activeOpacity={0.7}
            >
              <Text style={styles.backText}>Back</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.backPlaceholder} />
          )}

          <TouchableOpacity
            style={[styles.nextButton, !canProceed() ? styles.buttonDisabled : null]}
            onPress={handleNext}
            disabled={!canProceed() || saving}
            activeOpacity={0.8}
          >
            <Text style={styles.nextText}>
              {saving ? 'Saving...' : step < STEPS.length - 1 ? 'Next' : 'Start'}
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
    backgroundColor: '#0d0d0d',
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
    backgroundColor: '#333333',
  },
  dotActive: {
    backgroundColor: '#22c55e',
    width: 28,
    borderRadius: 5,
  },
  slider: {
    flex: 1,
    flexDirection: 'row',
    width: width * 3,
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
  title: {
    color: '#ffffff',
    fontSize: 26,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 12,
  },
  body: {
    color: '#888888',
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  form: {
    width: '100%',
  },
  inputLabel: {
    color: '#aaaaaa',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6,
    marginTop: 16,
  },
  input: {
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: '#ffffff',
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    marginBottom: 4,
  },
  qolCard: { backgroundColor: '#0d1a0d', borderRadius: 12, padding: 14, marginTop: 12, marginBottom: 4, borderLeftWidth: 3, borderLeftColor: '#22c55e' },
  qolStat: { color: '#22c55e', fontSize: 28, fontWeight: '800' },
  qolUnit: { color: '#22c55e', fontSize: 16, fontWeight: '600' },
  qolLabel: { color: '#aaaaaa', fontSize: 13, marginTop: 2 },
  qolSource: { color: '#555555', fontSize: 11, marginTop: 4 },
  hint: {
    color: '#555555',
    fontSize: 12,
    marginTop: 8,
    lineHeight: 16,
  },
  featureList: {
    width: '100%',
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
  },
  featureItem: {
    color: '#888888',
    fontSize: 14,
    lineHeight: 24,
  },
  infoNote: {
    width: '100%',
    backgroundColor: '#1a1a00',
    borderRadius: 10,
    padding: 12,
    marginTop: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#eab308',
  },
  infoNoteText: {
    color: '#aaaaaa',
    fontSize: 13,
    lineHeight: 18,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 20,
    borderTopWidth: 1,
    borderTopColor: '#1a1a1a',
  },
  backButton: {
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  backText: {
    color: '#555555',
    fontSize: 15,
    fontWeight: '600',
  },
  backPlaceholder: {
    width: 50,
  },
  nextButton: {
    backgroundColor: '#22c55e',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 32,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  nextText: {
    color: '#0d0d0d',
    fontSize: 16,
    fontWeight: '800',
  },
  typeRow: { width: '100%', gap: 8, marginTop: 4 },
  typeBtn: { borderRadius: 10, borderWidth: 1, borderColor: '#2a2a2a', padding: 12, backgroundColor: '#1a1a1a' },
  typeBtnActive: { borderColor: '#22c55e', backgroundColor: '#0d2a1a' },
  typeBtnLabel: { color: '#aaaaaa', fontSize: 14, fontWeight: '700' },
  typeBtnLabelActive: { color: '#22c55e' },
  typeBtnDesc: { color: '#555555', fontSize: 12, marginTop: 2 },
});
