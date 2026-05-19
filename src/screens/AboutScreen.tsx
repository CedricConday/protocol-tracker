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
    finding: 'the Protocol patients showed marked reduction in EDSS scores and stabilized disability progression with rigorous dietary adherence.',
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

      <Text style={styles.appName}>the Protocol</Text>
      <Text style={styles.version}>v{appVersion}</Text>

      <Text style={styles.description}>
        A personal companion for patients following the Protocol.
        Track supplements, monitor compliance, manage events, and stay
        connected with your care plan.
      </Text>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>What is the Protocol?</Text>
        <Text style={styles.sectionBody}>
          The Protocol is a high-dose vitamin D3 supplementation
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
          These findings are provided for informational purposes only. This app does not provide medical advice. Consult your Protocol physician before making any changes.
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
    backgroundColor: '#FAF7F4',
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
    backgroundColor: '#C96A50',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoLetter: {
    color: '#FAF7F4',
    fontSize: 34,
    fontWeight: '900',
    lineHeight: 40,
  },
  appName: {
    color: '#2C2420',
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 4,
  },
  version: {
    color: '#B0A098',
    fontSize: 14,
    marginBottom: 24,
  },
  description: {
    color: '#7A6A62',
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
    color: '#7A6A62',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.2,
    marginBottom: 8,
    marginLeft: 4,
  },
  sectionBody: {
    color: '#7A6A62',
    fontSize: 14,
    lineHeight: 22,
    backgroundColor: '#F2EDE8',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E8E0D8',
  },
  citationCard: {
    backgroundColor: '#F2EDE8',
    borderRadius: 14,
    padding: 16,
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#5A8A5A',
    borderWidth: 1,
    borderColor: '#E8E0D8',
  },
  citationFinding: {
    color: '#2C2420',
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
    color: '#7A6A62',
    fontSize: 11,
    flex: 1,
    marginRight: 8,
  },
  citationPmid: {
    color: '#4A7A9B',
    fontSize: 11,
    fontWeight: '700',
  },
  citationDisclaimer: {
    color: '#B0A098',
    fontSize: 11,
    lineHeight: 16,
    fontStyle: 'italic',
    marginTop: 4,
    textAlign: 'center',
  },
  featuresList: {
    backgroundColor: '#F2EDE8',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E8E0D8',
  },
  featureItem: {
    color: '#7A6A62',
    fontSize: 13,
    lineHeight: 22,
  },
  footer: {
    color: '#B0A098',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
    marginTop: 16,
  },
});
