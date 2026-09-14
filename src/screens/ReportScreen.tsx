import { useState } from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Alert,
} from 'react-native';
import * as Sharing from 'expo-sharing';
import { generateComplianceReport } from '../components/ComplianceReport';
import { getProfile, getSupplementsWithRules } from '../db/queries';
import { t } from '../i18n';

export default function ReportScreen() {
  const [generating, setGenerating] = useState(false);
  const [lastGenerated, setLastGenerated] = useState<string | null>(null);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const profile = await getProfile();
      // No 'vit_d3' id exists in this build - the user names their own
      // supplements - so match the D3 entry by name.
      const rows = await getSupplementsWithRules();
      const d3 = rows.find((r) => /(^|\W)(d3|vitamin\s*d)/i.test(r.name));
      const uri = await generateComplianceReport(
        profile?.name ?? 'Patient',
        70,   // weight is no longer collected; the report keeps its column shape
        d3?.dose_amount ?? '—'
      );
      setLastGenerated(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      await Sharing.shareAsync(uri, { mimeType: 'application/pdf' });
    } catch (e: any) {
      Alert.alert('Could not create the report', e?.message ?? 'Please try again.');
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
        <Text style={styles.title}>{t('shareReport')}</Text>
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
    backgroundColor: '#F7F7F2',
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
    backgroundColor: '#1B58B8',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  logoLetter: {
    color: '#F7F7F2',
    fontSize: 38,
    fontWeight: '900',
    lineHeight: 44,
  },
  title: {
    color: '#F7F7F2',
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 6,
    textAlign: 'center',
  },
  subtitle: {
    color: '#5A6478',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 32,
  },
  button: {
    backgroundColor: '#1B58B8',
    borderRadius: 10,
    paddingVertical: 16,
    paddingHorizontal: 32,
    alignItems: 'center',
    width: '100%',
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  buttonText: {
    color: '#F7F7F2',
    fontSize: 17,
    fontWeight: '800',
  },
  lastGen: {
    color: '#5A6478',
    fontSize: 12,
    marginTop: 16,
  },
});
