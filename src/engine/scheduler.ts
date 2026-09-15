import { getProfile, getMiscFlag, todayStr, localDateStr } from '../db/queries';
import { getScheduleRules, setT0, createDoseLogs, getDoseLogs, markOverdueDoses } from '../db/queries';
import { scheduleExerciseReminder, scheduleEndOfDaySummary, scheduleMorningReminder, scheduleSupplementNotification, cancelSupplementNotifications, scheduleWaterReminders } from '../notifications';
import type { ScheduledDose, DoseStatus } from '../types';
import { ruleFiresOn, cadenceOf } from './cadence';

import { locale } from '../i18n';
/**
 * Called when patient taps "Start My Day".
 * T=0 is the moment the first supplement goes in.
 * All dose times calculate forward from this anchor.
 */
export async function startDay(t0: Date = new Date()): Promise<ScheduledDose[]> {
  // Bedtime gate check.
  //
  // The cutoff is bedtime MINUS the last supplement's offset, not bedtime
  // itself: starting at 21:55 with a 22:00 bedtime and a +240 min last dose
  // scheduled that dose for 01:55, well past the boundary this gate exists to
  // protect. calculateBedtimeCutoff already did this arithmetic and had no
  // caller. With no rules yet the offset is 0 and the cutoff is bedtime, which
  // is the old behaviour.
  const profile = await getProfile();
  if (profile) {
    const cutoff = await getLatestStartTime();
    if (cutoff && new Date() >= cutoff) {
      throw new Error('BEDTIME_GATE');
    }
  }

  const t0Ms = t0.getTime();
  const dateStr = localDateStr(t0);

  // Stale reminders are cosmetic; failing to start the day is not. This used to
  // reject before setT0/createDoseLogs ran, so a notification hiccup meant the
  // user simply could not start their day.
  await cancelSupplementNotifications().catch(() => {});
  await setT0(t0Ms, dateStr);

  const rules = await getScheduleRules();

  // Cadence gate (schema v15). Before this, every rule fired every day, so a
  // Mon/Wed/Fri supplement was owed on Sunday too and the compliance figure
  // counted a dose the patient was never supposed to take. 'as-needed' rules
  // are never owed at all.
  const dueToday = rules.filter((rule) => ruleFiresOn(cadenceOf(rule), dateStr));

  const dosesToCreate = dueToday.map((rule) => ({
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
  // Water reminders run from T=0 to T+12h, the window the daily 2.5 L goal
  // is meant to be spread over.
  scheduleWaterReminders(t0, new Date(t0Ms + 12 * 60 * 60 * 1000)).catch(() => {});
  scheduleExerciseReminder(t0).catch(() => {});
  scheduleEndOfDaySummary(t0).catch(() => {});
  scheduleMorningReminder().catch(() => {});

  // Read the schedule back out of the rows we just created, rather than
  // rebuilding it from the rules. The rebuild produced objects with a
  // positional `id` and no `logId` at all, so for the whole first session after
  // "Start My Day" every dose in state was unactionable: HomeScreen's
  // handleTook/handleSkip are gated on `dose.logId`, so tapping "✓ Took it"
  // silently did nothing and the dose later aged out to "missed".
  return getTodaySchedule();
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

  return scheduledTime.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });
}

