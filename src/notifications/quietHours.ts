import { getMiscFlag } from '../db/queries';
import { parseHhMm, isInWindow } from './quietWindow';

export { parseHhMm, isInWindow };

/**
 * Quiet hours.
 *
 * Settings has written `notif_quiet_start` / `notif_quiet_end` since the panel
 * was built, and until 2026-09-14 nothing read them: the window was set and the
 * notifications fired straight through it. This is the reader.
 *
 * OPT-IN. The flag below defaults to false, so an install that never opens the
 * panel behaves exactly as before — the two times are inert until the user
 * turns the feature on, which is the honest default for something that can
 * silence a dose reminder.
 *
 * A notification landing inside the window is DROPPED, not deferred. Deferring
 * a 23:30 dose to 07:00 would reminded the user about yesterday, which is worse
 * than silence; the log still shows the dose as missed either way.
 */

export const QUIET_ENABLED_FLAG = 'notif_quiet_enabled';
export const QUIET_START_FLAG = 'notif_quiet_start';
export const QUIET_END_FLAG = 'notif_quiet_end';

export const DEFAULT_QUIET_START = '22:00';
export const DEFAULT_QUIET_END = '07:00';

/** The user's window, or null when the feature is off or the times are unusable. */
export async function getQuietWindow(): Promise<{ start: number; end: number } | null> {
  try {
    const enabled = await getMiscFlag(QUIET_ENABLED_FLAG);
    if (enabled !== 'true') return null;
    const start = parseHhMm((await getMiscFlag(QUIET_START_FLAG)) ?? DEFAULT_QUIET_START);
    const end = parseHhMm((await getMiscFlag(QUIET_END_FLAG)) ?? DEFAULT_QUIET_END);
    if (start === null || end === null) return null;
    return { start, end };
  } catch {
    // A failed read must not silence the app: no window, notify as normal.
    return null;
  }
}

/** True when a notification at `date` should be suppressed. */
export async function isQuietAt(date: Date): Promise<boolean> {
  const window = await getQuietWindow();
  if (!window) return false;
  return isInWindow(date.getHours() * 60 + date.getMinutes(), window.start, window.end);
}
