import AsyncStorage from '@react-native-async-storage/async-storage';
import { useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

const MMAS_KEY = 'mmas8_last_date';

const QUESTIONS = [
  'Do you sometimes forget to take your supplements?',
  'Over the past two weeks, were there days when you did not take your supplements?',
  'Have you ever cut back or stopped taking your supplements without telling your doctor, because you felt worse when you took them?',
  'When you travel or leave home, do you sometimes forget to bring your supplements?',
  'Did you take all your supplements yesterday?',
  'When you feel like your condition is under control, do you sometimes stop taking your supplements?',
  'Taking supplements every day is a real inconvenience for some people. Do you ever feel hassled about sticking to your treatment plan?',
  'How often do you have difficulty remembering to take all your supplements?',
];

const Q8_OPTIONS = ['Never/Rarely', 'Once in a while', 'Sometimes', 'Usually', 'Always'];

function calcScore(answers: (boolean | null)[], q8: number | null): number {
  let score = 0;
  for (let i = 0; i < 7; i++) {
    const a = answers[i];
    if (i === 4) {
      // Q5 is reversed: YES = good
      if (a === true) score += 1;
    } else {
      if (a === false) score += 1;
    }
  }
  // Q8: Never/Rarely = 1 point
  if (q8 === 0) score += 1;
  return score;
}

function interpretScore(score: number): { label: string; color: string; detail: string } {
  if (score === 8) return { label: 'High Adherence', color: '#22c55e', detail: 'Excellent — you are consistently following your protocol.' };
  if (score >= 6) return { label: 'Medium Adherence', color: '#eab308', detail: 'Some lapses noted. Review what causes missed doses.' };
  return { label: 'Low Adherence', color: '#ef4444', detail: 'Significant gaps in your protocol. Consider discussing with your doctor.' };
}

interface Props { onClose: () => void }

export default function MmasScreen({ onClose }: Props) {
  const [answers, setAnswers] = useState<(boolean | null)[]>(Array(7).fill(null));
  const [q8, setQ8] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [score, setScore] = useState(0);

  const allAnswered = answers.every((a) => a !== null) && q8 !== null;

  const handleSubmit = async () => {
    const s = calcScore(answers, q8);
    setScore(s);
    setSubmitted(true);
    await AsyncStorage.setItem(MMAS_KEY, new Date().toISOString().split('T')[0]);
  };

  if (submitted) {
    const { label, color, detail } = interpretScore(score);
    return (
      <View style={styles.container}>
        <View style={styles.resultCard}>
          <Text style={styles.resultTitle}>MMAS-8 Score</Text>
          <Text style={[styles.resultScore, { color }]}>{score}/8</Text>
          <Text style={[styles.resultLabel, { color }]}>{label}</Text>
          <Text style={styles.resultDetail}>{detail}</Text>
          <Text style={styles.resultDisclaimer}>MMAS-8 © Donald E. Morisky. For self-monitoring only — not a clinical diagnosis.</Text>
          <TouchableOpacity style={styles.doneBtn} onPress={onClose} activeOpacity={0.8}>
            <Text style={styles.doneBtnText}>Done</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <Text style={styles.heading}>MMAS-8 Adherence Check</Text>
      <Text style={styles.sub}>8 questions · ~2 minutes · Monthly self-assessment</Text>

      {QUESTIONS.slice(0, 7).map((q, i) => (
        <View key={i} style={styles.questionCard}>
          <Text style={styles.questionNum}>Q{i + 1}</Text>
          <Text style={styles.questionText}>{q}</Text>
          <View style={styles.yesNoRow}>
            {[true, false].map((val) => (
              <TouchableOpacity
                key={String(val)}
                style={[styles.yesNoBtn, answers[i] === val ? styles.yesNoBtnActive : null]}
                onPress={() => {
                  const next = [...answers];
                  next[i] = val;
                  setAnswers(next);
                }}
                activeOpacity={0.7}
              >
                <Text style={[styles.yesNoBtnText, answers[i] === val ? styles.yesNoBtnTextActive : null]}>
                  {val ? 'Yes' : 'No'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ))}

      <View style={styles.questionCard}>
        <Text style={styles.questionNum}>Q8</Text>
        <Text style={styles.questionText}>{QUESTIONS[7]}</Text>
        <View style={styles.optionsCol}>
          {Q8_OPTIONS.map((opt, i) => (
            <TouchableOpacity
              key={opt}
              style={[styles.optionBtn, q8 === i ? styles.optionBtnActive : null]}
              onPress={() => setQ8(i)}
              activeOpacity={0.7}
            >
              <Text style={[styles.optionText, q8 === i ? styles.optionTextActive : null]}>{opt}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <TouchableOpacity
        style={[styles.submitBtn, allAnswered ? null : styles.submitBtnDisabled]}
        onPress={handleSubmit}
        disabled={!allAnswered}
        activeOpacity={0.8}
      >
        <Text style={styles.submitBtnText}>Calculate Score</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.cancelBtn} onPress={onClose} activeOpacity={0.7}>
        <Text style={styles.cancelBtnText}>Cancel</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d0d0d' },
  content: { padding: 24, paddingTop: 60, paddingBottom: 40 },
  heading: { color: '#ffffff', fontSize: 22, fontWeight: '800', marginBottom: 6 },
  sub: { color: '#555555', fontSize: 13, marginBottom: 24 },
  questionCard: { backgroundColor: '#1a1a1a', borderRadius: 12, padding: 16, marginBottom: 12 },
  questionNum: { color: '#22c55e', fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: 6 },
  questionText: { color: '#ffffff', fontSize: 14, lineHeight: 20, marginBottom: 14 },
  yesNoRow: { flexDirection: 'row', gap: 10 },
  yesNoBtn: { flex: 1, borderRadius: 8, borderWidth: 1, borderColor: '#2a2a2a', paddingVertical: 10, alignItems: 'center' },
  yesNoBtnActive: { borderColor: '#22c55e', backgroundColor: '#0d2a1a' },
  yesNoBtnText: { color: '#555555', fontSize: 14, fontWeight: '600' },
  yesNoBtnTextActive: { color: '#22c55e' },
  optionsCol: { gap: 8 },
  optionBtn: { borderRadius: 8, borderWidth: 1, borderColor: '#2a2a2a', paddingVertical: 10, paddingHorizontal: 14 },
  optionBtnActive: { borderColor: '#22c55e', backgroundColor: '#0d2a1a' },
  optionText: { color: '#555555', fontSize: 14 },
  optionTextActive: { color: '#22c55e', fontWeight: '600' },
  submitBtn: { backgroundColor: '#22c55e', borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginBottom: 12 },
  submitBtnDisabled: { opacity: 0.4 },
  submitBtnText: { color: '#0d0d0d', fontSize: 16, fontWeight: '800' },
  cancelBtn: { alignItems: 'center', paddingVertical: 12 },
  cancelBtnText: { color: '#555555', fontSize: 14 },
  resultCard: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  resultTitle: { color: '#888888', fontSize: 13, fontWeight: '700', letterSpacing: 1, marginBottom: 12 },
  resultScore: { fontSize: 64, fontWeight: '900', marginBottom: 8 },
  resultLabel: { fontSize: 18, fontWeight: '700', marginBottom: 16 },
  resultDetail: { color: '#aaaaaa', fontSize: 14, textAlign: 'center', lineHeight: 22, marginBottom: 24 },
  resultDisclaimer: { color: '#444444', fontSize: 10, textAlign: 'center', marginBottom: 32, fontStyle: 'italic' },
  doneBtn: { backgroundColor: '#22c55e', borderRadius: 12, paddingVertical: 14, paddingHorizontal: 40 },
  doneBtnText: { color: '#0d0d0d', fontSize: 16, fontWeight: '800' },
});
