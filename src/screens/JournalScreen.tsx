import * as Haptics from 'expo-haptics';
import { useCallback, useRef, useState } from 'react';
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
import { deleteJournalEntry, insertJournalEntry, logRelapseEvent, todayStr } from '../db/queries';
import type { JournalEntry } from '../types';
import { t, useLanguage, locale } from '../i18n';
import { useJournalScreen } from '../hooks';
import { useToday } from '../hooks/useToday';
import EmptyState from '../components/EmptyState';

import { weekdaysShortSundayFirst, shortDate } from '../i18n/dates';
// The emoji IS the stored mood, so it is language-independent already; only
// the word under it is looked up.
const MOODS = [
  { emoji: '😄', labelKey: 'moodGreat' },
  { emoji: '🙂', labelKey: 'moodGood' },
  { emoji: '😐', labelKey: 'moodOkay' },
  { emoji: '😔', labelKey: 'moodRough' },
  { emoji: '😞', labelKey: 'moodStruggling' },
];


// Absorbed from the former standalone RelapseScreen (event type -> accent color / label).
const EVENT_TYPES = ['relapse', 'cortisone', 'symptom', 'pain'] as const;
const TYPE_COLORS: Record<string, string> = {
  relapse: '#C0392B',
  cortisone: '#eab308',
  symptom: '#888888',
  pain: '#a855f7',
};
// Values, not words: `relapse_events.type` and `.pain_type` keep their English
// ids so a row written in one language still reads in the other.
const TYPE_LABELS: Record<string, string> = {
  relapse: 'evRelapse',
  cortisone: 'evCortisone',
  symptom: 'evSymptom',
  pain: 'evPain',
};
const PAIN_SUBTYPES: { value: string; key: string }[] = [
  { value: 'Dysesthetic (burning/tingling)', key: 'painDysesthetic' },
  { value: 'Spasticity (muscle)', key: 'painSpasticity' },
  { value: 'Musculoskeletal', key: 'painMusculoskeletal' },
  { value: 'Headache', key: 'painHeadache' },
];

/** A stored pain type in the current language; anything else prints as-is. */
function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return `${weekdaysShortSundayFirst()[d.getDay()]} ${shortDate(d)}`;
}

/**
 * The clock time an entry was written, from `created_at`.
 *
 * SQLite's `datetime('now')` writes UTC with no zone marker, so it is stamped
 * with one here before parsing — `new Date('2026-09-17 19:40:02')` is read as
 * LOCAL by some engines and as invalid by others, and neither is the stored
 * instant. An unparseable value gives an empty string rather than "Invalid Date"
 * in the middle of the list.
 */
function formatEntryTime(createdAt: string): string {
  const parsed = new Date(`${createdAt.replace(' ', 'T')}Z`);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });
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
    loadedDietaryNote, loadedId, loadedFor,
    semanticSummary, weekMoods, loadData,
  } = useJournalScreen();
  // `useToday()` rather than `todayStr()`: both answer the same on the render
  // that reads them, but only the hook re-renders when the local day rolls, so
  // a screen left open overnight moves to the new day on its own.
  const today = useToday();

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

  /**
   * The editor is a COMPOSER, not a row editor (2026-09-17).
   *
   * It used to bind to a row: the mood tap wrote the day's first entry, Save
   * updated that same row, and a second entry needed a "+ New entry" button to
   * detach from it first. Cedric pressed Save twice, got one entry, and
   * reasonably concluded the feature had not shipped — the button was an extra
   * step nobody looked for, in the one place where the obvious control was
   * already sitting under their thumb.
   *
   * Now: nothing is written until Save is pressed, Save always INSERTs, and the
   * form clears afterwards. Save twice, two entries. Existing entries are read
   * and removed in the list below; nothing edits them in place, which is why
   * there is no row to bind to any more.
   *
   * This also retires a whole family of bugs rather than fixing them: with no
   * autosave on tap and none on blur, there is no second writer to race, no
   * stale mood to seed back over a fresh tap, and no queue needed to order two
   * writes that came from one gesture.
   */

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  // How many entries each listed day holds, so a day with more than one can be
  // shown by the clock rather than by a date repeated down the list.
  const perDayCounts = pastEntries.reduce<Record<string, number>>((acc, e) => {
    acc[e.date] = (acc[e.date] ?? 0) + 1;
    return acc;
  }, {});
  const todayEntryCount = perDayCounts[today] ?? 0;

  /**
   * Remove one entry.
   *
   * A journal that can only ever accumulate cannot correct a mis-tap, and this
   * is the same Remove every other tracker list in the app offers. The editor
   * holds no row, so removing one cannot strand it.
   */
  const handleRemoveEntry = useCallback(async (entry: JournalEntry) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const removed = await deleteJournalEntry(entry.id);
    if (!removed) {
      Alert.alert(t('trkAlreadyGone'), t('jrnEntryGoneSub'));
    }
    setExpandedId(null);
    await loadData();
  }, [loadData]);

  const handleSave = useCallback(async () => {
    if (!selectedMood) return;
    const date = todayStr();
    await insertJournalEntry({
      date,
      mood: selectedMood,
      note,
      dietary_note: dietaryNote,
      compliance_pct: summary.totalDoses > 0
        ? Math.round((summary.takenDoses / summary.totalDoses) * 100)
        : 0,
      doses_taken: summary.takenDoses,
      doses_total: summary.totalDoses,
    });
    // Cleared so the next entry starts from nothing. Leaving the last one in
    // place would make a second Save look like it had done nothing, which is
    // the misreading this whole change exists to remove.
    setMoodEntry(null);
    setNote('');
    setDietaryNote('');
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    await loadData();
  }, [selectedMood, note, dietaryNote, summary, loadData]);

  const handleMoodSelect = (mood: string) => {
    // Held in state only. Nothing reaches the database until Save.
    setMoodEntry({ date: todayStr(), mood });
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
    ? t('jrnPulsePlaceholder')
    : eventType === 'symptom'
      ? t('jrnSymptomPlaceholder')
      : t('jrnEventPlaceholder');

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
          accessibilityLabel={logEventOpen ? t('jrnHideEventForm') : t('jrnShowEventForm')}
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
                    {t(TYPE_LABELS[et])}
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
                  const selected = painSubtype === subtype.value;
                  return (
                    <TouchableOpacity
                      key={subtype.value}
                      style={[styles.painSubtypeButton, selected ? styles.painSubtypeSelected : null]}
                      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setPainSubtype(subtype.value); }}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.painSubtypeText, selected ? styles.painSubtypeTextSelected : null]}>
                        {t(subtype.key)}
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
            {t('severity')}
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
              <Text style={styles.fieldLabel}>{t('jrn24HourRule')}</Text>
              <View style={styles.yesNoRow}>
                {([true, false] as const).map((val) => (
                  <TouchableOpacity
                    key={String(val)}
                    style={[styles.yesNoBtn, lasted24h === val ? styles.yesNoBtnActive : null]}
                    onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setLasted24h(val); }}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.yesNoBtnText, lasted24h === val ? styles.yesNoBtnTextActive : null]}>
                      {val ? t('jrnLasted24h') : t('jrnResolvedSooner')}
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
                      {val ? t('yes') : t('no')}
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
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); handleLogEvent().then(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)).catch((e) => Alert.alert(t('jrnSaveFailed'), e?.message ?? t('pleaseTryAgain'))); }}
            disabled={eventSubmitDisabled}
            activeOpacity={0.8}
          >
            <Text style={styles.logButtonText}>
              {eventLogged ? t('jrnLogged') : t('logEvent')}
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
              accessibilityLabel={t('jrnSelectMoodA11y', { mood: t(m.labelKey) })}
              accessibilityRole="button"
            >
              <Text style={[styles.moodEmoji, isSelected ? styles.moodEmojiSelected : null]}>
                {m.emoji}
              </Text>
              <Text style={[styles.moodLabel, isSelected ? styles.moodLabelSelected : null]}>
                {t(m.labelKey)}
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
      />

      <TextInput
        style={styles.dietaryInput}
        placeholder={t('dairyPrompt')}
        placeholderTextColor="#9AA3B2"
        value={dietaryNote}
        onChangeText={setDietaryNote}
      />

      <Text style={styles.complianceLine}>
        {t('jrnComplianceLine', { taken: summary.takenDoses, total: summary.totalDoses })}
      </Text>

      <TouchableOpacity
        style={[
          styles.saveButton,
          (selectedMood === null) ? styles.saveButtonDisabled : null,
        ]}
        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); handleSave().then(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)).catch((e) => Alert.alert(t('jrnSaveFailed'), e?.message ?? t('pleaseTryAgain'))); }}
        disabled={selectedMood === null}
        activeOpacity={0.8}
        accessibilityLabel={saved ? t('jrnSavedA11y') : t('jrnSaveA11y')}
        accessibilityRole="button"
      >
        <Text style={[
          styles.saveButtonText,
          saved ? styles.saveButtonTextSaved : null,
        ]}>
          {saved ? t('jrnSaved') : t('jrnSaveEntry')}
        </Text>
      </TouchableOpacity>

      {/* The day's other entries are not lost behind the editor: the editor
          holds the most recent one, and the rest are in the list below. */}
      {todayEntryCount > 1 ? (
        <Text style={styles.entryCountLine}>
          {t('jrnEntriesToday', { count: todayEntryCount })}
        </Text>
      ) : null}

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
              accessibilityLabel={t(isExpanded ? 'jrnCollapseEntryA11y' : 'jrnExpandEntryA11y', {
                date: entry.date === today ? t('today') : entry.date,
              })}
              accessibilityRole="button"
            >
              <View style={styles.entryTop}>
                <Text style={styles.entryMood}>{entry.mood}</Text>
                <Text style={[styles.entryDate, entry.date === today && styles.entryDateToday]}>
                  {entry.date === today ? t('today') : formatDateLabel(entry.date)}
                </Text>
                {/* The clock time is what tells two entries from the same day
                    apart. It is only worth the space when there ARE two. */}
                {perDayCounts[entry.date] > 1 ? (
                  <Text style={styles.entryTime}>{formatEntryTime(entry.created_at)}</Text>
                ) : null}
                <View style={[styles.complianceBadge, { backgroundColor: complianceBadgeColor(entry.compliance_pct) + '30' }]}>
                  <Text style={[styles.complianceBadgeText, { color: complianceBadgeColor(entry.compliance_pct) }]}>
                    {entry.compliance_pct}%
                  </Text>
                </View>
              </View>
              {isExpanded && entry.note ? (
                <Text style={styles.entryNote}>{entry.note}</Text>
              ) : null}
              {isExpanded ? (
                <View style={styles.entryActions}>
                  <TouchableOpacity
                    style={[styles.entryActionBtn, styles.entryRemoveBtn]}
                    onPress={() => handleRemoveEntry(entry)}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={t('jrnRemoveEntryA11y', {
                      date: entry.date === today ? t('today') : formatDateLabel(entry.date),
                      time: formatEntryTime(entry.created_at),
                    })}
                  >
                    <Text style={styles.entryRemoveBtnText}>{t('remove')}</Text>
                  </TouchableOpacity>
                  {/* The card itself already collapses on tap; this is the same
                      action with a name on it, so leaving is as explicit as
                      removing and the two read as a pair. */}
                  <TouchableOpacity
                    style={[styles.entryActionBtn, styles.entryCloseBtn]}
                    onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setExpandedId(null); }}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={t('jrnCollapseEntryA11y', {
                      date: entry.date === today ? t('today') : formatDateLabel(entry.date),
                    })}
                  >
                    <Text style={styles.entryCloseBtnText}>{t('close')}</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
            </TouchableOpacity>
          );
        })
      )}

      {/* The event HISTORY list was removed 2026-09-17 at Cedric's request:
          the Journal is a daily surface, and a standing list of relapses and
          pain days made every open a reminder of the worst ones. Logging an
          event still works — the button and panel above are untouched, and the
          Calendar still shows them against their dates, which is where looking
          them up is a deliberate act rather than something the app does to you. */}
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
  entryCountLine: {
    color: '#5A6478',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 10,
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
  entryTime: {
    color: '#5A6478',
    fontSize: 13,
    fontWeight: '600',
    marginRight: 10,
  },
  // Remove and Close are one pair: same metrics, different weight. Only the
  // colour says which one is destructive, so they cannot be told apart by size
  // in a hurry — which is the point, since the destructive one is not the one
  // being aimed for most of the time.
  //
  // `flex: 1` rather than a fixed 92: at 92 each they took 192 of the card's 318
  // content px and left 126 of dead space to their right, which read as two
  // chips dropped on the card rather than as the card's own footer. Halving the
  // row fits them to the card at any width, keeps the pair equal, and survives
  // German ("Entfernen" / "Schließen"), where a fixed width would clip. The
  // minWidth stays as a floor for a card narrower than any phone.
  entryActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  entryActionBtn: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    minWidth: 92,
    alignItems: 'center',
  },
  entryRemoveBtn: {
    backgroundColor: '#FBEAEA',
    borderColor: '#E7C6C6',
  },
  entryRemoveBtnText: { color: '#B3453E', fontSize: 13, fontWeight: '700' },
  entryCloseBtn: {
    backgroundColor: '#ECEDE6',
    borderColor: '#D8D9D0',
  },
  entryCloseBtnText: { color: '#5A6478', fontSize: 13, fontWeight: '700' },
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
  yesNoRow: { flexDirection: 'row', gap: 10, marginBottom: 8 },
  yesNoBtn: { flex: 1, borderRadius: 10, borderWidth: 1, borderColor: '#CFD2C6', paddingVertical: 12, alignItems: 'center' },
  yesNoBtnActive: { borderColor: '#2F8F5B', backgroundColor: '#EFF7EF' },
  yesNoBtnText: { color: '#5A6478', fontSize: 13, fontWeight: '600' },
  yesNoBtnTextActive: { color: '#2F8F5B' },
  feverWarning: { backgroundColor: '#FDF3E0', borderRadius: 14, padding: 14, marginBottom: 14, borderLeftWidth: 3, borderLeftColor: '#F2B233' },
  feverWarningText: { color: '#F2B233', fontSize: 12, lineHeight: 18 },
});
