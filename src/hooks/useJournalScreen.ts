import { useCallback, useEffect, useState } from 'react';
import { getDaySummary, getJournalEntry, getRecentJournalEntries, getRelapseEvents, getSemanticJournalSummary, todayStr, localDateStr } from '../db/queries';
import type { JournalEntry, RelapseEvent } from '../types';

export function useJournalScreen() {
  const [refreshing, setRefreshing] = useState(false);
  const [summary, setSummary] = useState({ takenDoses: 0, totalDoses: 0 });
  const [pastEntries, setPastEntries] = useState<JournalEntry[]>([]);
  const [loadedMood, setLoadedMood] = useState<string | null>(null);
  const [existingNote, setExistingNote] = useState('');
  const [semanticSummary, setSemanticSummary] = useState('');
  const [weekMoods, setWeekMoods] = useState<{ day: string; emoji: string | null; compliancePct: number }[]>([]);
  const [events, setEvents] = useState<RelapseEvent[]>([]);

  const today = todayStr();

  const loadData = useCallback(async () => {
    const daySummary = await getDaySummary(today);
    setSummary({ takenDoses: daySummary.takenDoses, totalDoses: daySummary.totalDoses });

    const existing = await getJournalEntry(today);
    if (existing) {
      setLoadedMood(existing.mood);
      setExistingNote(existing.note);
    } else {
      // Without this else the two values survived from the previous load, so a
      // date with no journal row opened holding yesterday's mood and note.
      // JournalScreen then stamped that mood with today's date and enabled Save
      // against a row the user never wrote — which is why the 60-day run shows
      // days opening pre-selected at 🙂 with no DB row for that date
      // (e2e/report/mood3/mood3.md, Check 1, seq 19 and 37).
      setLoadedMood(null);
      setExistingNote('');
    }

    const all = await getRecentJournalEntries(7);
    setPastEntries(all.filter((e) => e.date !== today));

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

  return {
    refreshing, setRefreshing, summary, pastEntries, loadedMood, existingNote,
    semanticSummary, weekMoods, events, loadData,
  };
}
