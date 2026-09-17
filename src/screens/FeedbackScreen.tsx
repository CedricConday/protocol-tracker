import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Linking,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { getDb } from '../db/schema';
import { FEEDBACK_EMAIL, FEEDBACK_WHATSAPP, hasWhatsApp } from '../config/links';

import { t, useLanguage } from '../i18n';
export default function FeedbackScreen() {
  useLanguage(); // re-render this screen when the language changes
  const navigation = useNavigation();
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  /**
   * Both routes are a hand-off, never a post.
   *
   * The message is written to the local `feedback` table first and then given
   * to an app the user already controls — their mail client or WhatsApp — so
   * nothing leaves the device unless they press send there, and there is no
   * cleartext endpoint for iOS App Transport Security to block. WhatsApp is the
   * second route because mail is not how a lot of people write to anyone any
   * more; it changes who the message travels through, not what the app sends.
   */
  async function handleSubmit(channel: 'email' | 'whatsapp') {
    if (!message.trim()) {
      Alert.alert(t('fbRequired'), t('fbRequiredBody'));
      return;
    }
    setSubmitting(true);
    try {
      const db = await getDb();
      await db.runAsync(
        `INSERT INTO feedback (type, message, email) VALUES (?, ?, ?)`,
        ['Feedback', message.trim(), ''],
      );

      const body = message.trim();
      const url =
        channel === 'email'
          ? `mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent(t('fbEmailSubject'))}` +
            `&body=${encodeURIComponent(body)}`
          : `https://wa.me/${FEEDBACK_WHATSAPP}?text=${encodeURIComponent(body)}`;

      if (!(await Linking.canOpenURL(url))) {
        // Say so rather than showing the thank-you screen. The old code fell
        // through to `done` whether or not anything opened, which told the user
        // their message was on its way when it had gone no further than the
        // local table — and a missing WhatsApp is ordinary, not an edge case.
        Alert.alert(t('errorTitle'), t('fbNoApp'));
        return;
      }

      await Linking.openURL(url);
      await db.runAsync(`UPDATE feedback SET sent = 1 WHERE id = last_insert_rowid()`);
      setDone(true);
    } catch (e) {
      Alert.alert(t('errorTitle'), t('fbSaveFailed'));
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.doneWrap}>
          <Ionicons name="checkmark-circle" size={64} color="#2F8F5B" />
          <Text style={styles.doneTitle}>{t('fbThanks')}</Text>
          <Text style={styles.doneSub}>{t('fbThanksBody')}</Text>
          <TouchableOpacity style={styles.doneBtn} onPress={() => navigation.goBack()} activeOpacity={0.8}>
            <Text style={styles.doneBtnText}>{t('fbBack')}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Text style={styles.sectionLabel}>{t('fbMessageLabel')}</Text>
          <TextInput
            style={styles.messageInput}
            placeholder={t('fbPlaceholder')}
            placeholderTextColor="#9AA3B2"
            multiline
            value={message}
            onChangeText={setMessage}
            autoFocus
          />

          <Text style={styles.privacyNote}>
            {t('fbNote')}
          </Text>

          <TouchableOpacity
            style={[styles.submitBtn, (!message.trim() || submitting) && styles.submitBtnDisabled]}
            onPress={() => handleSubmit('email')}
            disabled={!message.trim() || submitting}
            activeOpacity={0.8}
            accessibilityRole="button"
          >
            <Text style={styles.submitBtnText}>{submitting ? t('fbPreparing') : t('fbSendEmail')}</Text>
          </TouchableOpacity>

          {/* Disabled, with the reason on it, until FEEDBACK_WHATSAPP is a real
              number — the same stance links.ts takes on SUPPORT_URL. A button
              that opens a dead chat is worse than one that admits it is not
              wired up. */}
          <TouchableOpacity
            style={[styles.whatsappBtn, (!message.trim() || submitting || !hasWhatsApp()) && styles.submitBtnDisabled]}
            onPress={() => handleSubmit('whatsapp')}
            disabled={!message.trim() || submitting || !hasWhatsApp()}
            activeOpacity={0.8}
            accessibilityRole="button"
          >
            <Ionicons name="logo-whatsapp" size={18} color="#F7F7F2" />
            <Text style={styles.whatsappBtnText}>
              {hasWhatsApp() ? t('fbSendWhatsApp') : t('fbWhatsAppUnset')}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F7F2' },
  scroll: { padding: 24, paddingBottom: 60 },
  sectionLabel: { color: '#5A6478', fontSize: 13, fontWeight: '600', letterSpacing: 0.2, marginBottom: 10, marginTop: 20 },
  messageInput: {
    backgroundColor: '#ECEDE6', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#CFD2C6',
    color: '#14213D', fontSize: 15, minHeight: 140, textAlignVertical: 'top',
  },
  privacyNote: { color: '#9AA3B2', fontSize: 12, lineHeight: 18, marginTop: 16 },
  submitBtn: {
    backgroundColor: '#1B58B8', borderRadius: 10, paddingVertical: 16,
    alignItems: 'center', marginTop: 28,
  },
  submitBtnDisabled: { opacity: 0.4 },
  whatsappBtn: {
    backgroundColor: '#25D366', borderRadius: 10, paddingVertical: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 12,
  },
  whatsappBtnText: { color: '#F7F7F2', fontSize: 16, fontWeight: '800' },
  submitBtnText: { color: '#F7F7F2', fontSize: 16, fontWeight: '800' },
  doneWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  doneTitle: { color: '#14213D', fontSize: 24, fontWeight: '800', marginTop: 20 },
  doneSub: { color: '#5A6478', fontSize: 15, lineHeight: 22, textAlign: 'center', marginTop: 12 },
  doneBtn: { marginTop: 32, backgroundColor: '#1B58B8', borderRadius: 10, paddingVertical: 16, paddingHorizontal: 40 },
  doneBtnText: { color: '#F7F7F2', fontSize: 16, fontWeight: '700' },
});
