import { useState, useEffect } from 'react';
import {
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Alert,
} from 'react-native';
import { saveSleepCheckin, getLastSleepCheckin } from '../db/queries';

const QUESTIONS = [
  'Did you go to bed before midnight most nights this week?',
  'Did you avoid screens 30 min before bed?',
  'Did you get at least 7 hours most nights?',
  'Did you avoid caffeine after 3pm?',
  'Did you keep a consistent wake time?',
];

export default function SleepScreen() {
  const [answers, setAnswers] = useState<(boolean | null)[]>([null, null, null, null, null]);
  const [lastCheckin, setLastCheckin] = useState<string | null>(null);

  useEffect(() => {
    getLastSleepCheckin().then((row) => {
      if (row) setLastCheckin(row.date);
    });
  }, []);

  const score = answers.filter((a) => a === true).length;

  const getScoreFeedback = (): { text: string; color: string } => {
    if (score <= 2) return { text: 'Poor sleep worsens MS fatigue. Prioritise sleep hygiene this week.', color: '#ef4444' };
    if (score <= 4) return { text: 'Good progress. Small improvements compound over time.', color: '#eab308' };
    return { text: 'Excellent. Consistent sleep significantly reduces MS fatigue.', color: '#22c55e' };
  };

  const feedback = getScoreFeedback();

  const handleSubmit = async () => {
    const date = new Date().toISOString().split('T')[0];
    await saveSleepCheckin(date, score, JSON.stringify(answers));
    setLastCheckin(date);
    Alert.alert('Saved', 'Your sleep check-in has been recorded.');
  };

  const today = new Date().toISOString().split('T')[0];
  const alreadyDone = lastCheckin === today;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.heading}>Sleep Hygiene Scorecard</Text>
        <Text style={styles.subtitle}>Sunday weekly check-in</Text>

        {alreadyDone && (
          <View style={styles.doneBanner}>
            <Text style={styles.doneBannerText}>✓ You've completed this week's check-in.</Text>
          </View>
        )}

        {QUESTIONS.map((q, i) => (
          <View key={i} style={styles.questionCard}>
            <Text style={styles.questionText}>{q}</Text>
            <View style={styles.toggleRow}>
              <TouchableOpacity
                style={[styles.toggleBtn, answers[i] === true && styles.toggleBtnActive]}
                onPress={() => {
                  const next = [...answers];
                  next[i] = true;
                  setAnswers(next);
                }}
                activeOpacity={0.7}
              >
                <Text style={[styles.toggleBtnText, answers[i] === true && styles.toggleBtnTextActive]}>Yes</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.toggleBtn, answers[i] === false && styles.toggleBtnActive]}
                onPress={() => {
                  const next = [...answers];
                  next[i] = false;
                  setAnswers(next);
                }}
                activeOpacity={0.7}
              >
                <Text style={[styles.toggleBtnText, answers[i] === false && styles.toggleBtnTextActive]}>No</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}

        <View style={styles.scoreCard}>
          <Text style={styles.scoreLabel}>Your sleep score</Text>
          <Text style={[styles.scoreValue, { color: feedback.color }]}>{score}/5</Text>
          <Text style={[styles.scoreFeedback, { color: feedback.color }]}>{feedback.text}</Text>
        </View>

        <TouchableOpacity
          style={[styles.submitBtn, alreadyDone ? styles.submitBtnDisabled : null]}
          onPress={handleSubmit}
          disabled={alreadyDone}
          activeOpacity={0.8}
        >
          <Text style={styles.submitBtnText}>{alreadyDone ? 'Already checked in today' : 'Submit Check-in'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAF7F4' },
  content: { padding: 24, paddingTop: 60, paddingBottom: 40 },
  heading: { color: '#2C2420', fontSize: 24, fontWeight: '800', marginBottom: 4 },
  subtitle: { color: '#7A6A62', fontSize: 14, marginBottom: 24 },
  doneBanner: { backgroundColor: '#F0FDF4', borderRadius: 10, padding: 12, marginBottom: 16, borderWidth: 1, borderColor: '#22c55e' },
  doneBannerText: { color: '#166534', fontSize: 13, fontWeight: '600' },
  questionCard: { backgroundColor: '#F2EDE8', borderRadius: 14, padding: 16, marginBottom: 12 },
  questionText: { color: '#2C2420', fontSize: 15, fontWeight: '600', marginBottom: 12, lineHeight: 22 },
  toggleRow: { flexDirection: 'row', gap: 12 },
  toggleBtn: { flex: 1, borderRadius: 10, borderWidth: 1.5, borderColor: '#D8CFC8', paddingVertical: 10, alignItems: 'center' },
  toggleBtnActive: { borderColor: '#22c55e', backgroundColor: '#F0FDF4' },
  toggleBtnText: { color: '#B0A098', fontSize: 15, fontWeight: '700' },
  toggleBtnTextActive: { color: '#22c55e' },
  scoreCard: { backgroundColor: '#F2EDE8', borderRadius: 14, padding: 20, alignItems: 'center', marginBottom: 24 },
  scoreLabel: { color: '#7A6A62', fontSize: 14, marginBottom: 6 },
  scoreValue: { fontSize: 48, fontWeight: '800', marginBottom: 8 },
  scoreFeedback: { fontSize: 14, fontWeight: '600', textAlign: 'center', lineHeight: 22 },
  submitBtn: { backgroundColor: '#22c55e', borderRadius: 12, paddingVertical: 16, alignItems: 'center' },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText: { color: '#FAF7F4', fontSize: 16, fontWeight: '800' },
});
