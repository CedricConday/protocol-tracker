import { useCallback, useEffect, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { getMiscFlag, setMiscFlag } from '../db/queries';

const STYLES = [
  { key: 'gentle', label: 'Gentle', desc: 'Soft reminders, positive framing, no pressure' },
  { key: 'direct', label: 'Direct', desc: 'Clear, factual, no fluff' },
  { key: 'motivational', label: 'Motivational', desc: 'Energy, streaks, achievement-focused' },
] as const;

export default function CoachingStyleScreen() {
  const [selected, setSelected] = useState<string>('gentle');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const v = await getMiscFlag('coaching_style');
    if (v) setSelected(v);
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const handleSelect = async (key: string) => {
    setSelected(key);
    await setMiscFlag('coaching_style', key);
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#C96A50" />}
    >
      <Text style={styles.heading}>Coaching Style</Text>
      <Text style={styles.subtitle}>Choose how the app talks to you about your protocol.</Text>

      {STYLES.map((s) => (
        <TouchableOpacity
          key={s.key}
          style={[styles.card, selected === s.key && styles.cardActive]}
          onPress={() => handleSelect(s.key)}
          activeOpacity={0.7}
        >
          <Text style={[styles.cardLabel, selected === s.key && styles.cardLabelActive]}>{s.label}</Text>
          <Text style={styles.cardDesc}>{s.desc}</Text>
        </TouchableOpacity>
      ))}

      <Text style={styles.note}>This affects how protocol tips and check-in messages are phrased throughout the app.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAF7F4' },
  content: { padding: 20, paddingTop: 60, paddingBottom: 40 },
  heading: { color: '#2C2420', fontSize: 24, fontWeight: '800', marginBottom: 4 },
  subtitle: { color: '#7A6A62', fontSize: 14, marginBottom: 20 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 14, padding: 18, marginBottom: 10, borderWidth: 2, borderColor: '#F0EDEA' },
  cardActive: { borderColor: '#22c55e', backgroundColor: '#F0FDF4' },
  cardLabel: { color: '#2C2420', fontSize: 16, fontWeight: '700', marginBottom: 4 },
  cardLabelActive: { color: '#166534' },
  cardDesc: { color: '#7A6A62', fontSize: 14, lineHeight: 20 },
  note: { color: '#B0A098', fontSize: 12, textAlign: 'center', marginTop: 20, fontStyle: 'italic' },
});
