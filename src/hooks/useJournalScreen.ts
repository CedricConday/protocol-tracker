import { useCallback, useEffect, useState } from 'react';
import { getDaySummary, getJournalEntry, getRecentJournalEntries, getSemanticJournalSummary, todayStr } from '../db/queries';
import type { JournalEntry } from '../types';

export function useJournalScreen() {
  const [refreshing, setRefreshing] = useState(false);
  const [summary, setSummary] = useState({ takenDoses: 0, totalDoses: 0 });
  const [pastEntries, setPastEntries] = useState<JournalEntry[]>([]);
  const [loadedMood, setLoadedMood] = useState<string | null>(null);
  const [existingNote, setExistingNote] = useState('');
  const [semanticSummary, setSemanticSummary] = useState('');
  const [weekMoods, setWeekMoods] = useState<{ day: string; emoji: string | null; compliancePct: number }[]>([]);

  const today = todayStr();

  const loadData = useCallback(async () => {
    const daySummary = await getDaySummary(today);
    setSummary({ takenDoses: daySummary.takenDoses, totalDoses: daySummary.totalDoses });

    const existing = await getJournalEntry(today);
    if (existing) {
      setLoadedMood(existing.mood);
      setExistingNote(existing.note);
    }

    const all = await getRecentJournalEntries(7);
    setPastEntries(all.filter((e) => e.date !== today));

    const summary = await getSemanticJournalSummary();
    setSemanticSummary(summary);

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

  return {
    refreshing, setRefreshing, summary, pastEntries, loadedMood, existingNote,
    semanticSummary, weekMoods, loadData,
  };
}
