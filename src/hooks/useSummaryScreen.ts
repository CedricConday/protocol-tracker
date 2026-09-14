import { useCallback, useEffect, useState } from 'react';
import {
  getDaySummary, getWeekSummary, getStreak, getAnchor,
  getRecentJournalEntries, getProfile, localDateStr,
} from '../db/queries';
import type { DaySummary } from '../types';

import { weekdaysShort } from '../i18n/dates';
export function useSummaryScreen() {
  const [summary, setSummary] = useState<DaySummary | null>(null);
  const [weekData, setWeekData] = useState<{ date: string; compliancePct: number; totalDoses: number; waterMl: number }[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [streak, setStreak] = useState(0);
  const [moodWeek, setMoodWeek] = useState<{ day: string; score: number | null }[]>([]);
  const [waterWeek, setWaterWeek] = useState<{ day: string; ml: number }[]>([]);
  const [patientName, setPatientName] = useState('Patient');

  const loadData = useCallback(async () => {
    // One failing query should cost its own card, not the whole screen:
    // everything below the throw used to be skipped, leaving Records blank.
    try {
      const daySummary = await getDaySummary();
      setSummary(daySummary);
      const s = await getStreak();
      setStreak(s);
      const week = await getWeekSummary();
      const enriched = await Promise.all(
        week.map(async (d) => {
          const full = await getDaySummary(d.date);
          const anchor = await getAnchor(d.date);
          return { ...d, totalDoses: full.totalDoses, waterMl: anchor?.water_ml ?? 0 };
        }),
      );
      setWeekData(enriched);

      const MOOD_SCORES: Record<string, number> = { '😄': 5, '🙂': 4, '😐': 3, '😔': 2, '😞': 1 };
      const todayIdx = ((new Date().getDay() + 6) % 7);
      const journals = await getRecentJournalEntries(7);
      const moodData = [];
      const waterData = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(); d.setDate(d.getDate() - i);
        const dateStr = localDateStr(d);
        const entry = journals.find((j) => j.date === dateStr);
        const anchor = await getAnchor(dateStr);
        moodData.push({ day: weekdaysShort()[(todayIdx - i + 7) % 7], score: entry ? (MOOD_SCORES[entry.mood] ?? null) : null });
        waterData.push({ day: weekdaysShort()[(todayIdx - i + 7) % 7], ml: anchor?.water_ml ?? 0 });
      }
      setMoodWeek(moodData);
      setWaterWeek(waterData);
      const profile = await getProfile();
      if (profile?.name) setPatientName(profile.name);
    } catch (e) {
      console.error('[Summary] load failed:', e);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  return {
    summary, weekData, refreshing, setRefreshing,
    streak, moodWeek, waterWeek, patientName,
    loadData,
  };
}
