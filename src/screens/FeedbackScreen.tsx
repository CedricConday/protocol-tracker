import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import {
  Alert,
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
import { useNavigation } from '@react-navigation/native';
import { getDb } from '../db/schema';

const TYPES = ['Bug', 'Suggestion', 'Praise', 'Question'] as const;
type FeedbackType = typeof TYPES[number];

const N8N_WEBHOOK = 'https://YOUR_N8N_INSTANCE/webhook/coimbra-feedback'; // activate when N8n is live

export default function FeedbackScreen() {
  const navigation = useNavigation();
  const [type, setType] = useState<FeedbackType>('Suggestion');
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit() {
    if (!message.trim()) {
      Alert.alert('Message required', 'Please write something before submitting.');
      return;
    }
    setSubmitting(true);
    try {
      const db = await getDb();
      await db.runAsync(
        `INSERT INTO feedback (type, message, email) VALUES (?, ?, ?)`,
        [type, message.trim(), email.trim()],
      );
      try {
        await fetch(N8N_WEBHOOK, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type, message: message.trim(), email: email.trim() }),
        });
        await db.runAsync(`UPDATE feedback SET sent = 1 WHERE id = last_insert_rowid()`);
      } catch {
        // webhook not yet live — stored locally, will be sent later
      }
      setDone(true);
    } catch (e) {
      Alert.alert('Error', 'Could not save feedback. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.doneWrap}>
          <Ionicons name="checkmark-circle" size={64} color="#22c55e" />
          <Text style={styles.doneTitle}>Thank you!</Text>
          <Text style={styles.doneSub}>Your feedback has been saved and will be reviewed by the team.</Text>
          <TouchableOpacity style={styles.doneBtn} onPress={() => navigation.goBack()} activeOpacity={0.8}>
            <Text style={styles.doneBtnText}>Back to Settings</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Text style={styles.sectionLabel}>TYPE</Text>
          <View style={styles.chipRow}>
            {TYPES.map((t) => (
              <TouchableOpacity
                key={t}
                style={[styles.chip, type === t && styles.chipActive]}
                onPress={() => setType(t)}
                activeOpacity={0.7}
              >
                <Text style={[styles.chipText, type === t && styles.chipTextActive]}>{t}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.sectionLabel}>MESSAGE</Text>
          <TextInput
            style={styles.messageInput}
            placeholder="What's on your mind?"
            placeholderTextColor="#444"
            multiline
            value={message}
            onChangeText={setMessage}
            autoFocus
          />

          <Text style={styles.sectionLabel}>EMAIL (optional)</Text>
          <TextInput
            style={styles.emailInput}
            placeholder="So we can follow up with you"
            placeholderTextColor="#444"
            keyboardType="email-address"
            autoCapitalize="none"
            value={email}
            onChangeText={setEmail}
          />

          <Text style={styles.privacyNote}>
            Feedback is stored on your device and forwarded to the development team. Your email is never shared.
          </Text>

          <TouchableOpacity
            style={[styles.submitBtn, (!message.trim() || submitting) && styles.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={!message.trim() || submitting}
            activeOpacity={0.8}
          >
            <Text style={styles.submitBtnText}>{submitting ? 'Sending…' : 'Send Feedback'}</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d0d0d' },
  scroll: { padding: 24, paddingBottom: 60 },
  sectionLabel: { color: '#555', fontSize: 11, fontWeight: '700', letterSpacing: 1.5, marginBottom: 10, marginTop: 20 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 4 },
  chip: { borderRadius: 20, borderWidth: 1.5, borderColor: '#2a2a2a', paddingVertical: 8, paddingHorizontal: 16 },
  chipActive: { borderColor: '#22c55e', backgroundColor: '#0d2a1a' },
  chipText: { color: '#555', fontSize: 14, fontWeight: '700' },
  chipTextActive: { color: '#22c55e' },
  messageInput: {
    backgroundColor: '#1a1a1a', borderRadius: 12, padding: 16,
    color: '#fff', fontSize: 15, minHeight: 140, textAlignVertical: 'top',
  },
  emailInput: {
    backgroundColor: '#1a1a1a', borderRadius: 12, padding: 16,
    color: '#fff', fontSize: 15, marginTop: 8,
  },
  privacyNote: { color: '#444', fontSize: 12, lineHeight: 18, marginTop: 16 },
  submitBtn: {
    backgroundColor: '#22c55e', borderRadius: 14, paddingVertical: 16,
    alignItems: 'center', marginTop: 28,
  },
  submitBtnDisabled: { backgroundColor: '#1a3a1a' },
  submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  doneWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  doneTitle: { color: '#fff', fontSize: 24, fontWeight: '800', marginTop: 20 },
  doneSub: { color: '#aaa', fontSize: 15, lineHeight: 22, textAlign: 'center', marginTop: 12 },
  doneBtn: { marginTop: 32, backgroundColor: '#22c55e', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 40 },
  doneBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
