import { useCallback, useEffect, useState } from 'react';
import { C, themed, useTheme } from '../theme/colors';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { getMiscFlag, setMiscFlag } from '../db/queries';
import { t, useLanguage } from '../i18n';

// `key` is what goes in misc_flags and stays English; the label and the
// description are looked up at render so the switch takes effect immediately.
const STYLES = [
  { key: 'gentle', labelKey: 'coachGentle', descKey: 'coachGentleSub' },
  { key: 'direct', labelKey: 'coachDirect', descKey: 'coachDirectSub' },
  { key: 'motivational', labelKey: 'coachMotivational', descKey: 'coachMotivationalSub' },
] as const;

export default function CoachingStyleScreen() {
  useLanguage(); // re-render this screen when the language changes
  useTheme(); // ...and when the theme tier changes
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
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}
    >
      <Text style={styles.heading}>{t('coachingStyle')}</Text>
      <Text style={styles.subtitle}>{t('coachingStyleSub')}</Text>

      {STYLES.map((s) => (
        <TouchableOpacity
          key={s.key}
          style={[styles.card, selected === s.key && styles.cardActive]}
          onPress={() => handleSelect(s.key)}
          activeOpacity={0.7}
        >
          <Text style={[styles.cardLabel, selected === s.key && styles.cardLabelActive]}>{t(s.labelKey)}</Text>
          <Text style={styles.cardDesc}>{t(s.descKey)}</Text>
        </TouchableOpacity>
      ))}

      <Text style={styles.note}>{t('coachingStyleNote')}</Text>
    </ScrollView>
  );
}

const styles = themed((C) => StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  content: { padding: 20, paddingTop: 60, paddingBottom: 40 },
  heading: { color: C.text, fontSize: 24, fontWeight: '800', marginBottom: 4 },
  subtitle: { color: C.textSub, fontSize: 14, marginBottom: 20 },
  card: { backgroundColor: C.surface, borderRadius: 14, padding: 18, marginBottom: 10, borderWidth: 2, borderColor: C.border },
  cardActive: { borderColor: C.successBright, backgroundColor: C.successBg },
  cardLabel: { color: C.text, fontSize: 16, fontWeight: '700', marginBottom: 4 },
  cardLabelActive: { color: C.successInk },
  cardDesc: { color: C.textSub, fontSize: 14, lineHeight: 20 },
  note: { color: C.textMuted, fontSize: 12, textAlign: 'center', marginTop: 20, fontStyle: 'italic' },
}));
