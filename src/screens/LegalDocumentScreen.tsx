import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { useLanguage } from '../i18n';
import { impressum, privacyPolicy, type LegalDocument } from '../config/legal';
import { space, text as T, themed, useTheme } from '../theme';

/**
 * Renders one of the two legal documents from `src/config/legal.ts`.
 *
 * Offline on purpose. § 5 DDG wants the provider details reachable in at most
 * two steps and readable without a network, and a health app whose privacy
 * policy is a link is useless in the one place a patient is most likely to
 * check it. So this is bundled text, not a WebView — no fetch, no URL, nothing
 * to fail.
 *
 * Both documents share this screen because they share a shape: title, optional
 * intro, headed sections of paragraphs, a date. Giving each its own component
 * would mean two places to keep the type scale in step.
 */

interface Props {
  document: LegalDocument;
}

function LegalDocumentView({ document }: Props) {
  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.title}>{document.title}</Text>
      {document.intro ? <Text style={styles.intro}>{document.intro}</Text> : null}

      {document.sections.map((section) => (
        <View key={section.heading} style={styles.section}>
          <Text style={styles.heading}>{section.heading}</Text>
          {section.body.map((paragraph, i) => (
            // Paragraphs are fixed prose in a fixed order, so the index is a
            // stable identity here — nothing is inserted, removed or reordered
            // at runtime.
            <Text key={i} style={styles.paragraph} selectable>
              {paragraph}
            </Text>
          ))}
        </View>
      ))}

      <Text style={styles.updated}>{document.updated}</Text>
    </ScrollView>
  );
}

export function ImpressumScreen() {
  const language = useLanguage();
  useTheme();
  return <LegalDocumentView document={impressum(language)} />;
}

export function PrivacyPolicyScreen() {
  const language = useLanguage();
  useTheme();
  return <LegalDocumentView document={privacyPolicy(language)} />;
}

const styles = themed((C) => StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  content: {
    paddingTop: space.xl,
    paddingHorizontal: space.lg,
    paddingBottom: space.xxxl,
  },

  title: { ...T.heading, color: C.text },
  intro: {
    ...T.body,
    color: C.textSub,
    lineHeight: 22,
    marginTop: space.sm,
  },

  section: { marginTop: space.xl },
  heading: { ...T.subheading, color: C.text, marginBottom: space.sm },
  paragraph: {
    ...T.body,
    color: C.textSub,
    lineHeight: 22,
    marginBottom: space.sm,
  },

  updated: {
    ...T.small,
    color: C.textMuted,
    marginTop: space.xxl,
  },
}));
