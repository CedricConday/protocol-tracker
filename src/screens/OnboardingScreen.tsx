import { useCallback, useState } from 'react';
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
import { getScheduleRules, updateRuleDose } from '../db/queries';
import { createDefaultProfile } from '../db/seed';

interface Props {
  onComplete: () => void;
}

export default function OnboardingScreen({ onComplete }: Props) {
  const [name, setName] = useState('');
  const [weight, setWeight] = useState('');
  const [d3Dose, setD3Dose] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = useCallback(async () => {
    setSaving(true);
    try {
      await createDefaultProfile(name.trim(), parseFloat(weight));

      if (d3Dose.trim()) {
        const rules = await getScheduleRules();
        const d3Rule = rules.find((r) => r.supplement_id === 'vit_d3');
        if (d3Rule) {
          await updateRuleDose(d3Rule.id, d3Dose.trim(), 'IU');
        }
      }

      onComplete();
    } finally {
      setSaving(false);
    }
  }, [name, weight, d3Dose, onComplete]);

  const canSubmit =
    name.trim().length > 0 &&
    weight.trim().length > 0 &&
    !isNaN(parseFloat(weight));

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Coimbra Protocol</Text>
          <Text style={styles.subtitle}>Set up your profile to begin</Text>
        </View>

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
            Typical range: 1000-10000 IU. Your doctor determines the right dose.
          </Text>
        </View>

        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.button, saving && styles.buttonDisabled]}
            onPress={handleSubmit}
            disabled={saving || !canSubmit}
          >
            <Text style={styles.buttonText}>
              {saving ? 'Saving...' : 'Start'}
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
  header: {
    alignItems: 'center',
    paddingTop: 60,
    paddingBottom: 32,
  },
  title: {
    color: '#ffffff',
    fontSize: 26,
    fontWeight: '800',
  },
  subtitle: {
    color: '#888888',
    fontSize: 14,
    marginTop: 4,
  },
  form: {
    flex: 1,
    paddingHorizontal: 24,
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
  },
  hint: {
    color: '#555555',
    fontSize: 12,
    marginTop: 8,
    lineHeight: 16,
  },
  footer: {
    paddingHorizontal: 24,
    paddingVertical: 20,
    borderTopWidth: 1,
    borderTopColor: '#1a1a1a',
  },
  button: {
    backgroundColor: '#22c55e',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  buttonText: {
    color: '#0d0d0d',
    fontSize: 17,
    fontWeight: '800',
  },
});
