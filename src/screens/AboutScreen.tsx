import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Application from 'expo-application';

import SunMascot from '../components/SunMascot';
import { t, useLanguage } from '../i18n';
import { C, space, radius, text as T } from '../theme';

/**
 * About.
 *
 * Rewritten 2026-09-16. Three things were wrong with it:
 *
 * 1. **It was English only.** Every string but the section heading was hardcoded,
 *    so a German user reached this screen and the app stopped speaking German.
 * 2. **It was off-brand.** A blue circle with a "C" in it — neither the sun
 *    mascot the rest of the app draws nor the CondayDigital mark. The colours
 *    were hardcoded hex that had drifted from the theme.
 * 3. **It promised features that do not exist.** The list advertised a dietary
 *    restriction guide, relapse and event logging, and a "mood journal with
 *    compliance correlation". `dietary`, `relapse` and `awareness` appear only
 *    in the schema and seed data — no screen reads them — and "correlation"
 *    appeared nowhere in the codebase except this file. The list below was
 *    rebuilt from the screens that actually ship.
 *
 * An About screen is the one place a patient goes to decide whether to trust the
 * app, so a feature it cannot deliver costs more here than anywhere else.
 */

// `aboutFeat6` — "MRI scans and lab results" — was removed on 2026-09-17 with
// the screens behind it. The doc above is the reason: this is where a patient
// decides whether to trust the app, so a line promising something it no longer
// does costs more here than anywhere else. The keys are names, not an ordering,
// so the rest keep theirs rather than shifting by one.
const FEATURES = [
  'aboutFeat1', 'aboutFeat2', 'aboutFeat3', 'aboutFeat4', 'aboutFeat5',
  'aboutFeat7', 'aboutFeat8', 'aboutFeat9', 'aboutFeat10',
] as const;

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
      <SunMascot size={72} />

      <Text style={styles.appName}>Protocol Tracker</Text>
      <Text style={styles.by}>{t('aboutBy')}</Text>
      <Text style={styles.version}>v{appVersion}</Text>

      <Text style={styles.description}>{t('aboutTagline')}</Text>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('aboutKeyFeatures')}</Text>
        <View style={styles.featuresList}>
          {FEATURES.map((key) => (
            <Text key={key} style={styles.featureItem}>{'·  '}{t(key)}</Text>
          ))}
        </View>
      </View>

      <Text style={styles.privacy}>{t('aboutPrivacy')}</Text>
      <Text style={styles.disclaimer}>{t('aboutDisclaimer')}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  content: {
    paddingTop: space.xxl,
    paddingHorizontal: space.lg,
    paddingBottom: space.xxxl,
    alignItems: 'center',
  },

  appName:     { ...T.heading, color: C.text, marginTop: space.md },
  by:          { ...T.small, color: C.primary, marginTop: 2 },
  version:     { ...T.small, color: C.textMuted, marginTop: 2, marginBottom: space.xl },
  description: { ...T.body, color: C.textSub, textAlign: 'center', lineHeight: 22, marginBottom: space.xl },

  section:      { alignSelf: 'stretch', marginBottom: space.xl },
  sectionTitle: { ...T.caps, color: C.textSub, marginBottom: space.md },
  featuresList: {
    backgroundColor: C.surface,
    borderRadius: radius.lg,
    padding: space.lg,
    gap: space.sm,
  },
  featureItem: { ...T.small, color: C.text, lineHeight: 20 },

  privacy:    { ...T.small, color: C.textSub, textAlign: 'center', lineHeight: 20, marginBottom: space.md },
  disclaimer: { ...T.small, color: C.textMuted, textAlign: 'center', lineHeight: 20 },
});
