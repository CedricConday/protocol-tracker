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
  const [bedtimeHour, setBedtimeHour] = useState(22);
  const [bedtimeMinute, setBedtimeMinute] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

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
       setSaved(true);
       setTimeout(() => setSaved(false), 2000);
     } finally {
       setSaving(false);
     }
   }, [name, weight, d3Dose, d3RuleId, bedtimeHour, bedtimeMinute]);

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
          {/* Section 1: PROFILE */}
          <Text style={styles.sectionTitle}>PROFILE</Text>
          <View style={styles.sectionCard}>
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
              style={[styles.input, styles.inputLast]}
              placeholder="e.g. 70"
              placeholderTextColor="#555555"
              value={weight}
              onChangeText={setWeight}
              keyboardType="numeric"
            />
          </View>

         {/* Section 2: PROTOCOL */}
         <Text style={styles.sectionTitle}>PROTOCOL</Text>
         <View style={styles.sectionCard}>
           <Text style={styles.inputLabel}>Daily Vitamin D3 (IU)</Text>
           <TextInput
             style={[styles.input, styles.inputLast]}
             placeholder="e.g. 5000"
             placeholderTextColor="#555555"
             value={d3Dose}
             onChangeText={setD3Dose}
             keyboardType="numeric"
           />
         </View>

         {/* Section 3: SCHEDULE */}
         <Text style={styles.sectionTitle}>SCHEDULE</Text>
         <View style={styles.sectionCard}>
           <Text style={styles.inputLabel}>Bedtime Cutoff</Text>
           <View style={{ flexDirection: 'row', gap: 12 }}>
             <TextInput
               style={styles.input}
               placeholder="HH"
               value={String(bedtimeHour)}
               onChangeText={(text) => {
                 const num = parseInt(text, 10);
                 if (!isNaN(num) && num >= 0 && num <= 23) {
                   setBedtimeHour(num);
                 }
               }}
               keyboardType="numeric"
             />
             <TextInput
               style={styles.input}
               placeholder="MM"
               value={String(bedtimeMinute).padStart(2, '0')}
               onChangeText={(text) => {
                 const num = parseInt(text, 10);
                 if (!isNaN(num) && num >= 0 && num <= 59) {
                   setBedtimeMinute(num);
                 }
               }}
               keyboardType="numeric"
             />
           </View>
         </View>
        </View>

        <View style={styles.footer}>
         <TouchableOpacity
           style={[styles.button, saving ? styles.buttonDisabled : null]}
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
  sectionTitle: {
    color: '#555555',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginTop: 24,
    marginBottom: 8,
    marginLeft: 4,
  },
  sectionCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  inputLabel: {
    color: '#aaaaaa',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 4,
    marginTop: 14,
  },
  input: {
    backgroundColor: 'transparent',
    borderRadius: 0,
    paddingHorizontal: 0,
    paddingVertical: 12,
    color: '#ffffff',
    fontSize: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a2a',
    marginBottom: 2,
  },
  inputLast: {
    borderBottomWidth: 0,
    marginBottom: 10,
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
