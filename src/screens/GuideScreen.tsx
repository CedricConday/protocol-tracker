import { ScrollView, StyleSheet, Text, View } from 'react-native';

const SECTIONS = [
  {
    title: 'Daily Water',
    body: 'Minimum 2.5 L per day. Track with the water counter.',
  },
  {
    title: 'Diet',
    body: 'No dairy, no sardines, no calcium-rich foods. Low-calcium diet is mandatory.',
  },
  {
    title: 'Sun Exposure',
    body: 'Daily sun exposure without sunscreen when possible (Vitamin D synthesis).',
  },
  {
    title: 'Exercise',
    body: '30 minutes walking daily. Avoid intense exercise — no heavy weights, no running.',
  },
  {
    title: 'Supplements',
    body: 'Take all supplements at the times shown in the schedule. Never skip D3.',
  },
  {
    title: 'Warning Signs',
    body: 'Kidney stone symptoms: flank pain, blood in urine. Contact your prescriber immediately.',
  },
];

export default function GuideScreen() {
  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.heading}>Coimbra Protocol Guide</Text>

      {SECTIONS.map((section, i) => (
        <View key={i} style={styles.card}>
          <Text style={styles.cardTitle}>{section.title}</Text>
          <Text style={styles.cardBody}>{section.body}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0d0d0d',
  },
  content: {
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  heading: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 20,
  },
  card: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  cardTitle: {
    color: '#22c55e',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 6,
  },
  cardBody: {
    color: '#cccccc',
    fontSize: 14,
    lineHeight: 20,
  },
});
