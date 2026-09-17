/**
 * How many water reminders a day gets, and when.
 *
 * Measured on master before this file existed: `scheduleWaterReminders` walked
 * T=0 → T+12h in fixed 90-minute steps, `while (currentTime <= endTime)`, which
 * is **nine** notifications — one at the instant "Start My Day" was tapped, then
 * 1:30, 3:00, 4:30, 6:00, 7:30, 9:00, 10:30 and 12:00 after it. Each one asks
 * for 500 ml, so the day's reminders added up to 4500 ml against a default goal
 * of 2500 ml: nearly twice the water the app is asking for, and the interval
 * never moved when the goal was edited on the Water screen.
 *
 * The count now comes from the goal. One reminder is one glass, so the day needs
 * as many as the goal has glasses left in it — five on the 2500 ml default —
 * spread evenly over the window. Nothing fires at T=0 itself: the patient is
 * holding the phone, having just opened the day.
 */

/** One nudge is one glass, matching the body text and the tracker's bar. */
export const WATER_NUDGE_ML = 500;

/**
 * A ceiling no goal can argue past. Someone on a 6 L goal would otherwise be
 * reminded twelve times, which is the behaviour this file exists to stop.
 */
export const MAX_WATER_REMINDERS = 6;

/**
 * The times to fire at, in order.
 *
 * Empty when the goal is already met — the caller then schedules nothing rather
 * than reminding someone to drink water they have already drunk. That case was
 * previously only handled at delivery, and only while the app was in the
 * foreground, which cancelled the one notification already on screen and left
 * the rest of the day's to fire regardless.
 */
export function waterReminderTimes(
  t0: Date,
  endTime: Date,
  goalMl: number,
  alreadyMl: number = 0,
): Date[] {
  const windowMs = endTime.getTime() - t0.getTime();
  if (windowMs <= 0) return [];

  const remaining = goalMl - alreadyMl;
  if (remaining <= 0) return [];

  const count = Math.min(MAX_WATER_REMINDERS, Math.ceil(remaining / WATER_NUDGE_ML));
  if (count <= 0) return [];

  // `i` runs 1..count, so the last reminder lands on `endTime` and none lands on
  // `t0`. Even spacing rather than a fixed interval is what keeps the count and
  // the window independent of each other.
  const step = windowMs / count;
  return Array.from({ length: count }, (_, i) => new Date(t0.getTime() + step * (i + 1)));
}
