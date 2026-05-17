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
import { getDb } from '../db/schema';
import { getDaySummary, getJournalEntry, getRecentJournalEntries, todayStr, upsertJournalEntry } from '../db/queries';
import type { JournalEntry } from '../types';

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
  const [note, setNote] = useState('');
  const [selectedMood, setSelectedMood] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [summary, setSummary] = useState({ takenDoses: 0, totalDoses: 0 });
  const [pastEntries, setPastEntries] = useState<JournalEntry[]>([]);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [loadedMood, setLoadedMood] = useState<string | null>(null);
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
  }, [today]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

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
    setSaved(true);
    setLoadedMood(selectedMood);
    setTimeout(() => setSaved(false), 2000);
    const all = await getRecentJournalEntries(7);
    setPastEntries(all.filter((e) => e.date !== today));
  }, [selectedMood, note, summary, today]);

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
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#22c55e" />
      }
    >
      <Text style={styles.heading}>Journal</Text>
      <Text style={styles.dateSubtitle}>{formatDateLabel(today)}</Text>

      <Text style={styles.sectionTitle}>How are you feeling?</Text>
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
        <Text style={styles.emptyText}>No entries yet. Start writing today.</Text>
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
    marginBottom: 4,
  },
  dateSubtitle: {
    color: '#888888',
    fontSize: 14,
    marginBottom: 24,
  },
  sectionTitle: {
    color: '#888888',
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
    marginTop: 4,
  },
  moodRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  moodButton: {
    alignItems: 'center',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 6,
    minWidth: 58,
  },
  moodUnselected: {
    backgroundColor: '#1a1a1a',
  },
  moodSelected: {
    backgroundColor: '#1a1a1a',
    borderWidth: 2,
    borderColor: '#22c55e',
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
    color: '#888888',
    fontWeight: '600',
  },
  moodLabelSelected: {
    color: '#22c55e',
  },
  noteInput: {
    backgroundColor: '#1a1a1a',
    color: '#ffffff',
    borderRadius: 12,
    padding: 14,
    minHeight: 80,
    fontSize: 15,
    lineHeight: 22,
    textAlignVertical: 'top',
    marginBottom: 8,
  },
  complianceLine: {
    color: '#888888',
    fontSize: 13,
    fontStyle: 'italic',
    marginBottom: 16,
  },
  saveButton: {
    backgroundColor: '#22c55e',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 24,
  },
  saveButtonDisabled: {
    opacity: 0.4,
  },
  saveButtonText: {
    color: '#0d0d0d',
    fontSize: 16,
    fontWeight: '700',
  },
  saveButtonTextSaved: {
    color: '#ffffff',
  },
  emptyText: {
    color: '#555555',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 20,
  },
  entryCard: {
    backgroundColor: '#1a1a1a',
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
    color: '#ffffff',
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
    color: '#999999',
    fontSize: 14,
    marginTop: 10,
    lineHeight: 20,
  },
});
