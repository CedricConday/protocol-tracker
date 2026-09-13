import * as Haptics from 'expo-haptics';
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
import { getSupplementsWithRules, addSupplement, updateRuleDose, setMiscFlag } from '../db/queries';
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

// The welcome beat lives on the startup screen (SplashAnimation), so onboarding
// opens straight on the profile step.
const STEPS = [
  {
    title: 'Set Up Your Profile',
    icon: '👤',
    body: 'Your information stays on your device — nothing is shared without your consent.',
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
  const [saving, setSaving] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState<string | null>(null);
  const nameRef = useRef<TextInput>(null);
  const weightRef = useRef<TextInput>(null);
  // What the last Next tap found missing. Empty until the user actually taps,
  // so the screen does not greet them with errors for fields they have not
  // reached yet.
  const [hint, setHint] = useState<{ key: 'name' | 'weight' | 'condition'; label: string }[]>([]);
  const d3Ref = useRef<TextInput>(null);
  const translateX = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(1)).current;

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
        if (d3Dose.trim()) {
          // The dose entered here becomes the user's first supplement, created
          // through the same path as Manage supplements. Nothing is pre-seeded:
          // everything after this one the user adds themselves.
          const existing = await getSupplementsWithRules();
          const d3Row = existing.find((r) => /(^|\W)(d3|vitamin\s*d)/i.test(r.name));
          if (d3Row?.rule_id != null) {
            await updateRuleDose(d3Row.rule_id, d3Dose.trim(), 'IU');
          } else if (!d3Row) {
            await addSupplement({
              name: 'Vitamin D3',
              form: 'capsule',
              dose_amount: d3Dose.trim(),
              dose_unit: 'IU',
              offset_minutes: 0,
              with_food: false,
              tolerance_window: 30,
            });
          }
        }
        await setMiscFlag('onboarding_track', 'full');
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

  /**
   * What is stopping this step, named — not just whether something is.
   *
   * The button used to be `disabled={!canProceed() || saving}`, which on web and
   * on device means `pointer-events: none`: tapping it did nothing at all. No
   * shake, no message, no hint about which field was wanted. Reported from the
   * device as "stays greyed out", which is exactly what it looks like from the
   * outside — the user had filled in the only field the screen visibly asked
   * for, and nothing marked weight as required.
   */
  const missingFields = (): { key: 'name' | 'weight' | 'condition'; label: string }[] => {
    if (step === 0) {
      const out: { key: 'name' | 'weight' | 'condition'; label: string }[] = [];
      if (name.trim().length === 0) out.push({ key: 'name', label: 'your name' });
      // A weight that is present but unreadable ("kg 70", a bare comma) is as
      // blocking as an empty one and looks filled in, so it gets its own words.
      if (weight.trim().length === 0) out.push({ key: 'weight', label: 'your weight' });
      else if (isNaN(parseFloat(weight))) out.push({ key: 'weight', label: 'a weight we can read, like 70 or 70,5' });
      return out;
    }
    if (step === 1 && selectedProfile === null) return [{ key: 'condition', label: 'a condition' }];
    return [];
  };

  const canProceed = () => missingFields().length === 0;

  // Drop a complaint the moment it stops being true, rather than leaving it on
  // screen until the next tap.
  useEffect(() => {
    if (hint.length === 0) return;
    const still = missingFields();
    if (still.length !== hint.length) setHint(still);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, weight, selectedProfile]);

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
          {/* Step 0: Profile
              A ScrollView, not a View. It was the only step that could not
              scroll while step 1 could, and with the iOS keyboard up
              KeyboardAvoidingView shrinks the area under it: the form then had
              nowhere to go, overflowed its page, and painted through the
              footer — the Next button landing on top of the weight label, and
              the footer's top border cutting across the form. The D3 field was
              unreachable at the same time. */}
          <ScrollView
            style={{ width }}
            contentContainerStyle={[styles.page, { justifyContent: 'flex-start', paddingTop: 32, paddingBottom: 32 }]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.icon}>👤</Text>
            <Text style={styles.title}>Set Up Your Profile</Text>
            <Text style={styles.body}>Your information stays on your device — nothing is shared without your consent.</Text>

            <View style={styles.form}>
              <Text style={styles.inputLabel}>
                What should we call you? <Text style={styles.required}>Required</Text>
              </Text>
              <TextInput
                ref={nameRef}
                style={[styles.input, hint.some((h) => h.key === 'name') && styles.inputError]}
                placeholder="e.g. Alex"
                placeholderTextColor="#9AA3B2"
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
                returnKeyType="next"
                submitBehavior="submit"
                onSubmitEditing={() => weightRef.current?.focus()}
              />
                <Text style={styles.inputLabel}>
                  What&apos;s your weight? <Text style={styles.required}>Required</Text>
                </Text>
                <Text style={styles.inputHelp}>We use this to work out your D3 dose. A comma is fine — 70,5.</Text>
                <TextInput
                  ref={weightRef}
                  style={[styles.input, hint.some((h) => h.key === 'weight') && styles.inputError]}
                  placeholder="e.g. 70"
                  placeholderTextColor="#9AA3B2"
                  value={weight}
                  onChangeText={setWeight}
                  keyboardType="numeric"
                  returnKeyType="next"
                  submitBehavior="submit"
                  onSubmitEditing={() => d3Ref.current?.focus()}
                />
                <Text style={styles.inputLabel}>
                  Daily Vitamin D3 Dose (IU) <Text style={styles.optional}>Optional</Text>
                </Text>
                <TextInput
                  ref={d3Ref}
                  style={styles.input}
                  placeholder="e.g. 5000"
                  placeholderTextColor="#9AA3B2"
                  value={d3Dose}
                  onChangeText={setD3Dose}
                  keyboardType="numeric"
                  returnKeyType="done"
                  onSubmitEditing={() => Keyboard.dismiss()}
                />
                <Text style={styles.hint}>
                  Enter the dose your doctor prescribed.
                </Text>
            </View>
          </ScrollView>

          {/* Step 1: Condition (disease profile) */}
          {/* Nine conditions do not fit on one screen. The scroll indicator was
              hidden, so the last card was sliced by the footer with nothing to
              say more existed — someone with Crohn's, type 1 diabetes or
              "Other" would have concluded their condition was not supported.
              Indicator on, and enough bottom padding that the final card clears
              the footer instead of being cut in half. */}
          <ScrollView
            style={{ width }}
            contentContainerStyle={[styles.page, { justifyContent: 'flex-start', paddingTop: 32, paddingBottom: 32 }]}
            showsVerticalScrollIndicator={true}
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
                    {/* `patientDescription` is deliberately '' — this build
                        authors no medical descriptions — so a second <Text>
                        rendered empty on every card: dead height, and the same
                        empty-string-child the audit chased for seven screens.
                        The ICD-10 code goes INLINE rather than on its own line:
                        as a second line it grew every card and cut the number
                        of conditions visible without scrolling from six to
                        five, which works against the very problem being fixed
                        here. Nine conditions and a short screen means density
                        is the point. */}
                    <Text style={[styles.trackTitle, selectedProfile === p.id && styles.trackTitleActive]}>
                      {p.name}
                      {p.icd10 ? <Text style={styles.trackCode}>  ICD-10 {p.icd10}</Text> : null}
                    </Text>
                    {p.patientDescription ? (
                      <Text style={styles.trackDesc}>
                        {p.patientDescription.length > 60 ? p.patientDescription.slice(0, 60) + '…' : p.patientDescription}
                      </Text>
                    ) : null}
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>

          {/* Step 2: Notifications / Done */}
          <View style={styles.page}>
            <Text style={styles.icon}>🔔</Text>
            <Text style={styles.title}>Almost Ready</Text>
              <Text style={styles.body}>Enable notifications so you never miss a dose. You can change this later in Settings.</Text>
              <View style={styles.featureList}>
                <Text style={styles.featureItem}>• Dose reminders</Text>
                <Text style={styles.featureItem}>• Water intake nudges</Text>
                <Text style={styles.featureItem}>• End-of-day summaries</Text>
                <Text style={styles.featureItem}>• Awareness calendar alerts</Text>
              </View>
          </View>

        </Animated.View>

        {/* Bottom buttons.
            The hint gets its own full-width line ABOVE the button row. Dropped
            into the row itself it became a third flex child and squeezed the
            button sideways — visible in the first screenshot of it. */}
        <View style={styles.footer}>
          {hint.length ? (
            <Text style={styles.missingHint} accessibilityLiveRegion="polite">
              Still needed: {hint.map((h) => h.label).join(' and ')}.
            </Text>
          ) : null}

          <View style={styles.footerRow}>
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
          ) : null}

          <TouchableOpacity
            style={[
              styles.nextButton,
              step === 0 && styles.nextButtonWide,
              // NOT greyed out when a field is missing. The button works in
              // that state — it tells you what is still needed — and a control
              // that looks dead while being live is worse than one that is
              // honestly either. Reported from the device: "stays greyed out
              // even when I finished my name, pressing it did submit it."
              // `saving` is the only state where it really is inert, so that
              // is the only state that looks it.
              saving ? styles.buttonDisabled : null,
            ]}
            onPress={() => {
              const missing = missingFields();
              if (missing.length) {
                // Say what is wanted and put the cursor in it, rather than
                // swallowing the tap.
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                setHint(missing);
                if (missing[0].key === 'name') nameRef.current?.focus();
                if (missing[0].key === 'weight') weightRef.current?.focus();
                return;
              }
              setHint([]);
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              handleNext();
            }}
            disabled={saving}
            activeOpacity={0.8}
            accessibilityLabel={saving ? 'Saving' : step < STEPS.length - 1 ? 'Next step' : "Let's begin"}
            accessibilityRole="button"
          >
            <Text style={styles.nextText}>
              {saving ? 'Saving...' : step < STEPS.length - 1 ? 'Next' : "Let's begin →"}
            </Text>
          </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7F7F2',
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
    backgroundColor: '#CFD2C6',
  },
  dotActive: {
    backgroundColor: '#1B58B8',
    width: 28,
    borderRadius: 5,
  },
  slider: {
    flex: 1,
    flexDirection: 'row',
    // One page per step. This was hardcoded to `width * 5` from when onboarding
    // had five beats; with three it painted 1950px of slider into a 390px
    // viewport, so every step overflowed to the right.
    width: width * STEPS.length,
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
    color: '#14213D',
    fontSize: 26,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 12,
  },
  body: {
    color: '#5A6478',
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 24,
  },
  form: {
    width: '100%',
  },
  inputLabel: {
    color: '#5A6478',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6,
    marginTop: 16,
  },
  required: { color: '#B3453E', fontSize: 12, fontWeight: '700' },
  optional: { color: '#9AA3B2', fontSize: 12, fontWeight: '600' },
  inputHelp: { color: '#9AA3B2', fontSize: 12, lineHeight: 17, marginTop: -4, marginBottom: 6 },
  inputError: { borderColor: '#B3453E', borderWidth: 1.5 },
  missingHint: { color: '#B3453E', fontSize: 13, fontWeight: '600', textAlign: 'center', marginBottom: 10 },
  input: {
    backgroundColor: '#ECEDE6',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: '#14213D',
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#DBDDD3',
    marginBottom: 4,
  },
  hint: {
    color: '#5A6478',
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
    color: '#5A6478',
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
    color: '#5A6478',
    fontSize: 15,
    lineHeight: 22,
  },
  footer: {
    paddingHorizontal: 24,
    paddingVertical: 20,
    borderTopWidth: 1,
    borderTopColor: '#CFD2C6',
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  backButton: {
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  backText: {
    color: '#5A6478',
    fontSize: 15,
    fontWeight: '600',
  },
  nextButton: {
    backgroundColor: '#1B58B8',
    borderRadius: 10,
    paddingVertical: 16,
    paddingHorizontal: 32,
    alignItems: 'center',
  },
  // First step has no Back button, so the lone button spans the footer instead
  // of floating in the right-hand corner.
  nextButtonWide: {
    flex: 1,
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  // Full strength, because the button is tappable whatever is missing.
  nextText: {
    color: '#F7F7F2',
    fontSize: 16,
    fontWeight: '800',
  },
  trackCard: { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 14, borderWidth: 1, borderColor: '#DBDDD3', padding: 16, backgroundColor: '#ECEDE6' },
  trackCardActive: { borderColor: '#1B58B8', backgroundColor: '#E7EEFB' },
  trackTitle: { color: '#5A6478', fontSize: 15, fontWeight: '700' },
  trackTitleActive: { color: '#1B58B8' },
  trackDesc: { color: '#9AA3B2', fontSize: 13, marginTop: 2 },
  trackCode: { color: '#9AA3B2', fontSize: 12, fontWeight: '500' },
});
