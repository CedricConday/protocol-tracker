import { useState } from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Sharing from 'expo-sharing';
import { generateComplianceReport } from '../components/ComplianceReport';
import { getProfile, getScheduleRules } from '../db/queries';

export default function ReportScreen() {
  const [generating, setGenerating] = useState(false);
  const [lastGenerated, setLastGenerated] = useState<string | null>(null);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const profile = await getProfile();
      const rules = await getScheduleRules();
      const d3 = rules.find((r) => r.supplement_id === 'vit_d3');
      const uri = await generateComplianceReport(
        profile?.name ?? 'Patient',
        profile?.weight_kg ?? 70,
        d3?.dose_amount ?? '—'
      );
      setLastGenerated(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      await Sharing.shareAsync(uri, { mimeType: 'application/pdf' });
    } finally {
      setGenerating(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <View style={styles.logoCircle}>
          <Text style={styles.logoLetter}>C</Text>
        </View>
        <Text style={styles.title}>Share Report with Doctor</Text>
        <Text style={styles.subtitle}>
          30-day compliance summary as PDF
        </Text>

        <TouchableOpacity
          style={[styles.button, generating ? styles.buttonDisabled : null]}
          onPress={handleGenerate}
          disabled={generating}
          activeOpacity={0.8}
        >
          <Text style={styles.buttonText}>
            {generating ? 'Generating...' : 'Generate Report'}
          </Text>
        </TouchableOpacity>

        {lastGenerated ? (
          <Text style={styles.lastGen}>Last generated: {lastGenerated}</Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAF7F4',
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  logoCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#C96A50',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  logoLetter: {
    color: '#FAF7F4',
    fontSize: 38,
    fontWeight: '900',
    lineHeight: 44,
  },
  title: {
    color: '#FAF7F4',
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 6,
    textAlign: 'center',
  },
  subtitle: {
    color: '#7A6A62',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 32,
  },
  button: {
    backgroundColor: '#C96A50',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 32,
    alignItems: 'center',
    width: '100%',
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  buttonText: {
    color: '#FAF7F4',
    fontSize: 17,
    fontWeight: '800',
  },
  lastGen: {
    color: '#7A6A62',
    fontSize: 12,
    marginTop: 16,
  },
});
