import { useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

const QUIZ = [
  {
    q: 'The Coimbra Protocol uses vitamin D doses that are 10–100× higher than standard RDAs.',
    answer: true,
    explanation: 'Protocol doses range from 40,000–100,000+ IU/day, far exceeding the standard 600–800 IU RDA. This is intentional and supervised.',
  },
  {
    q: 'You can take high-dose vitamin D without drinking extra water.',
    answer: false,
    explanation: 'High fluid intake (2.5L+/day) is mandatory to prevent hypercalciuria and protect kidney function on the Coimbra Protocol.',
  },
  {
    q: 'Magnesium is optional on the Coimbra Protocol.',
    answer: false,
    explanation: 'Magnesium is essential — high-dose D3 increases magnesium demand. Deficiency can cause muscle cramps and impair D3 metabolism.',
  },
  {
    q: 'Blood tests (PTH, calcium, creatinine) are required every 3 months on the protocol.',
    answer: true,
    explanation: 'Regular monitoring catches hypercalcemia and renal stress early. PTH should be low-normal; calcium within range.',
  },
  {
    q: 'Sunlight exposure is discouraged on the Coimbra Protocol.',
    answer: false,
    explanation: 'Sun exposure is encouraged — it produces a different form of vitamin D and supports overall protocol benefit.',
  },
  {
    q: 'The protocol was developed by Dr. Cicero Galli Coimbra in Brazil.',
    answer: true,
    explanation: 'Dr. Coimbra, a Brazilian neurologist, developed this high-dose vitamin D approach for autoimmune diseases including MS.',
  },
  {
    q: 'Dairy products can interfere with the protocol.',
    answer: true,
    explanation: 'Dairy raises calcium intake and should be minimised. Low-oxalate diet is standard to reduce stone risk.',
  },
  {
    q: 'Vitamin K2 helps direct calcium away from soft tissue and toward bones.',
    answer: true,
    explanation: 'K2 (MK-7 form) activates osteocalcin and matrix GLA protein, which help maintain calcium balance under high-dose D3.',
  },
];

interface Props { onClose: () => void }

export default function QuizScreen({ onClose }: Props) {
  const [current, setCurrent] = useState(0);
  const [selected, setSelected] = useState<boolean | null>(null);
  const [correct, setCorrect] = useState(0);
  const [done, setDone] = useState(false);

  const q = QUIZ[current];

  const handleAnswer = (val: boolean) => {
    if (selected !== null) return;
    setSelected(val);
    if (val === q.answer) setCorrect((c) => c + 1);
  };

  const handleNext = () => {
    if (current + 1 >= QUIZ.length) {
      setDone(true);
    } else {
      setCurrent((c) => c + 1);
      setSelected(null);
    }
  };

  if (done) {
    const pct = Math.round((correct / QUIZ.length) * 100);
    const color = pct >= 80 ? '#C96A50' : pct >= 50 ? '#eab308' : '#ef4444';
    return (
      <View style={[styles.container, styles.resultWrap]}>
        <Text style={styles.resultTitle}>Quiz Complete</Text>
        <Text style={[styles.resultScore, { color }]}>{correct}/{QUIZ.length}</Text>
        <Text style={[styles.resultPct, { color }]}>{pct}% correct</Text>
        <Text style={styles.resultSub}>
          {pct === 100 ? 'Perfect score! You know the protocol well.' : pct >= 75 ? 'Great knowledge. Review the explanations for anything you missed.' : 'Keep learning — the protocol details matter for safety.'}
        </Text>
        <TouchableOpacity style={styles.doneBtn} onPress={onClose} activeOpacity={0.8}>
          <Text style={styles.doneBtnText}>Done</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const isCorrect = selected === q.answer;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.progressRow}>
        {QUIZ.map((_, i) => (
          <View key={i} style={[styles.progressDot, i === current ? styles.progressDotActive : i < current ? styles.progressDotDone : null]} />
        ))}
      </View>
      <Text style={styles.counter}>{current + 1} / {QUIZ.length}</Text>

      <View style={styles.questionCard}>
        <Text style={styles.factOrMyth}>FACT OR MYTH?</Text>
        <Text style={styles.questionText}>{q.q}</Text>
      </View>

      <View style={styles.btnRow}>
        {([true, false] as const).map((val) => {
          let btnStyle = styles.answerBtn;
          let textStyle = styles.answerBtnText;
          if (selected !== null) {
            if (val === q.answer) {
              btnStyle = { ...btnStyle, ...styles.answerBtnCorrect };
              textStyle = { ...textStyle, color: '#C96A50' };
            } else if (val === selected && val !== q.answer) {
              btnStyle = { ...btnStyle, ...styles.answerBtnWrong };
              textStyle = { ...textStyle, color: '#ef4444' };
            }
          }
          return (
            <TouchableOpacity key={String(val)} style={btnStyle} onPress={() => handleAnswer(val)} activeOpacity={0.8}>
              <Text style={textStyle}>{val ? 'FACT' : 'MYTH'}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {selected !== null ? (
        <View style={[styles.explanationCard, isCorrect ? styles.explanationCorrect : styles.explanationWrong]}>
          <Text style={[styles.explanationVerdict, { color: isCorrect ? '#C96A50' : '#ef4444' }]}>
            {isCorrect ? 'Correct!' : 'Not quite.'}
          </Text>
          <Text style={styles.explanationText}>{q.explanation}</Text>
          <TouchableOpacity style={styles.nextBtn} onPress={handleNext} activeOpacity={0.8}>
            <Text style={styles.nextBtnText}>{current + 1 >= QUIZ.length ? 'See Results' : 'Next Question'}</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <TouchableOpacity style={styles.cancelBtn} onPress={onClose} activeOpacity={0.7}>
        <Text style={styles.cancelBtnText}>Exit Quiz</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAF7F4' },
  content: { padding: 24, paddingTop: 60, paddingBottom: 40 },
  resultWrap: { justifyContent: 'center', alignItems: 'center', padding: 40 },
  resultTitle: { color: '#7A6A62', fontSize: 13, fontWeight: '700', letterSpacing: 1, marginBottom: 12 },
  resultScore: { fontSize: 64, fontWeight: '900', marginBottom: 4 },
  resultPct: { fontSize: 20, fontWeight: '700', marginBottom: 16 },
  resultSub: { color: '#aaaaaa', fontSize: 14, textAlign: 'center', lineHeight: 22, marginBottom: 32 },
  progressRow: { flexDirection: 'row', gap: 6, marginBottom: 12 },
  progressDot: { flex: 1, height: 4, borderRadius: 2, backgroundColor: '#E8E0D8' },
  progressDotActive: { backgroundColor: '#C96A50' },
  progressDotDone: { backgroundColor: '#155724' },
  counter: { color: '#7A6A62', fontSize: 12, fontWeight: '600', marginBottom: 20 },
  questionCard: { backgroundColor: '#F2EDE8', borderRadius: 16, padding: 20, marginBottom: 20 },
  factOrMyth: { color: '#C96A50', fontSize: 11, fontWeight: '800', letterSpacing: 2, marginBottom: 12 },
  questionText: { color: '#FAF7F4', fontSize: 16, lineHeight: 24, fontWeight: '500' },
  btnRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  answerBtn: { flex: 1, backgroundColor: '#F2EDE8', borderRadius: 12, paddingVertical: 18, alignItems: 'center', borderWidth: 2, borderColor: '#E8E0D8' },
  answerBtnCorrect: { borderColor: '#C96A50', backgroundColor: '#FBF0ED' },
  answerBtnWrong: { borderColor: '#ef4444', backgroundColor: '#1a0a0a' },
  answerBtnText: { color: '#FAF7F4', fontSize: 16, fontWeight: '800' },
  explanationCard: { borderRadius: 12, padding: 16, marginBottom: 12, borderLeftWidth: 3 },
  explanationCorrect: { backgroundColor: '#0a1a0a', borderLeftColor: '#C96A50' },
  explanationWrong: { backgroundColor: '#1a0a0a', borderLeftColor: '#ef4444' },
  explanationVerdict: { fontSize: 14, fontWeight: '800', marginBottom: 8 },
  explanationText: { color: '#aaaaaa', fontSize: 13, lineHeight: 20, marginBottom: 16 },
  nextBtn: { backgroundColor: '#C96A50', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  nextBtnText: { color: '#FAF7F4', fontSize: 14, fontWeight: '800' },
  doneBtn: { backgroundColor: '#C96A50', borderRadius: 12, paddingVertical: 14, paddingHorizontal: 40 },
  doneBtnText: { color: '#FAF7F4', fontSize: 16, fontWeight: '800' },
  cancelBtn: { alignItems: 'center', paddingVertical: 12 },
  cancelBtnText: { color: '#7A6A62', fontSize: 13 },
});
