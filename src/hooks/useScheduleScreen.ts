import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getDoseLogs, getDaySummary, getScheduleRules } from '../db/queries';
import { formatDoseTime } from '../engine/scheduler';
import type { DoseLog, DoseStatus, ScheduledDose } from '../types';

interface DayCell { date: string; dayNumber: number; compliancePct: number; totalDoses: number; isToday: boolean; }

function buildLast30Days(): string[] {
  const days: string[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    days.push(d.toISOString().split('T')[0]);
  }
  return days;
}

function logToScheduledDose(
  log: DoseLog & {
    supplement_name: string;
    supplement_form: string;
    dose_amount: string;
    with_food: number;
    tolerance_window: number;
    skip_reason: string | null;
  },
): ScheduledDose {
  const scheduledTime = new Date(log.scheduled_time);
  const toleranceMs = log.tolerance_window * 60 * 1000;

  let status = log.status as DoseStatus;
  if (status === 'upcoming') {
    const minsUntil = (log.scheduled_time - Date.now()) / 60000;
    if (minsUntil <= 10 && minsUntil > -log.tolerance_window) {
      status = 'due';
    }
  }

  return {
    id: log.id,
    supplement_id: log.supplement_id,
    supplementName: log.supplement_name,
    form: log.supplement_form,
    scheduledTime,
    earliestTime: new Date(log.scheduled_time - toleranceMs),
    latestTime: new Date(log.scheduled_time + toleranceMs),
    status,
    toleranceMinutes: log.tolerance_window,
    doseAmount: log.dose_amount,
    withFood: log.with_food === 1,
    logId: log.id,
    skipReason: log.skip_reason ?? undefined,
  };
}

function isoWeek(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${week}`;
}

export function useScheduleScreen() {
  const [doses, setDoses] = useState<ScheduledDose[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [showHighDoseAlert, setShowHighDoseAlert] = useState(false);
  const [calCells, setCalCells] = useState<DayCell[]>([]);
  const [calLoaded, setCalLoaded] = useState(false);

  const loadCalendar = useCallback(async () => {
    const dateStrs = buildLast30Days();
    const todayStr = new Date().toISOString().split('T')[0];
    const results = await Promise.all(
      dateStrs.map(async (dateStr) => {
        const summary = await getDaySummary(dateStr);
        return { date: dateStr, dayNumber: new Date(dateStr + 'T12:00:00').getDate(), compliancePct: summary.compliancePct, totalDoses: summary.totalDoses, isToday: dateStr === todayStr };
      }),
    );
    setCalCells(results);
    setCalLoaded(true);
  }, []);

  const loadSchedule = useCallback(async () => {
    const logs = await getDoseLogs();
    setDoses(logs.map(logToScheduledDose));
    setLoaded(true);
  }, []);

  useEffect(() => {
    (async () => {
      const rules = await getScheduleRules();
      const d3 = rules.find((r) => r.supplement_id === 'vit_d3');
      if (!d3) return;
      const amount = parseFloat(d3.dose_amount);
      if (isNaN(amount) || amount <= 40000) return;
      const thisWeek = isoWeek(new Date());
      const seen = await AsyncStorage.getItem('high_dose_alert_week');
      if (seen !== thisWeek) setShowHighDoseAlert(true);
    })();
  }, []);

  useEffect(() => {
    loadSchedule();
    const interval = setInterval(loadSchedule, 60_000);
    return () => clearInterval(interval);
  }, [loadSchedule]);

  return {
    doses, refreshing, setRefreshing, loaded, showHighDoseAlert, setShowHighDoseAlert,
    calCells, calLoaded,
    loadSchedule, loadCalendar,
  };
}
