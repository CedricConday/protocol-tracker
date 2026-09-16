import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { getDb } from '../db/schema';
import { getDaySummary, getJournalEntry, getRecentJournalEntries, getSemanticJournalSummary, logRelapseEvent, todayStr, upsertJournalEntry, getMiscFlag, setMiscFlag } from '../db/queries';
import type { JournalEntry } from '../types';
import { t, useLanguage, locale } from '../i18n';
import { useJournalScreen } from '../hooks';
import EmptyState from '../components/EmptyState';

import { weekdaysShortSundayFirst, shortDate } from '../i18n/dates';
const MOODS = [
  { emoji: '😄', label: 'Great' },
  { emoji: '🙂', label: 'Good' },
  { emoji: '😐', label: 'Okay' },
  { emoji: '😔', label: 'Rough' },
  { emoji: '😞', label: 'Struggling' },
];


// Absorbed from the former standalone RelapseScreen (event type -> accent color / label).
const EVENT_TYPES = ['relapse', 'cortisone', 'symptom', 'pain'] as const;
const TYPE_COLORS: Record<string, string> = {
  relapse: '#C0392B',
  cortisone: '#eab308',
  symptom: '#888888',
  pain: '#a855f7',
};
const TYPE_LABELS: Record<string, string> = {
  relapse: 'Relapse',
  cortisone: 'Cortisone',
  symptom: 'Symptom',
  pain: 'Pain',
};
const PAIN_SUBTYPES = [
  'Dysesthetic (burning/tingling)',
  'Spasticity (muscle)',
  'Musculoskeletal',
  'Headache',
];

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return `${weekdaysShortSundayFirst()[d.getDay()]} ${shortDate(d)}`;
}

function formatEventDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString(locale(), { day: 'numeric', month: 'short', year: 'numeric' });
}

function complianceBadgeColor(pct: number): string {
  if (pct >= 80) return '#22c55e';
  if (pct >= 50) return '#eab308';
  return '#ef4444';
}

export default function JournalScreen() {
  useLanguage(); // re-render this screen when the language changes
  const {
    refreshing, setRefreshing, summary, pastEntries, loadedMood, existingNote,
    semanticSummary, weekMoods, events, loadData,
  } = useJournalScreen();
  const today = todayStr();

  const [note, setNote] = useState('');
  const [dietaryNote, setDietaryNote] = useState('');
  // Mood and note are stored together with the date they belong to. Keeping the
  // date in the value is what makes this race-free: a clock roll or a reload can
  // change `today` at any point, and a plain `selectedMood` string left the
  // screen unable to tell "the user picked this for today" from "this is left
  // over from yesterday" — so a refresh could overwrite a fresh tap, and a day
  // boundary could carry a stale mood into the next day's entry.
  const [moodEntry, setMoodEntry] = useState<{ date: string; mood: string } | null>(null);
  const [saved, setSaved] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const noteRef = useRef<TextInput>(null);

  // Absorbed from the former standalone RelapseScreen ("+ Log Event" used to
  // navigate there; the form now expands in place instead of leaving Journal).
  const [logEventOpen, setLogEventOpen] = useState(false);
  const [eventType, setEventType] = useState<string>('relapse');
  // The event date is a DRAFT FOR A PARTICULAR DAY, so it carries that day with
  // it — the same shape as `moodEntry` above, for the same reason, and it was
  // the one field on this screen left without it.
  //
  // `useState(today)` seeded once, at mount. The tab stays mounted (React
  // Navigation keeps it alive) and the app survives days in the background, so
  // after a midnight roll this still held YESTERDAY's date: opening "+ Log
  // Event" the next day prefilled the previous day and `handleLogEvent` wrote
  // the event onto it. The only reset was `setEventDate(today)` AFTER a
  // successful save, so the stale date outlived exactly the save it corrupted.
  //
  // Resolving against `today` on read closes it: a draft made on another day is
  // not this day's draft and must not be offered as one.
  const [eventDateDraft, setEventDateDraft] = useState<{ date: string; value: string }>(
    { date: today, value: today },
  );
  const eventDate = eventDateDraft.date === today ? eventDateDraft.value : today;
  const setEventDate = useCallback((value: string) => {
    // todayStr(), not the render's `today`: a keystroke can land after the roll.
    setEventDateDraft({ date: todayStr(), value });
  }, []);
  const [cortisoneDose, setCortisoneDose] = useState('');
  const [severity, setSeverity] = useState<number | null>(null);
  const [eventNotes, setEventNotes] = useState('');
  const [painSubtype, setPainSubtype] = useState<string | null>(null);
  const [lasted24h, setLasted24h] = useState<boolean | null>(null);
  const [hasFever, setHasFever] = useState<boolean | null>(null);
  const [eventLogged, setEventLogged] = useState(false);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const selectedMood = moodEntry && moodEntry.date === today ? moodEntry.mood : null;

  // Seed the form from the stored entry for THIS date only, and never on top of
  // a value already held for it. handleSave ends with loadData(), so without
  // this the freshly-written row was pushed straight back through here; since
  // the blur-autosave writes first, the value coming back was the stale mood and
  // it replaced the tap the user had just made. That is why a 60-day run stored
  // the same mood on every single day.
  useEffect(() => {
    if (moodEntry?.date === today) return;
    if (loadedMood !== null) {
      setMoodEntry({ date: today, mood: loadedMood });
      setNote(existingNote);
    }
  }, [loadedMood, existingNote, today, moodEntry]);

  // When the calendar day rolls over and the new day has no stored entry yet,
  // clear the text boxes. Without this, yesterday's note stayed in the field and
  // was saved onto today's entry.
  const noteDate = useRef(today);
  useEffect(() => {
    if (noteDate.current === today) return;
    noteDate.current = today;
    if (loadedMood === null) {
      setNote('');
      setDietaryNote('');
    }
  }, [today, loadedMood]);

  useEffect(() => {
    getDb().then(async (db) => {
      const row = await db.getFirstAsync<{ dietary_note: string }>('SELECT dietary_note FROM journal_entries WHERE date = ?', [today]);
      if (row?.dietary_note) setDietaryNote(row.dietary_note);
    }).catch((e) => console.warn('[Journal] dietary_note read skipped:', e));
  }, [today]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  // Writes are queued rather than fired straight at the database. Tapping a mood
  // while a note field has focus produces TWO writes from one gesture - blur
  // fires `handleSave` with the mood as it was BEFORE the tap, then the tap
  // itself writes the new one - and unqueued they race, so the pre-tap value
  // could land last and win. Chaining them keeps the stored row in the order the
  // user acted. The chain is deliberately never rejected: one failed write must
  // not wedge every later one.
  const writeChain = useRef<Promise<void>>(Promise.resolve());

  const persist = useCallback((mood: string, { flash }: { flash: boolean }) => {
    const next = writeChain.current.then(async () => {
      await upsertJournalEntry({
        date: today,
        mood,
        note,
        dietary_note: dietaryNote || undefined,
        compliance_pct: summary.totalDoses > 0
          ? Math.round((summary.takenDoses / summary.totalDoses) * 100)
          : 0,
        doses_taken: summary.takenDoses,
        doses_total: summary.totalDoses,
      });
      // Pure-tracker build: fatigue-spike detection and the micro-CBT coping
      // module were removed (see ROADMAP). Journaling stays; the app just saves.
      //
      // Only an explicit save flashes "Saved ✓". An autosave must not, because
      // the confirmation doubles as the button's accessibility name
      // (`saved ? 'Journal entry saved' : 'Save journal entry'`, below) - so
      // flashing it on every mood tap would rename the control out from under
      // anyone looking for it by name, screen reader or harness alike.
      if (flash) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
      await loadData();
    });
    writeChain.current = next.catch(() => {});
    return next;
  }, [note, dietaryNote, summary, today, loadData]);

  const handleSave = useCallback(async () => {
    if (!selectedMood) return;
    await persist(selectedMood, { flash: true });
  }, [selectedMood, persist]);

  const handleBlur = useCallback(() => {
    if (selectedMood) {
      handleSave();
    }
  }, [selectedMood, handleSave]);

  const handleMoodSelect = (mood: string) => {
    setMoodEntry({ date: today, mood });
    // A tap is an explicit choice, so it is persisted immediately instead of
    // waiting for Save. Previously it lived only in component state: if the tap
    // blurred a focused note field, that blur saved the PREVIOUS mood and the
    // new one was never written, leaving the screen showing something the row
    // did not have. It survived a tab switch, so the divergence was invisible
    // until a remount silently reverted the user's last tap.
    // Evidence: e2e/report/mood3-B1-fixed/mood3.md Check 2, seq 18/36/54.
    persist(mood, { flash: false }).catch(() => {});
  };

  const handleLogEvent = useCallback(async () => {
    await logRelapseEvent({
      date: eventDate,
      type: eventType,
      cortisone_dose_mg: eventType === 'cortisone' && cortisoneDose ? parseInt(cortisoneDose, 10) : undefined,
      notes: eventNotes,
      severity: severity ?? undefined,
      pain_type: eventType === 'pain' ? (painSubtype ?? undefined) : undefined,
      lasted_24h: lasted24h !== null ? (lasted24h ? 1 : 0) : undefined,
      has_fever: hasFever !== null ? (hasFever ? 1 : 0) : undefined,
    });
    setEventType('relapse');
    setEventDateDraft({ date: todayStr(), value: todayStr() });
    setCortisoneDose('');
    setSeverity(null);
    setEventNotes('');
    setPainSubtype(null);
    setLasted24h(null);
    setHasFever(null);
    setEventLogged(true);
    setTimeout(() => setEventLogged(false), 2000);
    await loadData();
  }, [eventType, eventDate, cortisoneDose, severity, eventNotes, painSubtype, lasted24h, hasFever, loadData]);

  const eventPlaceholder = eventType === 'cortisone'
    ? 'Pulse dose details...'
    : eventType === 'symptom'
      ? 'What symptoms?'
      : 'Describe what happened...';

  const eventSubmitDisabled = (eventType !== 'cortisone' && severity === null) || (eventType === 'pain' && painSubtype === null);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#1B58B8" />
      }
    >
      <View style={styles.headingRow}>
        <Text style={styles.heading}>{t('journal')}</Text>
        <TouchableOpacity
          style={[styles.logEventBtn, logEventOpen ? styles.logEventBtnActive : null]}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setLogEventOpen((v) => !v); }}
          activeOpacity={0.7}
          accessibilityLabel={logEventOpen ? 'Hide event log form' : 'Show event log form'}
          accessibilityRole="button"
        >
          <Text style={[styles.logEventBtnText, logEventOpen ? styles.logEventBtnTextActive : null]}>
            {logEventOpen ? '− ' : '+ '}{t('logEvent')}
          </Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.dateSubtitle}>{formatDateLabel(today)}</Text>

      {/* Absorbed from RelapseScreen: logging a relapse/symptom/cortisone/pain
          event now happens in place instead of on a separate screen. */}
      {logEventOpen ? (
        <View style={styles.logEventPanel}>
          <Text style={styles.fieldLabel}>{t('date')}</Text>
          <View style={styles.sectionCard}>
            <TextInput
              style={styles.input}
              value={eventDate}
              onChangeText={setEventDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor="#9AA3B2"
              autoCapitalize="none"
            />
            <Text style={styles.datePreview}>{formatEventDate(eventDate)}</Text>
          </View>

          <Text style={styles.fieldLabel}>{t('type')}</Text>
          <View style={styles.typeRow}>
            {EVENT_TYPES.map((et) => {
              const selected = eventType === et;
              const color = TYPE_COLORS[et];
              return (
                <TouchableOpacity
                  key={et}
                  style={[
                    styles.typeButton,
                    selected
                      ? { backgroundColor: color, borderColor: color }
                      : { backgroundColor: 'transparent', borderColor: color },
                  ]}
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setEventType(et); }}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.typeButtonText, { color: selected ? '#F7F7F2' : color }]}>
                    {TYPE_LABELS[et]}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {eventType === 'pain' ? (
            <>
              <Text style={styles.fieldLabel}>{t('painType')}</Text>
              <View style={styles.painSubtypeContainer}>
                {PAIN_SUBTYPES.map((subtype) => {
                  const selected = painSubtype === subtype;
                  return (
                    <TouchableOpacity
                      key={subtype}
                      style={[styles.painSubtypeButton, selected ? styles.painSubtypeSelected : null]}
                      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setPainSubtype(subtype); }}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.painSubtypeText, selected ? styles.painSubtypeTextSelected : null]}>
                        {subtype}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
          ) : null}

          {eventType === 'cortisone' ? (
            <>
              <Text style={styles.fieldLabel}>{t('cortisoneDose')}</Text>
              <View style={styles.sectionCard}>
                <TextInput
                  style={[styles.input, styles.inputLast]}
                  value={cortisoneDose}
                  onChangeText={setCortisoneDose}
                  placeholder="e.g. 1000"
                  placeholderTextColor="#9AA3B2"
                  keyboardType="numeric"
                />
              </View>
            </>
          ) : null}

          <Text style={styles.fieldLabel}>
            Severity
            {eventType !== 'cortisone' ? <Text style={styles.required}> *</Text> : null}
          </Text>
          <View style={styles.severityRow}>
            {[1, 2, 3, 4, 5].map((s) => {
              const selected = severity === s;
              const hue = 120 - (s - 1) * 30;
              const color = selected ? `hsl(${hue}, 80%, 50%)` : '#555555';
              return (
                <TouchableOpacity
                  key={s}
                  style={[
                    styles.severityCircle,
                    { borderColor: color },
                    selected ? { backgroundColor: color } : null,
                  ]}
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setSeverity(s); }}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.severityText, { color: selected ? '#F7F7F2' : '#5A6478' }]}>
                    {s}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {eventType === 'relapse' || eventType === 'symptom' ? (
            <>
              <Text style={styles.fieldLabel}>24-Hour Rule</Text>
              <View style={styles.yesNoRow}>
                {([true, false] as const).map((val) => (
                  <TouchableOpacity
                    key={String(val)}
                    style={[styles.yesNoBtn, lasted24h === val ? styles.yesNoBtnActive : null]}
                    onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setLasted24h(val); }}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.yesNoBtnText, lasted24h === val ? styles.yesNoBtnTextActive : null]}>
                      {val ? 'Yes — lasted >24h' : 'No — resolved sooner'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.fieldLabel}>{t('feverPresent')}</Text>
              <View style={styles.yesNoRow}>
                {([true, false] as const).map((val) => (
                  <TouchableOpacity
                    key={String(val)}
                    style={[styles.yesNoBtn, hasFever === val ? styles.yesNoBtnActive : null]}
                    onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setHasFever(val); }}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.yesNoBtnText, hasFever === val ? styles.yesNoBtnTextActive : null]}>
                      {val ? 'Yes' : 'No'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              {hasFever === true ? (
                <View style={styles.feverWarning}>
                  <Text style={styles.feverWarningText}>{t('jrnFeverWarning')}</Text>
                </View>
              ) : null}
            </>
          ) : null}

          <Text style={styles.fieldLabel}>{t('notes')}</Text>
          <View style={styles.sectionCard}>
            <TextInput
              style={[styles.input, styles.inputMultiline, styles.inputLast]}
              value={eventNotes}
              onChangeText={setEventNotes}
              placeholder={eventPlaceholder}
              placeholderTextColor="#9AA3B2"
              multiline
            />
          </View>

          <TouchableOpacity
            style={[styles.logButton, eventSubmitDisabled ? styles.logButtonDisabled : null]}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); handleLogEvent().then(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)).catch((e) => Alert.alert(t('jrnSaveFailed'), e?.message ?? 'Please try again')); }}
            disabled={eventSubmitDisabled}
            activeOpacity={0.8}
          >
            <Text style={styles.logButtonText}>
              {eventLogged ? 'Logged ✓' : t('logEvent')}
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}

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
        placeholder={t('howAreYouToday')}
        placeholderTextColor="#9AA3B2"
        multiline
        value={note}
        onChangeText={setNote}
        onBlur={handleBlur}
      />

      <TextInput
        style={styles.dietaryInput}
        placeholder={t('dairyPrompt')}
        placeholderTextColor="#9AA3B2"
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
        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); handleSave().then(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)).catch((e) => Alert.alert(t('jrnSaveFailed'), e?.message ?? 'Please try again')); }}
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

      <Text style={styles.sectionTitle}>{t('recentEntries')}</Text>
      {pastEntries.length === 0 ? (
        <EmptyState
          icon="📓"
          title={t('noJournalYet')}
          subtitle={t('journalEmptySub')}
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
              accessibilityLabel={`${isExpanded ? 'Collapse' : 'Expand'} entry from ${entry.date === todayStr() ? 'today' : entry.date}`}
              accessibilityRole="button"
            >
              <View style={styles.entryTop}>
                <Text style={styles.entryMood}>{entry.mood}</Text>
                <Text style={[styles.entryDate, entry.date === todayStr() && styles.entryDateToday]}>
                  {entry.date === todayStr() ? 'Today' : formatDateLabel(entry.date)}
                </Text>
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

      {/* Absorbed from RelapseScreen: recent relapse/symptom/cortisone/pain history. */}
      <Text style={styles.sectionTitle}>{t('eventHistory')}</Text>
      {events.length === 0 ? (
        <Text style={styles.emptyText}>{t('noEvents')}</Text>
      ) : (
        events.map((e) => {
          const color = TYPE_COLORS[e.type] ?? '#888888';
          return (
            <View key={e.id} style={styles.eventCard}>
              <View style={styles.eventTop}>
                <View style={[styles.eventBadge, { backgroundColor: color + '30' }]}>
                  <Text style={[styles.eventBadgeText, { color }]}>
                    {TYPE_LABELS[e.type] ?? e.type}
                  </Text>
                </View>
                <Text style={styles.eventDateText}>{formatEventDate(e.date)}</Text>
                {e.severity != null ? (
                  <View style={styles.severityDots}>
                    {Array.from({ length: e.severity }, (_, i) => (
                      <View key={i} style={[styles.dot, { backgroundColor: color }]} />
                    ))}
                  </View>
                ) : null}
              </View>
              {e.pain_type ? (
                <Text style={styles.painTypeTag}>{e.pain_type}</Text>
              ) : null}
              {e.notes ? (
                <Text style={styles.eventNotes}>{e.notes}</Text>
              ) : null}
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7F7F2',
  },
  content: {
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  headingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  heading: {
    color: '#14213D',
    fontSize: 22,
    fontWeight: '700',
  },
  logEventBtn: { backgroundColor: '#ECEDE6', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1, borderColor: '#C0392B' },
  logEventBtnText: { color: '#C0392B', fontSize: 14, fontWeight: '600' },
  logEventBtnActive: { backgroundColor: '#C0392B', borderColor: '#C0392B' },
  logEventBtnTextActive: { color: '#F7F7F2' },
  logEventPanel: { marginBottom: 20 },
  fieldLabel: {
    color: '#5A6478',
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 24,
    marginTop: 16,
    marginBottom: 10,
    marginLeft: 4,
  },
  required: {
    color: '#C0392B',
  },
  sectionCard: {
    backgroundColor: '#ECEDE6',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#DBDDD3',
    shadowColor: '#14213D',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  typeRow: {
    flexDirection: 'row',
    gap: 10,
  },
  typeButton: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1.5,
    paddingVertical: 14,
    alignItems: 'center',
  },
  typeButtonText: {
    fontSize: 14,
    fontWeight: '700',
  },
  input: {
    backgroundColor: 'transparent',
    borderRadius: 0,
    paddingHorizontal: 0,
    paddingVertical: 12,
    color: '#14213D',
    fontSize: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#CFD2C6',
    marginBottom: 2,
  },
  inputLast: {
    borderBottomWidth: 0,
    marginBottom: 10,
  },
  inputMultiline: {
    minHeight: 60,
    textAlignVertical: 'top',
  },
  datePreview: {
    color: '#5A6478',
    fontSize: 13,
    marginBottom: 8,
  },
  severityRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  severityCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  severityText: {
    fontSize: 16,
    fontWeight: '700',
  },
  logButton: {
    backgroundColor: '#1B58B8',
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 8,
  },
  logButtonDisabled: {
    opacity: 0.4,
  },
  logButtonText: {
    color: '#F7F7F2',
    fontSize: 16,
    fontWeight: '700',
  },
  dateSubtitle: {
    color: '#5A6478',
    fontSize: 14,
    marginBottom: 24,
  },
  sectionTitle: {
    color: '#5A6478',
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
    backgroundColor: '#ECEDE6',
  },
  moodSelected: {
    backgroundColor: '#E7EEFB',
    borderWidth: 2,
    borderColor: '#1B58B8',
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
    color: '#5A6478',
    fontWeight: '600',
  },
  moodLabelSelected: {
    color: '#1B58B8',
  },
  noteInput: {
    backgroundColor: '#ECEDE6',
    color: '#14213D',
    borderRadius: 14,
    padding: 16,
    minHeight: 120,
    fontSize: 16,
    lineHeight: 24,
    textAlignVertical: 'top',
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#CFD2C6',
  },
  complianceLine: {
    color: '#5A6478',
    fontSize: 13,
    fontStyle: 'italic',
    marginBottom: 16,
  },
  saveButton: {
    backgroundColor: '#1B58B8',
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 24,
  },
  saveButtonDisabled: {
    opacity: 0.4,
  },
  saveButtonText: {
    color: '#F7F7F2',
    fontSize: 16,
    fontWeight: '700',
  },
  saveButtonTextSaved: {
    color: '#F7F7F2',
  },
  emptyText: {
    color: '#9AA3B2',
    fontSize: 15,
    textAlign: 'center',
    marginTop: 20,
  },
  entryCard: {
    backgroundColor: '#ECEDE6',
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
    color: '#14213D',
    fontSize: 15,
    fontWeight: '600',
    flex: 1,
  },
  entryDateToday: { fontWeight: '800' },
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
    color: '#5A6478',
    fontSize: 15,
    marginTop: 10,
    lineHeight: 22,
  },
  dietaryInput: {
    backgroundColor: '#ECEDE6',
    color: '#14213D',
    borderRadius: 10,
    padding: 14,
    fontSize: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#CFD2C6',
  },
  semanticSummary: {
    color: '#5A6478',
    fontSize: 14,
    fontStyle: 'italic',
    lineHeight: 22,
    marginBottom: 20,
    backgroundColor: '#ECEDE6',
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
    backgroundColor: '#ECEDE6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekDayEmpty: {
    borderWidth: 1,
    borderColor: '#CFD2C6',
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
    color: '#9AA3B2',
    fontSize: 10,
    fontWeight: '600',
  },
  painSubtypeContainer: {
    gap: 8,
  },
  painSubtypeButton: {
    borderWidth: 1,
    borderColor: '#CFD2C6',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: '#ECEDE6',
  },
  painSubtypeSelected: {
    borderColor: '#9B7FC0',
    backgroundColor: '#F0EBF7',
  },
  painSubtypeText: {
    color: '#5A6478',
    fontSize: 14,
    fontWeight: '500',
  },
  painSubtypeTextSelected: {
    color: '#6B4FBF',
    fontWeight: '700',
  },
  painTypeTag: {
    color: '#6B4FBF',
    fontSize: 12,
    marginTop: 6,
    fontStyle: 'italic',
  },
  yesNoRow: { flexDirection: 'row', gap: 10, marginBottom: 8 },
  yesNoBtn: { flex: 1, borderRadius: 10, borderWidth: 1, borderColor: '#CFD2C6', paddingVertical: 12, alignItems: 'center' },
  yesNoBtnActive: { borderColor: '#2F8F5B', backgroundColor: '#EFF7EF' },
  yesNoBtnText: { color: '#5A6478', fontSize: 13, fontWeight: '600' },
  yesNoBtnTextActive: { color: '#2F8F5B' },
  feverWarning: { backgroundColor: '#FDF3E0', borderRadius: 14, padding: 14, marginBottom: 14, borderLeftWidth: 3, borderLeftColor: '#F2B233' },
  feverWarningText: { color: '#F2B233', fontSize: 12, lineHeight: 18 },
  eventCard: {
    backgroundColor: '#ECEDE6',
    borderRadius: 14,
    padding: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#CFD2C6',
  },
  eventTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  eventBadge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  eventBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  eventDateText: {
    color: '#14213D',
    fontSize: 15,
    fontWeight: '600',
    flex: 1,
  },
  severityDots: {
    flexDirection: 'row',
    gap: 3,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  eventNotes: {
    color: '#5A6478',
    fontSize: 14,
    fontStyle: 'italic',
    marginTop: 8,
    lineHeight: 22,
  },
});
