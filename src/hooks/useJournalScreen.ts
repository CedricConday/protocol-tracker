import { useCallback, useEffect, useState } from 'react';
import { getDailyJournalEntries, getDaySummary, getJournalEntry, getRecentJournalEntries, getRelapseEvents, localDateStr } from '../db/queries';
import type { JournalEntry, RelapseEvent } from '../types';

import { weekdaysShort } from '../i18n/dates';
import { useToday } from './useToday';
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
  //
  // `id` joined the value on 2026-09-17, when a day stopped being limited to one
  // entry. The editor binds to a ROW, not to a day: without the id, saving after
  // dinner had no way to say "this one" and could only overwrite by date.
  // `date: ''` is the "not read yet" state, and the screen waits for it — see
  // `loadedFor` below.
  const [loaded, setLoaded] = useState<{ date: string; id: number | null; mood: string | null; note: string; dietaryNote: string }>(
    { date: '', id: null, mood: null, note: '', dietaryNote: '' },
  );
  const [weekMoods, setWeekMoods] = useState<{ day: string; emoji: string | null; compliancePct: number }[]>([]);
  const [events, setEvents] = useState<RelapseEvent[]>([]);

  // `useToday()` rather than `todayStr()`: both answer the same on the render
  // that reads them, but only the hook re-renders when the local day rolls, so
  // a screen left open overnight moves to the new day on its own.
  const today = useToday();

  const loadData = useCallback(async () => {
    const daySummary = await getDaySummary(today);
    setSummary({ takenDoses: daySummary.takenDoses, totalDoses: daySummary.totalDoses });

    // The day's MOST RECENT entry — what the editor opens on. Earlier entries
    // for the same day are in `pastEntries` below, where they can be read and
    // removed but not silently written over.
    const existing = await getJournalEntry(today);
    setLoaded(existing
      ? { date: today, id: existing.id, mood: existing.mood, note: existing.note, dietaryNote: existing.dietary_note ?? '' }
      : { date: today, id: null, mood: null, note: '', dietaryNote: '' });

    // Today is IN the list.
    //
    // It used to be filtered out, because the editor above this list is today's
    // entry and showing it twice looked redundant. From the user's side that
    // reads as a logging bug: you pick a mood, it saves, you scroll to "Recent
    // Entries" — which is your log — and the newest thing in it is yesterday.
    // Reported from the device as exactly that.
    //
    // Twelve rather than seven since 2026-09-17: the list is entries, not days,
    // and a single day of journalling can now fill it on its own.
    const all = await getRecentJournalEntries(12);
    setPastEntries(all);

    const recentEvents = await getRelapseEvents(10);
    setEvents(recentEvents);

    // One row per day, from the database. Picking the first match out of
    // `all` worked only while a day could hold a single entry — twelve rows can
    // now all belong to Tuesday, which would blank the rest of the strip.
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - 6);
    const week = await getDailyJournalEntries(localDateStr(weekStart), today);

    const weekDays: { day: string; emoji: string | null; compliancePct: number }[] = [];
    const todayIdx = ((new Date().getDay() + 6) % 7);
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = localDateStr(d);
      const entry = week.find((e) => e.date === dateStr);
      const summary = await getDaySummary(dateStr);
      weekDays.push({
        day: weekdaysShort()[(todayIdx - i + 7) % 7],
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
  const loadedDietaryNote = loaded.date === today ? loaded.dietaryNote : '';
  const loadedId = loaded.date === today ? loaded.id : null;
  // Which day the load in hand actually answered for. The screen must not seed
  // its editor from a load that has not landed yet: an empty read and "this day
  // has nothing in it" are not the same thing, and only this tells them apart.
  const loadedFor = loaded.date;

  return {
    refreshing, setRefreshing, summary, pastEntries, loadedMood, existingNote,
    loadedDietaryNote, loadedId, loadedFor,
    weekMoods, events, loadData,
  };
}
