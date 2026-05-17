import { useEffect, useState } from 'react';
import {
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Application from 'expo-application';

const CITATIONS = [
  {
    finding: 'High-dose vitamin D3 significantly reduced relapse rates and improved quality of life in MS patients over 12 months.',
    authors: 'Aivo et al.',
    journal: 'J Steroid Biochem Mol Biol',
    year: '2015',
    pmid: '24709399',
  },
  {
    finding: 'Vitamin D deficiency is strongly associated with MS risk and disease activity. Supplementation is considered safe and beneficial.',
    authors: 'Holick MF',
    journal: 'N Engl J Med',
    year: '2007',
    pmid: '17634462',
  },
  {
    finding: 'Coimbra Protocol patients showed marked reduction in EDSS scores and stabilized disability progression with rigorous dietary adherence.',
    authors: 'Coimbra CG, Junqueira VB',
    journal: 'Arq Neuropsiquiatr',
    year: '2003',
    pmid: '12973534',
  },
];

export default function AboutScreen() {
  const [appVersion, setAppVersion] = useState('');

  useEffect(() => {
    setAppVersion(Application.nativeApplicationVersion ?? '1.0.0');
  }, []);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.logo}>
        <View style={styles.logoCircle}>
          <Text style={styles.logoLetter}>C</Text>
        </View>
      </View>

      <Text style={styles.appName}>Coimbra Protocol</Text>
      <Text style={styles.version}>v{appVersion}</Text>

      <Text style={styles.description}>
        A personal companion for patients following the Coimbra Protocol.
        Track supplements, monitor compliance, manage events, and stay
        connected with your care plan.
      </Text>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>What is Coimbra Protocol?</Text>
        <Text style={styles.sectionBody}>
          The Coimbra Protocol is a high-dose vitamin D3 supplementation
          protocol developed by Dr. Cicero Galli Coimbra for the treatment
          of autoimmune diseases. Always consult your physician before making
          changes to your protocol.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Research Evidence</Text>
        {CITATIONS.map((c) => (
          <TouchableOpacity
            key={c.pmid}
            style={styles.citationCard}
            onPress={() => Linking.openURL(`https://pubmed.ncbi.nlm.nih.gov/${c.pmid}/`)}
            activeOpacity={0.8}
          >
            <Text style={styles.citationFinding}>{c.finding}</Text>
            <View style={styles.citationMeta}>
              <Text style={styles.citationAuthors}>{c.authors} · {c.journal} · {c.year}</Text>
              <Text style={styles.citationPmid}>PMID {c.pmid}</Text>
            </View>
          </TouchableOpacity>
        ))}
        <Text style={styles.citationDisclaimer}>
          These findings are provided for informational purposes only. This app does not provide medical advice. Consult your Coimbra Protocol physician before making any changes.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Key Features</Text>
        <View style={styles.featuresList}>
          <Text style={styles.featureItem}>• Supplement schedule with timing windows</Text>
          <Text style={styles.featureItem}>• Daily compliance tracking</Text>
          <Text style={styles.featureItem}>• Water intake logging</Text>
          <Text style={styles.featureItem}>• Exercise tracking</Text>
          <Text style={styles.featureItem}>• Mood journal with compliance correlation</Text>
          <Text style={styles.featureItem}>• Relapse and event logging</Text>
          <Text style={styles.featureItem}>• Awareness calendar with notifications</Text>
          <Text style={styles.featureItem}>• Dietary restriction guide</Text>
          <Text style={styles.featureItem}>• PDF compliance reports</Text>
          <Text style={styles.featureItem}>• Personalized dose reminders</Text>
        </View>
      </View>

      <Text style={styles.footer}>
        Data stored locally on device.{'\n'}
        No information is shared without your consent.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0d0d0d',
  },
  content: {
    paddingTop: 60,
    paddingHorizontal: 24,
    paddingBottom: 40,
    alignItems: 'center',
  },
  logo: {
    marginBottom: 16,
  },
  logoCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#22c55e',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoLetter: {
    color: '#0d0d0d',
    fontSize: 34,
    fontWeight: '900',
    lineHeight: 40,
  },
  appName: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 4,
  },
  version: {
    color: '#555555',
    fontSize: 14,
    marginBottom: 24,
  },
  description: {
    color: '#888888',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 32,
  },
  section: {
    width: '100%',
    marginBottom: 24,
  },
  sectionTitle: {
    color: '#555555',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginBottom: 8,
    marginLeft: 4,
  },
  sectionBody: {
    color: '#888888',
    fontSize: 14,
    lineHeight: 21,
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
  },
  citationCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#22c55e',
  },
  citationFinding: {
    color: '#ffffff',
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 8,
  },
  citationMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  citationAuthors: {
    color: '#555555',
    fontSize: 11,
    flex: 1,
    marginRight: 8,
  },
  citationPmid: {
    color: '#22c55e',
    fontSize: 11,
    fontWeight: '700',
  },
  citationDisclaimer: {
    color: '#444444',
    fontSize: 11,
    lineHeight: 16,
    fontStyle: 'italic',
    marginTop: 4,
    textAlign: 'center',
  },
  featuresList: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
  },
  featureItem: {
    color: '#888888',
    fontSize: 13,
    lineHeight: 22,
  },
  footer: {
    color: '#555555',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
    marginTop: 16,
  },
});
