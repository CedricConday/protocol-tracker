import { getAnchor, getProfile, getMiscFlag, todayStr, localDateStr } from '../db/queries';
import { getScheduleRules, setT0, createDoseLogs, getDoseLogs, markOverdueDoses } from '../db/queries';
import { scheduleExerciseReminder, scheduleEndOfDaySummary, scheduleMorningReminder, scheduleSupplementNotification, cancelSupplementNotifications, scheduleWaterReminders } from '../notifications';
import type { ScheduledDose, DoseStatus } from '../types';
import { ruleFiresOn, cadenceOf } from './cadence';

import { locale } from '../i18n';
import { bedtimeAfter } from '../utils/time';
/** The water window: T=0 to twelve hours later. Shared so a reschedule cannot
 *  drift from the window the day was opened with. */
export const WATER_WINDOW_MS = 12 * 60 * 60 * 1000;

let waterInFlight: Promise<void> | null = null;
let waterQueued = false;

async function runWaterReschedule(): Promise<void> {
  const anchor = await getAnchor(todayStr());
  // No T=0 means the day was never opened, so there is nothing pending to
  // correct — the next "Start My Day" will write reminders against whatever the
  // goal is by then.
  if (!anchor?.t0_timestamp) return;
  const t0 = new Date(anchor.t0_timestamp);
  await scheduleWaterReminders(t0, new Date(anchor.t0_timestamp + WATER_WINDOW_MS));
}

/**
 * Rewrite today's water reminders against the goal as it stands now.
 *
 * Why this exists: `scheduleWaterReminders` bakes the goal into the body text,
 * because a DATE-triggered notification carries the words it was written with
 * and cannot look anything up when it fires. Until 2026-09-17 the only caller
 * was `startDay`, so editing the goal on the Water screen changed the screen and
 * left the day's reminders quoting the old number — and sized for it: five
 * nudges written for 2500 ml kept firing against a 1000 ml goal.
 *
 * Calls collapse rather than queue up. Six taps of "−" are one intent, and two
 * overlapping runs would interleave a cancel with the other's schedule and leave
 * duplicates behind. While one run is in flight the next is remembered as a
 * single trailing run, so the last state always wins and no timer is needed —
 * nothing is lost if the screen closes a moment after the tap.
 */
export function rescheduleWaterReminders(): Promise<void> {
  if (waterInFlight) {
    waterQueued = true;
    return waterInFlight;
  }
  waterInFlight = runWaterReschedule()
    .catch(() => {})
    .finally(() => { waterInFlight = null; })
    .then(() => {
      if (!waterQueued) return;
      waterQueued = false;
      return rescheduleWaterReminders();
    });
  return waterInFlight;
}

/**
 * Called when patient taps "Start My Day".
 * T=0 is the moment the first supplement goes in.
 * All dose times calculate forward from this anchor.
 */
export async function startDay(t0: Date = new Date()): Promise<ScheduledDose[]> {
  // No bedtime gate. This used to throw BEDTIME_GATE once the clock passed
  // bedtime minus the last dose's offset, which refused to open the day at all
  // — a fixed wall-clock boundary vetoing a T=0 system. Someone who woke at
  // 14:00, or was up late, simply could not start, in an app whose whole premise
  // is that the day begins when the patient begins it.
  //
  // The information the gate carried was worth keeping, so it moved to
  // `dosesPastBedtime()` below, which the caller shows as a warning before
  // starting. Warn, then let them decide. See BedtimeScreen.
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

  // Fire-and-forget — don't block the schedule return on notification errors.
  // T=0 → T+12h is the WINDOW; how many reminders fall inside it comes from the
  // user's goal, not from this call. See notifications/waterCadence.ts.
  scheduleWaterReminders(t0, new Date(t0Ms + WATER_WINDOW_MS)).catch(() => {});
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
      offsetMinutes: log.offset_minutes,
      doseAmount: log.dose_amount,
      withFood: log.with_food === 1,
      notes: log.supplement_notes ?? '',
      logId: log.id,
    };
  });
}

/**
 * The latest T=0 that still fits every dose in before bedtime.
 *
 * Informational since 2026-09-16 — nothing refuses a start past this any more.
 * Bedtime shows it so the number the patient sets is visibly connected to what
 * it affects. Returns null if there is no profile yet.
 */
export async function getLatestStartTime(from: Date = new Date()): Promise<Date | null> {
  const { getProfile, getScheduleRules } = await import('../db/queries');
  const profile = await getProfile();
  if (!profile) return null;
  const rules = await getScheduleRules();
  const lastOffset = rules.reduce((max, r) => Math.max(max, r.offset_minutes), 0);
  return calculateBedtimeCutoff(profile.bedtime_hour, profile.bedtime_minute, lastOffset, from);
}

/**
 * Latest T=0 that still allows all supplements before bedtime.
 *
 * Resolves bedtime through `bedtimeAfter`, so a bedtime of 01:30 is tonight
 * after midnight rather than an instant that already passed this morning.
 */
export function calculateBedtimeCutoff(
  bedtimeHour: number,
  bedtimeMinute: number,
  lastSupplementOffsetMinutes: number,
  from: Date = new Date()
): Date {
  const bedtime = bedtimeAfter(from, bedtimeHour, bedtimeMinute);
  return new Date(bedtime.getTime() - lastSupplementOffsetMinutes * 60 * 1000);
}

/**
 * Which of today's doses would land after bedtime if the day started at `t0`.
 *
 * Replaces the BEDTIME_GATE throw: the caller asks first, shows the list, and
 * the patient decides whether to start anyway. Only rules that actually fire
 * today are considered, so a Mon/Wed/Fri supplement does not appear in a Sunday
 * warning about doses that were never owed.
 *
 * Returns [] when there is no profile or nothing is due — an empty list means
 * "nothing to warn about", never "could not tell".
 */
export async function dosesPastBedtime(
  t0: Date = new Date(),
): Promise<{ name: string; at: Date }[]> {
  const { getProfile, getScheduleRules } = await import('../db/queries');
  const profile = await getProfile();
  if (!profile) return [];

  const bedtime = bedtimeAfter(t0, profile.bedtime_hour, profile.bedtime_minute);
  const rules = await getScheduleRules();
  const dateStr = localDateStr(t0);

  return rules
    .filter((rule) => ruleFiresOn(cadenceOf(rule), dateStr))
    .map((rule) => ({
      name: rule.supplement_name,
      at: new Date(t0.getTime() + rule.offset_minutes * 60 * 1000),
    }))
    .filter((dose) => dose.at.getTime() > bedtime.getTime())
    .sort((a, b) => a.at.getTime() - b.at.getTime());
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

