import { useCallback, useEffect, useRef, useState } from 'react';
import {
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
import { getDaySummary, getJournalEntry, getRecentJournalEntries, getSemanticJournalSummary, todayStr, upsertJournalEntry } from '../db/queries';
import type { JournalEntry } from '../types';
import { t } from '../i18n';
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
  const [note, setNote] = useState('');
  const [selectedMood, setSelectedMood] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [summary, setSummary] = useState({ takenDoses: 0, totalDoses: 0 });
  const [pastEntries, setPastEntries] = useState<JournalEntry[]>([]);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [loadedMood, setLoadedMood] = useState<string | null>(null);
  const [semanticSummary, setSemanticSummary] = useState('');
  const [weekMoods, setWeekMoods] = useState<{ day: string; emoji: string | null; compliancePct: number }[]>([]);
  const noteRef = useRef<TextInput>(null);
  const today = todayStr();

  const loadData = useCallback(async () => {
    const daySummary = await getDaySummary(today);
    setSummary({ takenDoses: daySummary.takenDoses, totalDoses: daySummary.totalDoses });

    const existing = await getJournalEntry(today);
    if (existing) {
      setSelectedMood(existing.mood);
      setNote(existing.note);
      setLoadedMood(existing.mood);
    }

    const all = await getRecentJournalEntries(7);
    setPastEntries(all.filter((e) => e.date !== today));

    const summary = await getSemanticJournalSummary();
    setSemanticSummary(summary);

    // Build week mood data (last 7 days)
    const weekDays: { day: string; emoji: string | null; compliancePct: number }[] = [];
    const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const todayIdx = ((new Date().getDay() + 6) % 7);
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const entry = all.find((e) => e.date === dateStr);
      const summary = await getDaySummary(dateStr);
      weekDays.push({
        day: dayNames[(todayIdx - i + 7) % 7],
        emoji: entry?.mood ?? null,
        compliancePct: summary.compliancePct,
      });
    }
    setWeekMoods(weekDays);
  }, [today]);

  useEffect(() => {
    loadData();
  }, [loadData]);

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

  const handleSave = useCallback(async () => {
    if (!selectedMood) return;
    await upsertJournalEntry({
      date: today,
      mood: selectedMood,
      note,
      compliance_pct: summary.totalDoses > 0
        ? Math.round((summary.takenDoses / summary.totalDoses) * 100)
        : 0,
      doses_taken: summary.takenDoses,
      doses_total: summary.totalDoses,
    });
    await checkFatigueSpike(selectedMood);
    setSaved(true);
    setLoadedMood(selectedMood);
    setTimeout(() => setSaved(false), 2000);
    const all = await getRecentJournalEntries(7);
    setPastEntries(all.filter((e) => e.date !== today));
  }, [selectedMood, note, summary, today, checkFatigueSpike]);

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
        <TouchableOpacity style={styles.logEventBtn} onPress={() => navigation.navigate('Relapse')} activeOpacity={0.7}>
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
              onPress={() => handleMoodSelect(m.emoji)}
              activeOpacity={0.7}
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
        placeholderTextColor="#555555"
        multiline
        value={note}
        onChangeText={setNote}
        onBlur={handleBlur}
      />

      <Text style={styles.complianceLine}>
        You've taken {summary.takenDoses} of {summary.totalDoses} doses today
      </Text>

      <TouchableOpacity
        style={[
          styles.saveButton,
          (selectedMood === null) ? styles.saveButtonDisabled : null,
        ]}
        onPress={handleSave}
        disabled={selectedMood === null}
        activeOpacity={0.8}
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
              onPress={() => setExpandedId(isExpanded ? null : entry.id)}
              activeOpacity={0.7}
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
  logEventBtn: { backgroundColor: '#F2EDE8', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: '#C04040' },
  logEventBtnText: { color: '#C04040', fontSize: 13, fontWeight: '600' },
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
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 6,
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
    borderRadius: 12,
    padding: 14,
    minHeight: 120,
    fontSize: 15,
    lineHeight: 22,
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
    borderRadius: 12,
    paddingVertical: 14,
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
    fontSize: 14,
    textAlign: 'center',
    marginTop: 20,
  },
  entryCard: {
    backgroundColor: '#F2EDE8',
    borderRadius: 12,
    padding: 14,
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
    fontSize: 14,
    marginTop: 10,
    lineHeight: 20,
  },
  semanticSummary: {
    color: '#7A6A62',
    fontSize: 13,
    fontStyle: 'italic',
    lineHeight: 18,
    marginBottom: 20,
    backgroundColor: '#F2EDE8',
    borderRadius: 10,
    padding: 14,
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
