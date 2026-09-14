import { useCallback, useEffect, useState } from 'react';
import { getDaySummary, getJournalEntry, getRecentJournalEntries, getRelapseEvents, getSemanticJournalSummary, todayStr, localDateStr } from '../db/queries';
import type { JournalEntry, RelapseEvent } from '../types';

export function useJournalScreen() {
  const [refreshing, setRefreshing] = useState(false);
  const [summary, setSummary] = useState({ takenDoses: 0, totalDoses: 0 });
  const [pastEntries, setPastEntries] = useState<JournalEntry[]>([]);
  // The loaded entry is held WITH the date it was loaded for. Keeping the date
  // in the value is what makes the day rollover safe, and it is the same shape
  // JournalScreen already uses for `moodEntry` and for the same reason.
  //
  // The previous version kept `loadedMood` and `existingNote` as bare state and
  // cleared them in loadData's `else` branch (cb8f2ba). That is necessary but
  // it lands a tick too late: loadData is async, so on the first render of a new
  // day `loadedMood` still holds YESTERDAY's mood, and the effect at
  // JournalScreen.tsx:113 — which fires on that render — reads it and writes
  // `{date: today, mood: <yesterday's>}` into `moodEntry`. By the time the await
  // resolves and clears it, the stale mood has already been stamped with today's
  // date and the early-return guard on the next pass keeps it there.
  //
  // Measured: with the `else` alone, `e2e/report/mood3-B1-after` still reported
  // Check 1 = 2 (days 2 and 3 opening pre-selected with no row for that date) —
  // byte-identical to the control run against master. The served bundle was
  // confirmed to contain the fix, so this was the app, not the harness.
  //
  // Deriving the two values against `today` instead closes it: on the first
  // render after the day rolls, `loaded.date` is still yesterday, so both read
  // empty SYNCHRONOUSLY, before any effect can consume them.
  const [loaded, setLoaded] = useState<{ date: string; mood: string | null; note: string }>({ date: '', mood: null, note: '' });
  const [semanticSummary, setSemanticSummary] = useState('');
  const [weekMoods, setWeekMoods] = useState<{ day: string; emoji: string | null; compliancePct: number }[]>([]);
  const [events, setEvents] = useState<RelapseEvent[]>([]);

  const today = todayStr();

  const loadData = useCallback(async () => {
    const daySummary = await getDaySummary(today);
    setSummary({ takenDoses: daySummary.takenDoses, totalDoses: daySummary.totalDoses });

    const existing = await getJournalEntry(today);
    setLoaded(existing
      ? { date: today, mood: existing.mood, note: existing.note }
      : { date: today, mood: null, note: '' });

    // Today is IN the list.
    //
    // It used to be filtered out, because the editor above this list is today's
    // entry and showing it twice looked redundant. From the user's side that
    // reads as a logging bug: you pick a mood, it saves, you scroll to "Recent
    // Entries" — which is your log — and the newest thing in it is yesterday.
    // Reported from the device as exactly that.
    //
    // The filter also quietly cost a row: seven were fetched, today was dropped,
    // six were shown. Fetch one extra so seven is really seven.
    const all = await getRecentJournalEntries(8);
    setPastEntries(all.slice(0, 7));

    const recentEvents = await getRelapseEvents(10);
    setEvents(recentEvents);

    const summary = await getSemanticJournalSummary();
    setSemanticSummary(summary);

    const weekDays: { day: string; emoji: string | null; compliancePct: number }[] = [];
    const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const todayIdx = ((new Date().getDay() + 6) % 7);
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = localDateStr(d);
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

  // Same names, same types as before, so no consumer changes. A value loaded for
  // a different date is not this date's value and must not be offered as one.
  const loadedMood = loaded.date === today ? loaded.mood : null;
  const existingNote = loaded.date === today ? loaded.note : '';

  return {
    refreshing, setRefreshing, summary, pastEntries, loadedMood, existingNote,
    semanticSummary, weekMoods, events, loadData,
  };
}
