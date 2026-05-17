import { useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getDb } from '../db/schema';

const QUESTIONS = [
  'My healthcare providers communicate well with each other about my care.',
  'I feel like one person is coordinating my overall MS care.',
  'I receive consistent information from all my healthcare providers.',
  'My care feels well-organized and planned.',
  'I feel informed about all my treatment options.',
  'My healthcare team listens to my concerns and preferences.',
  'I can easily access the care I need when I need it.',
  'Overall, I feel well-supported in managing my MS.',
];

export default function CareSurveyScreen({ onClose }: { onClose?: () => void }) {
  const [answers, setAnswers] = useState<(number | null)[]>(Array(8).fill(null));
  const [submitted, setSubmitted] = useState(false);
  const [total, setTotal] = useState(0);

  const setAnswer = (qIdx: number, score: number) => {
    setAnswers((prev) => {
      const next = [...prev];
      next[qIdx] = score;
      return next;
    });
  };

  const allAnswered = answers.every((a) => a !== null);

  const handleSubmit = async () => {
    if (!allAnswered) return;
    const sum = answers.reduce<number>((acc, a) => acc + (a ?? 0), 0);
    const today = new Date().toISOString().split('T')[0];
    const db = await getDb();
    await db.runAsync(
      'INSERT INTO care_surveys (date, scores_json, total) VALUES (?, ?, ?)',
      [today, JSON.stringify(answers), sum]
    );
    await AsyncStorage.setItem('last_care_survey_date', today);
    setTotal(sum);
    setSubmitted(true);
  };

  const getInterpretation = (score: number) => {
    if (score >= 35) return { label: 'Excellent coordination', color: '#22c55e' };
    if (score >= 25) return { label: 'Good coordination', color: '#22c55e' };
    if (score >= 15) return { label: 'Moderate coordination', color: '#eab308' };
    return { label: 'Room for improvement', color: '#ef4444' };
  };

  if (submitted) {
    const { label, color } = getInterpretation(total);
    return (
      <View style={styles.container}>
        <View style={styles.resultCard}>
          <Text style={styles.resultTitle}>Survey Complete</Text>
          <Text style={styles.resultScore}>{total}<Text style={styles.resultScoreMax}>/40</Text></Text>
          <Text style={[styles.resultLabel, { color }]}>{label}</Text>
          <Text style={styles.resultNote}>Higher scores indicate better coordinated care. Share this with your neurologist.</Text>
          <TouchableOpacity style={styles.doneButton} onPress={onClose}>
            <Text style={styles.doneButtonText}>Done</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <Text style={styles.heading}>Care Coordination Survey</Text>
      <Text style={styles.subtitle}>ICES-MS validated scale · 8 questions · 2 minutes</Text>

      {QUESTIONS.map((q, qIdx) => (
        <View key={qIdx} style={styles.questionCard}>
          <Text style={styles.questionNumber}>Q{qIdx + 1}</Text>
          <Text style={styles.questionText}>{q}</Text>
          <View style={styles.scaleRow}>
            {[1, 2, 3, 4, 5].map((score) => {
              const selected = answers[qIdx] === score;
              return (
                <TouchableOpacity
                  key={score}
                  style={[styles.scaleCircle, selected ? styles.scaleCircleSelected : null]}
                  onPress={() => setAnswer(qIdx, score)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.scaleText, selected ? styles.scaleTextSelected : null]}>{score}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <View style={styles.scaleLabels}>
            <Text style={styles.scaleLabel}>Disagree</Text>
            <Text style={styles.scaleLabel}>Agree</Text>
          </View>
        </View>
      ))}

      <TouchableOpacity
        style={[styles.submitButton, !allAnswered ? styles.submitButtonDisabled : null]}
        onPress={handleSubmit}
        disabled={!allAnswered}
        activeOpacity={0.8}
      >
        <Text style={styles.submitButtonText}>Submit Survey</Text>
      </TouchableOpacity>

      {onClose ? (
        <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d0d0d' },
  content: { paddingTop: 60, paddingHorizontal: 20, paddingBottom: 48 },
  heading: { color: '#ffffff', fontSize: 24, fontWeight: '800', marginBottom: 6 },
  subtitle: { color: '#888888', fontSize: 13, marginBottom: 24, lineHeight: 18 },
  questionCard: { backgroundColor: '#1a1a1a', borderRadius: 12, padding: 16, marginBottom: 12 },
  questionNumber: { color: '#22c55e', fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: 6 },
  questionText: { color: '#ffffff', fontSize: 14, lineHeight: 20, marginBottom: 14 },
  scaleRow: { flexDirection: 'row', justifyContent: 'space-between' },
  scaleCircle: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, borderColor: '#333', alignItems: 'center', justifyContent: 'center' },
  scaleCircleSelected: { backgroundColor: '#22c55e', borderColor: '#22c55e' },
  scaleText: { color: '#888888', fontSize: 15, fontWeight: '600' },
  scaleTextSelected: { color: '#0d0d0d', fontWeight: '700' },
  scaleLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  scaleLabel: { color: '#555555', fontSize: 10 },
  submitButton: { backgroundColor: '#22c55e', borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginTop: 8 },
  submitButtonDisabled: { opacity: 0.4 },
  submitButtonText: { color: '#0d0d0d', fontSize: 16, fontWeight: '800' },
  cancelButton: { alignItems: 'center', paddingVertical: 16 },
  cancelText: { color: '#555555', fontSize: 14 },
  resultCard: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  resultTitle: { color: '#888888', fontSize: 13, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 16 },
  resultScore: { color: '#ffffff', fontSize: 64, fontWeight: '800', lineHeight: 72 },
  resultScoreMax: { color: '#555555', fontSize: 32 },
  resultLabel: { fontSize: 16, fontWeight: '600', marginTop: 8, marginBottom: 16 },
  resultNote: { color: '#888888', fontSize: 13, textAlign: 'center', lineHeight: 20, marginBottom: 32 },
  doneButton: { backgroundColor: '#22c55e', borderRadius: 12, paddingVertical: 14, paddingHorizontal: 48 },
  doneButtonText: { color: '#0d0d0d', fontSize: 16, fontWeight: '800' },
});
