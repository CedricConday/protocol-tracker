import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { getDb } from '../db/schema';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getDaySummary, getJournalEntry, getRecentJournalEntries, getSemanticJournalSummary, todayStr, upsertJournalEntry, getMiscFlag, setMiscFlag } from '../db/queries';
import type { JournalEntry } from '../types';
import { t } from '../i18n';
import { useJournalScreen } from '../hooks';
import EmptyState from '../components/EmptyState';

const MOODS = [
  { emoji: '😄', label: 'Great' },
  { emoji: '🙂', label: 'Good' },
  { emoji: '😐', label: 'Okay' },
  { emoji: '😔', label: 'Rough' },
  { emoji: '😞', label: 'Struggling' },
];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return `${days[d.getDay()]} ${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

function complianceBadgeColor(pct: number): string {
  if (pct >= 80) return '#22c55e';
  if (pct >= 50) return '#eab308';
  return '#ef4444';
}

export default function JournalScreen() {
  const navigation = useNavigation<any>();
  const {
    refreshing, setRefreshing, summary, pastEntries, loadedMood, existingNote,
    semanticSummary, weekMoods, loadData,
  } = useJournalScreen();
  const [note, setNote] = useState('');
  const [dietaryNote, setDietaryNote] = useState('');
  const [selectedMood, setSelectedMood] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [cbtModal, setCbtModal] = useState(false);
  const [cbtMessage, setCbtMessage] = useState('');
  const noteRef = useRef<TextInput>(null);
  const today = todayStr();

  useEffect(() => {
    if (loadedMood !== null) {
      setSelectedMood(loadedMood);
      setNote(existingNote);
    }
  }, [loadedMood, existingNote]);

  useEffect(() => {
    getDb().then(async (db) => {
      const row = await db.getFirstAsync<{ dietary_note: string }>('SELECT dietary_note FROM journal_entries WHERE date = ?', [today]);
      if (row?.dietary_note) setDietaryNote(row.dietary_note);
    });
  }, [today]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const checkFatigueSpike = useCallback(async (currentMood: string) => {
    const currentIdx = MOODS.findIndex((m) => m.label === currentMood || m.emoji === currentMood);
    if (currentIdx < 0) return;
    const recent = await getRecentJournalEntries(4);
    const threeDaysAgo = recent.find((e) => e.date !== today);
    if (!threeDaysAgo) return;
    const oldIdx = MOODS.findIndex((m) => m.label === threeDaysAgo.mood || m.emoji === threeDaysAgo.mood);
    if (oldIdx >= 0 && currentIdx - oldIdx >= 2) {
      await AsyncStorage.setItem('fatigue_alert_shown', today);
    }
  }, [today]);

  const CBT_MESSAGES: Record<string, string[]> = {
    gentle: [
      'Tough day. Take 3 slow breaths. What\'s one small thing you can control right now?',
      'This feeling will pass. Rest, hydrate, and give yourself grace.',
      'One minute of quiet. Close your eyes. Breathe. You\'ve got this.',
    ],
    direct: [
      'Pain ≥ 3 and mood ≤ 2. Reset: 3 deep breaths. Identify one actionable step.',
      'Your data shows a rough patch. Pause. Breathe. What needs adjusting?',
      'Distress detected. Use the 3-breath reset. Then move forward.',
    ],
    motivational: [
      'Tough day? Take 3 breaths. You\'re stronger than this moment. One step at a time.',
      'You\'ve handled hard days before. 3 breaths. Reset. Next win coming.',
      'This is temporary. 3 deep breaths. Your streak of showing up matters.',
    ],
  };

  const handleSave = useCallback(async () => {
    if (!selectedMood) return;
    await upsertJournalEntry({
      date: today,
      mood: selectedMood,
      note,
      dietary_note: dietaryNote || undefined,
      compliance_pct: summary.totalDoses > 0
        ? Math.round((summary.takenDoses / summary.totalDoses) * 100)
        : 0,
      doses_taken: summary.takenDoses,
      doses_total: summary.totalDoses,
    });
    await checkFatigueSpike(selectedMood);

    // Micro-CBT trigger: pain ≥ 3 AND mood ≤ 2 (mood emoji index >= 3)
    const moodIdx = MOODS.findIndex((m) => m.emoji === selectedMood);
    if (moodIdx >= 3) {
      const style = await getMiscFlag('coaching_style') || 'gentle';
      const messages = CBT_MESSAGES[style] || CBT_MESSAGES.gentle;
      const lastIdx = parseInt(await getMiscFlag('cbt_last_index') || '-1', 10);
      const nextIdx = (lastIdx + 1) % messages.length;
      await setMiscFlag('cbt_last_index', String(nextIdx));
      setCbtMessage(messages[nextIdx]);
      setCbtModal(true);
    }

    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    await loadData();
  }, [selectedMood, note, dietaryNote, summary, today, checkFatigueSpike, loadData]);

  const handleBlur = useCallback(() => {
    if (selectedMood) {
      handleSave();
    }
  }, [selectedMood, handleSave]);

  const handleMoodSelect = (mood: string) => {
    setSelectedMood(mood);
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#C96A50" />
      }
    >
      <View style={styles.headingRow}>
        <Text style={styles.heading}>Journal</Text>
        <TouchableOpacity style={styles.logEventBtn} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); navigation.navigate('Relapse'); }} activeOpacity={0.7} accessibilityLabel="Log a relapse or medical event" accessibilityRole="button">
          <Text style={styles.logEventBtnText}>+ Log Event</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.dateSubtitle}>{formatDateLabel(today)}</Text>

      {/* Semantic memory summary */}
      <Text style={styles.semanticSummary}>{semanticSummary}</Text>

      {/* Mood this week */}
      <Text style={styles.sectionTitle}>{t('thisWeek')}</Text>
      <View style={styles.weekRow}>
        {weekMoods.map((w, i) => {
          const dotColor = w.compliancePct >= 80 ? '#22c55e' : w.compliancePct >= 50 ? '#eab308' : '#ef4444';
          return (
            <View key={i} style={styles.weekDayCol}>
              <View style={[styles.weekDayCircle, !w.emoji ? styles.weekDayEmpty : null]}>
                <Text style={styles.weekDayEmoji}>{w.emoji ?? '—'}</Text>
              </View>
              <View style={[styles.weekDot, { backgroundColor: dotColor }]} />
              <Text style={styles.weekDayLabel}>{w.day}</Text>
            </View>
          );
        })}
      </View>

      <Text style={styles.sectionTitle}>{t('howAreYou')}</Text>
      <View style={styles.moodRow}>
        {MOODS.map((m) => {
          const isSelected = selectedMood === m.emoji;
          return (
            <TouchableOpacity
              key={m.emoji}
              style={[
                styles.moodButton,
                isSelected ? styles.moodSelected : styles.moodUnselected,
              ]}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); handleMoodSelect(m.emoji); }}
              activeOpacity={0.7}
              accessibilityLabel={`Select mood ${m.label}`}
              accessibilityRole="button"
            >
              <Text style={[styles.moodEmoji, isSelected ? styles.moodEmojiSelected : null]}>
                {m.emoji}
              </Text>
              <Text style={[styles.moodLabel, isSelected ? styles.moodLabelSelected : null]}>
                {m.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <TextInput
        ref={noteRef}
        style={styles.noteInput}
        placeholder="How are you feeling today?"
        placeholderTextColor="#B0A098"
        multiline
        value={note}
        onChangeText={setNote}
        onBlur={handleBlur}
      />

      <TextInput
        style={styles.dietaryInput}
        placeholder="Any dairy, calcium supplements, or protocol deviations today?"
        placeholderTextColor="#B0A098"
        value={dietaryNote}
        onChangeText={setDietaryNote}
      />

      <Text style={styles.complianceLine}>
        You've taken {summary.takenDoses} of {summary.totalDoses} doses today
      </Text>

      <TouchableOpacity
        style={[
          styles.saveButton,
          (selectedMood === null) ? styles.saveButtonDisabled : null,
        ]}
        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); handleSave().then(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)); }}
        disabled={selectedMood === null}
        activeOpacity={0.8}
        accessibilityLabel={saved ? 'Journal entry saved' : 'Save journal entry'}
        accessibilityRole="button"
      >
        <Text style={[
          styles.saveButtonText,
          saved ? styles.saveButtonTextSaved : null,
        ]}>
          {saved ? 'Saved ✓' : 'Save Entry'}
        </Text>
      </TouchableOpacity>

      <Text style={styles.sectionTitle}>This Week</Text>
      {pastEntries.length === 0 ? (
        <EmptyState
          icon="📓"
          title="No journal entries yet"
          subtitle="Log your mood and how you feel each day. Patterns emerge over time."
        />
      ) : (
        pastEntries.map((entry) => {
          const isExpanded = expandedId === entry.id;
          return (
            <TouchableOpacity
              key={entry.id}
              style={styles.entryCard}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setExpandedId(isExpanded ? null : entry.id); }}
              activeOpacity={0.7}
              accessibilityLabel={isExpanded ? `Collapse entry from ${entry.date}` : `Expand entry from ${entry.date}`}
              accessibilityRole="button"
            >
              <View style={styles.entryTop}>
                <Text style={styles.entryMood}>{entry.mood}</Text>
                <Text style={styles.entryDate}>{formatDateLabel(entry.date)}</Text>
                <View style={[styles.complianceBadge, { backgroundColor: complianceBadgeColor(entry.compliance_pct) + '30' }]}>
                  <Text style={[styles.complianceBadgeText, { color: complianceBadgeColor(entry.compliance_pct) }]}>
                    {entry.compliance_pct}%
                  </Text>
                </View>
              </View>
              {isExpanded && entry.note ? (
                <Text style={styles.entryNote}>{entry.note}</Text>
              ) : null}
            </TouchableOpacity>
          );
        })
      )}

      <Modal visible={cbtModal} transparent animationType="fade" onRequestClose={() => setCbtModal(false)}>
        <View style={styles.cbtOverlay}>
          <View style={styles.cbtModal}>
            <Text style={styles.cbtTitle}>Tough day. Try this:</Text>
            <Text style={styles.cbtMessage}>{cbtMessage}</Text>
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 20 }}>
              <TouchableOpacity style={styles.cbtSkip} onPress={() => setCbtModal(false)} activeOpacity={0.7} accessibilityLabel="Skip CBT suggestion" accessibilityRole="button">
                <Text style={styles.cbtSkipText}>Skip</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.cbtDone} onPress={() => setCbtModal(false)} activeOpacity={0.8} accessibilityLabel="Dismiss CBT suggestion" accessibilityRole="button">
                <Text style={styles.cbtDoneText}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAF7F4',
  },
  content: {
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  headingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  heading: {
    color: '#2C2420',
    fontSize: 22,
    fontWeight: '700',
  },
  logEventBtn: { backgroundColor: '#F2EDE8', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1, borderColor: '#C04040' },
  logEventBtnText: { color: '#C04040', fontSize: 14, fontWeight: '600' },
  dateSubtitle: {
    color: '#7A6A62',
    fontSize: 14,
    marginBottom: 24,
  },
  sectionTitle: {
    color: '#7A6A62',
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.1,
    marginBottom: 10,
    marginTop: 24,
  },
  moodRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
    height: 64,
    alignItems: 'center',
  },
  moodButton: {
    alignItems: 'center',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 8,
    minWidth: 58,
  },
  moodUnselected: {
    backgroundColor: '#F2EDE8',
  },
  moodSelected: {
    backgroundColor: '#FBF0ED',
    borderWidth: 2,
    borderColor: '#C96A50',
  },
  moodEmoji: {
    fontSize: 24,
    marginBottom: 4,
  },
  moodEmojiSelected: {
    transform: [{ scale: 1.2 }],
  },
  moodLabel: {
    fontSize: 10,
    color: '#7A6A62',
    fontWeight: '600',
  },
  moodLabelSelected: {
    color: '#C96A50',
  },
  noteInput: {
    backgroundColor: '#F2EDE8',
    color: '#2C2420',
    borderRadius: 14,
    padding: 16,
    minHeight: 120,
    fontSize: 16,
    lineHeight: 24,
    textAlignVertical: 'top',
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#D8CFC8',
  },
  complianceLine: {
    color: '#7A6A62',
    fontSize: 13,
    fontStyle: 'italic',
    marginBottom: 16,
  },
  saveButton: {
    backgroundColor: '#C96A50',
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 24,
  },
  saveButtonDisabled: {
    opacity: 0.4,
  },
  saveButtonText: {
    color: '#FAF7F4',
    fontSize: 16,
    fontWeight: '700',
  },
  saveButtonTextSaved: {
    color: '#FAF7F4',
  },
  emptyText: {
    color: '#B0A098',
    fontSize: 15,
    textAlign: 'center',
    marginTop: 20,
  },
  entryCard: {
    backgroundColor: '#F2EDE8',
    borderRadius: 14,
    padding: 16,
    marginBottom: 8,
  },
  entryTop: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  entryMood: {
    fontSize: 28,
    marginRight: 12,
  },
  entryDate: {
    color: '#2C2420',
    fontSize: 15,
    fontWeight: '600',
    flex: 1,
  },
  complianceBadge: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  complianceBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  entryNote: {
    color: '#7A6A62',
    fontSize: 15,
    marginTop: 10,
    lineHeight: 22,
  },
  dietaryInput: {
    backgroundColor: '#F2EDE8',
    color: '#2C2420',
    borderRadius: 10,
    padding: 14,
    fontSize: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#D8CFC8',
  },
  cbtOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 32 },
  cbtModal: { backgroundColor: '#FAF7F4', borderRadius: 20, padding: 28, alignItems: 'center' },
  cbtTitle: { color: '#2C2420', fontSize: 18, fontWeight: '800', marginBottom: 12, textAlign: 'center' },
  cbtMessage: { color: '#7A6A62', fontSize: 15, lineHeight: 24, textAlign: 'center' },
  cbtSkip: { flex: 1, borderRadius: 10, borderWidth: 1, borderColor: '#D8CFC8', paddingVertical: 12, alignItems: 'center' },
  cbtSkipText: { color: '#7A6A62', fontSize: 15, fontWeight: '600' },
  cbtDone: { flex: 1, backgroundColor: '#22c55e', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  cbtDoneText: { color: '#FAF7F4', fontSize: 15, fontWeight: '800' },
  semanticSummary: {
    color: '#7A6A62',
    fontSize: 14,
    fontStyle: 'italic',
    lineHeight: 22,
    marginBottom: 20,
    backgroundColor: '#F2EDE8',
    borderRadius: 14,
    padding: 16,
  },
  weekRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  weekDayCol: {
    alignItems: 'center',
    gap: 4,
  },
  weekDayCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F2EDE8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekDayEmpty: {
    borderWidth: 1,
    borderColor: '#D8CFC8',
  },
  weekDayEmoji: {
    fontSize: 16,
  },
  weekDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  weekDayLabel: {
    color: '#B0A098',
    fontSize: 10,
    fontWeight: '600',
  },
});
