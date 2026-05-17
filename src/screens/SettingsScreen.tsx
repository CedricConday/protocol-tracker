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
import { getProfile, updateProfile, getScheduleRules, updateRuleDose } from '../db/queries';

export default function SettingsScreen() {
  const [name, setName] = useState('');
  const [weight, setWeight] = useState('');
  const [d3Dose, setD3Dose] = useState('');
  const [d3RuleId, setD3RuleId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    (async () => {
      const profile = await getProfile();
      if (profile) {
        setName(profile.name);
        setWeight(String(profile.weight_kg));
      }
      const rules = await getScheduleRules();
      const d3 = rules.find((r) => r.supplement_id === 'vit_d3');
      if (d3) {
        setD3RuleId(d3.id);
        setD3Dose(d3.dose_amount);
      }
    })();
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await updateProfile({
        name: name.trim(),
        weight_kg: parseFloat(weight),
      });
      if (d3RuleId != null && d3Dose.trim()) {
        await updateRuleDose(d3RuleId, d3Dose.trim(), 'IU');
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }, [name, weight, d3Dose, d3RuleId]);

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Settings</Text>
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

          <Text style={styles.inputLabel}>Daily Vitamin D3 (IU)</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. 5000"
            placeholderTextColor="#555555"
            value={d3Dose}
            onChangeText={setD3Dose}
            keyboardType="numeric"
          />
        </View>

        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.button, saving && styles.buttonDisabled]}
            onPress={handleSave}
            disabled={saving}
          >
            <Text style={styles.buttonText}>
              {saving ? 'Saving...' : 'Save'}
            </Text>
          </TouchableOpacity>
          {saved && (
            <Text style={styles.confirmText}>Saved ✓</Text>
          )}
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
  footer: {
    paddingHorizontal: 24,
    paddingVertical: 20,
    borderTopWidth: 1,
    borderTopColor: '#1a1a1a',
    alignItems: 'center',
  },
  button: {
    backgroundColor: '#22c55e',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    width: '100%',
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  buttonText: {
    color: '#0d0d0d',
    fontSize: 17,
    fontWeight: '800',
  },
  confirmText: {
    color: '#22c55e',
    fontSize: 14,
    fontWeight: '700',
    marginTop: 12,
  },
});
