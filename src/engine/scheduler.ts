import { getProfile, getMiscFlag, todayStr } from '../db/queries';
import { getScheduleRules, setT0, createDoseLogs, getDoseLogs, markOverdueDoses } from '../db/queries';
import { scheduleExerciseReminder, scheduleEndOfDaySummary, scheduleMorningReminder, scheduleSupplementNotification, cancelSupplementNotifications } from '../notifications';
import type { ScheduledDose, DoseStatus } from '../types';

/**
 * Called when patient taps "Start My Day".
 * T=0 is the moment the first supplement goes in.
 * All dose times calculate forward from this anchor.
 */
export async function startDay(t0: Date = new Date()): Promise<ScheduledDose[]> {
  // Bedtime gate check
  const profile = await getProfile();
  if (profile) {
    const now = new Date();
    const cutoffHour = profile.bedtime_hour ?? 22;
    const cutoffMin = profile.bedtime_minute ?? 0;
    const cutoff = new Date();
    cutoff.setHours(cutoffHour, cutoffMin, 0, 0);
    if (now >= cutoff) {
      throw new Error('BEDTIME_GATE');
    }
  }

  const t0Ms = t0.getTime();
  const dateStr = t0.toISOString().split('T')[0];

  await cancelSupplementNotifications();
  await setT0(t0Ms, dateStr);

  const rules = await getScheduleRules();

  const dosesToCreate = rules.map((rule) => ({
    supplement_id: rule.supplement_id,
    rule_id: rule.id,
    scheduled_time: t0Ms + rule.offset_minutes * 60 * 1000,
  }));

  await createDoseLogs(dosesToCreate, dateStr);

  // Schedule notifications for future doses
  for (const d of dosesToCreate) {
    const scheduledTime = new Date(d.scheduled_time);
    if (scheduledTime.getTime() > Date.now()) {
      const rule = rules.find(r => r.id === d.rule_id);
      if (rule) {
        scheduleSupplementNotification({
          id: rule.supplement_id,
          supplementName: rule.supplement_name,
          doseAmount: rule.dose_amount,
          scheduledTime: scheduledTime,
          notes: rule.notes,
        }).catch(() => {});
      }
    }
  }

  // Fire-and-forget — don't block the schedule return on notification errors
  scheduleExerciseReminder(t0).catch(() => {});
  scheduleEndOfDaySummary(t0).catch(() => {});
  scheduleMorningReminder().catch(() => {});

  return buildScheduledDoses(rules, t0Ms);
}

/**
 * Load today's schedule with live status calculation.
 */
export async function getTodaySchedule(): Promise<ScheduledDose[]> {
  const today = todayStr();
  await markOverdueDoses(today);

  const logs = await getDoseLogs(today);
  const now = Date.now();

  return logs.map((log) => {
    const scheduledTime = new Date(log.scheduled_time);
    const toleranceMs = log.tolerance_window * 60 * 1000;
    const earliestTime = new Date(log.scheduled_time - toleranceMs);
    const latestTime = new Date(log.scheduled_time + toleranceMs);

    let status = log.status as DoseStatus;
    if (status === 'upcoming') {
      const minsUntil = (log.scheduled_time - now) / 60000;
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
      earliestTime,
      latestTime,
      status,
      toleranceMinutes: log.tolerance_window,
      doseAmount: log.dose_amount,
      withFood: log.with_food === 1,
      notes: log.supplement_notes ?? '',
      logId: log.id,
    };
  });
}

/**
 * Returns the latest T=0 that fits the full schedule before the user's bedtime.
 * Returns null if profile not set.
 */
export async function getLatestStartTime(): Promise<Date | null> {
  const { getProfile, getScheduleRules } = await import('../db/queries');
  const profile = await getProfile();
  if (!profile) return null;
  const rules = await getScheduleRules();
  const lastOffset = rules.reduce((max, r) => Math.max(max, r.offset_minutes), 0);
  return calculateBedtimeCutoff(profile.bedtime_hour, profile.bedtime_minute, lastOffset);
}

/**
 * Latest T=0 that still allows all supplements before bedtime.
 */
export function calculateBedtimeCutoff(
  bedtimeHour: number,
  bedtimeMinute: number,
  lastSupplementOffsetMinutes: number
): Date {
  const today = new Date();
  const bedtime = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
    bedtimeHour,
    bedtimeMinute
  );
  return new Date(bedtime.getTime() - lastSupplementOffsetMinutes * 60 * 1000);
}

/**
 * Human-readable time relative to now.
 */
export function formatDoseTime(scheduledTime: Date): string {
  const diffMs = scheduledTime.getTime() - Date.now();
  const diffMin = Math.round(diffMs / 60000);

  if (Math.abs(diffMin) < 1) return 'Now';
  if (diffMin > 0 && diffMin < 60) return `In ${diffMin} min`;
  if (diffMin < 0 && diffMin > -60) return `${Math.abs(diffMin)} min ago`;

  return scheduledTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function buildScheduledDoses(
  rules: Awaited<ReturnType<typeof getScheduleRules>>,
  t0Ms: number
): ScheduledDose[] {
  const now = Date.now();

  return rules.map((rule, idx) => {
    const scheduledMs = t0Ms + rule.offset_minutes * 60 * 1000;
    const toleranceMs = rule.tolerance_window * 60 * 1000;
    const scheduledTime = new Date(scheduledMs);

    const minsUntil = (scheduledMs - now) / 60000;
    let status: DoseStatus = 'upcoming';
    if (minsUntil <= 10 && minsUntil > -rule.tolerance_window) status = 'due';

    return {
      id: idx + 1,
      supplement_id: rule.supplement_id,
      supplementName: rule.supplement_name,
      form: rule.supplement_form,
      scheduledTime,
      earliestTime: new Date(scheduledMs - toleranceMs),
      latestTime: new Date(scheduledMs + toleranceMs),
      status,
      toleranceMinutes: rule.tolerance_window,
      doseAmount: rule.dose_amount,
      withFood: Boolean(rule.with_food),
      notes: '',
    };
  });
}
