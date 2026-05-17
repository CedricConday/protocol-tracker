import { useCallback, useEffect, useState } from 'react';
import {
  FlatList,
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
import { getScheduleRules, updateRuleDose } from '../db/queries';
import { createDefaultProfile } from '../db/seed';
import type { ScheduleRule } from '../types';

interface RuleWithSupp extends ScheduleRule {
  supplement_name: string;
  supplement_form: string;
}

interface Props {
  onComplete: () => void;
}

export default function OnboardingScreen({ onComplete }: Props) {
  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [weight, setWeight] = useState('');
  const [rules, setRules] = useState<RuleWithSupp[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [doses, setDoses] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getScheduleRules().then((data) => {
      setRules(data as RuleWithSupp[]);
      setSelected(new Set(data.map((r) => r.id)));
    });
  }, []);

  const toggleRule = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleFinish = useCallback(async () => {
    setSaving(true);
    try {
      await createDefaultProfile(name.trim(), parseFloat(weight));
      const selectedRules = rules.filter((r) => selected.has(r.id));
      for (const r of selectedRules) {
        const amount = doses[r.id]?.trim() || '';
        const [amtStr, unitStr] = amount.split(/\s+/);
        if (amtStr) {
          await updateRuleDose(r.id, amtStr, unitStr || r.dose_unit);
        }
      }
      onComplete();
    } finally {
      setSaving(false);
    }
  }, [name, weight, rules, selected, doses, onComplete]);

  const canProceedStep1 = name.trim().length > 0 && weight.trim().length > 0 && !isNaN(parseFloat(weight));
  const canProceedStep2 = selected.size > 0;

  const stepDots = [1, 2, 3].map((s) => (
    <View
      key={s}
      style={[styles.dot, step === s && styles.dotActive]}
    />
  ));

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Coimbra Protocol</Text>
          <Text style={styles.subtitle}>Set up your profile</Text>
          <View style={styles.dotRow}>{stepDots}</View>
          <Text style={styles.stepLabel}>Step {step} of 3</Text>
        </View>

        {step === 1 && (
          <View style={styles.stepContent}>
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
          </View>
        )}

        {step === 2 && (
          <View style={styles.stepContent}>
            <Text style={styles.stepDescription}>
              Select the supplements you take. Uncheck any you don't need.
            </Text>
            <FlatList
              data={rules}
              keyExtractor={(item) => String(item.id)}
              contentContainerStyle={styles.list}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => {
                const isSelected = selected.has(item.id);
                return (
                  <TouchableOpacity
                    style={styles.checkRow}
                    onPress={() => toggleRule(item.id)}
                    activeOpacity={0.7}
                  >
                    <View
                      style={[
                        styles.checkbox,
                        isSelected && styles.checkboxActive,
                      ]}
                    >
                      {isSelected && (
                        <Text style={styles.checkmark}>✓</Text>
                      )}
                    </View>
                    <View style={styles.checkInfo}>
                      <Text style={styles.checkName}>
                        {item.supplement_name}
                      </Text>
                      <Text style={styles.checkMeta}>
                        {item.supplement_form}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        )}

        {step === 3 && (
          <ScrollView
            style={styles.stepContent}
            contentContainerStyle={styles.doseList}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.stepDescription}>
              Enter your dose for each supplement (amount + unit).
            </Text>
            {rules
              .filter((r) => selected.has(r.id))
              .map((r) => (
                <View key={r.id} style={styles.doseRow}>
                  <Text style={styles.doseLabel}>
                    {r.supplement_name}
                  </Text>
                  <TextInput
                    style={styles.doseInput}
                    placeholder="e.g. 5000 IU"
                    placeholderTextColor="#555555"
                    value={doses[r.id] ?? ''}
                    onChangeText={(val) =>
                      setDoses((prev) => ({ ...prev, [r.id]: val }))
                    }
                    autoCapitalize="characters"
                  />
                </View>
              ))}
          </ScrollView>
        )}

        <View style={styles.footer}>
          {step > 1 && (
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => setStep((s) => s - 1)}
            >
              <Text style={styles.backText}>Back</Text>
            </TouchableOpacity>
          )}
          <View style={styles.flex} />
          {step < 3 ? (
            <TouchableOpacity
              style={[
                styles.nextButton,
                !(step === 1 ? canProceedStep1 : canProceedStep2) &&
                  styles.nextDisabled,
              ]}
              disabled={step === 1 ? !canProceedStep1 : !canProceedStep2}
              onPress={() => setStep((s) => s + 1)}
            >
              <Text style={styles.nextText}>Next</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.nextButton, saving && styles.nextDisabled]}
              onPress={handleFinish}
              disabled={saving}
            >
              <Text style={styles.nextText}>
                {saving ? 'Saving...' : 'Done'}
              </Text>
            </TouchableOpacity>
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
    paddingTop: 40,
    paddingBottom: 16,
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
  dotRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 16,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#333333',
  },
  dotActive: {
    backgroundColor: '#22c55e',
    width: 24,
    borderRadius: 4,
  },
  stepLabel: {
    color: '#555555',
    fontSize: 12,
    marginTop: 8,
  },
  stepContent: {
    flex: 1,
    paddingHorizontal: 24,
  },
  stepDescription: {
    color: '#888888',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 16,
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
  list: {
    paddingBottom: 20,
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#555555',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  checkboxActive: {
    backgroundColor: '#22c55e',
    borderColor: '#22c55e',
  },
  checkmark: {
    color: '#0d0d0d',
    fontSize: 14,
    fontWeight: '800',
  },
  checkInfo: {
    flex: 1,
  },
  checkName: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
  checkMeta: {
    color: '#888888',
    fontSize: 12,
    marginTop: 2,
  },
  doseList: {
    paddingBottom: 20,
  },
  doseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
  },
  doseLabel: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
    flex: 1,
    marginRight: 12,
  },
  doseInput: {
    backgroundColor: '#2a2a2a',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#ffffff',
    fontSize: 14,
    minWidth: 120,
    textAlign: 'right',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: '#1a1a1a',
  },
  backButton: {
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  backText: {
    color: '#888888',
    fontSize: 15,
    fontWeight: '600',
  },
  nextButton: {
    backgroundColor: '#22c55e',
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 32,
  },
  nextDisabled: {
    opacity: 0.4,
  },
  nextText: {
    color: '#0d0d0d',
    fontSize: 15,
    fontWeight: '800',
  },
});
