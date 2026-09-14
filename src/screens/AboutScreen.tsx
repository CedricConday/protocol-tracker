import { useEffect, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Application from 'expo-application';

import { t, useLanguage } from '../i18n';
export default function AboutScreen() {
  useLanguage(); // re-render this screen when the language changes
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

      <Text style={styles.appName}>Protocol Tracker</Text>
      <Text style={styles.version}>v{appVersion}</Text>

      <Text style={styles.description}>
        A personal companion for patients following the Protocol.
        Track supplements, monitor compliance, manage events, and stay
        connected with your care plan.
      </Text>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('aboutKeyFeatures')}</Text>
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
    backgroundColor: '#F7F7F2',
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
    backgroundColor: '#1B58B8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoLetter: {
    color: '#F7F7F2',
    fontSize: 34,
    fontWeight: '900',
    lineHeight: 40,
  },
  appName: {
    color: '#14213D',
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 4,
  },
  version: {
    color: '#9AA3B2',
    fontSize: 14,
    marginBottom: 24,
  },
  description: {
    color: '#5A6478',
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
    color: '#5A6478',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.2,
    marginBottom: 8,
    marginLeft: 4,
  },
  sectionBody: {
    color: '#5A6478',
    fontSize: 14,
    lineHeight: 22,
    backgroundColor: '#ECEDE6',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#DBDDD3',
  },
  featuresList: {
    backgroundColor: '#ECEDE6',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#DBDDD3',
  },
  featureItem: {
    color: '#5A6478',
    fontSize: 13,
    lineHeight: 22,
  },
  footer: {
    color: '#9AA3B2',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
    marginTop: 16,
  },
});
