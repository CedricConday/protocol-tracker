import AsyncStorage from '@react-native-async-storage/async-storage';
import { getWeekSummary } from '../db/queries';

/**
 * "A week has passed and there is something in it" — nothing more.
 *
 * Until 2026-09-17 this RENDERED A PDF of the last seven days, unprompted, on
 * the first open of any Sunday, and parked the file for a banner to share. That
 * was wrong three times over: it was a third hand-rolled HTML builder that had
 * drifted from the other two, it wrote a document containing the user's health
 * data to disk without being asked, and the banner then handed that file
 * straight to the OS share sheet with no say over what was in it.
 *
 * Now it raises a flag. The banner opens the one share sheet, preset to that
 * week, and the document is built — with whatever sections the user picks — at
 * the moment they decide to send it. Nothing is written until then.
 */
const LAST_WEEK_KEY = 'auto_report_last_week';
const DUE_KEY = 'auto_report_due';

function isoWeek(d: Date): string {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

export async function checkAndGenerateWeeklyReport(): Promise<void> {
  const now = new Date();
  if (now.getDay() !== 0) return; // Sunday

  const currentWeek = isoWeek(now);
  if ((await AsyncStorage.getItem(LAST_WEEK_KEY)) === currentWeek) return;

  // Nothing logged, nothing to offer. A banner on an empty week is noise.
  const week = await getWeekSummary();
  if (week.length === 0) return;

  await AsyncStorage.setItem(LAST_WEEK_KEY, currentWeek);
  await AsyncStorage.setItem(DUE_KEY, currentWeek);
}

/** The week the banner is offering, or null when there is nothing to offer. */
export async function weeklyReportDue(): Promise<string | null> {
  return AsyncStorage.getItem(DUE_KEY);
}

export async function dismissWeeklyReport(): Promise<void> {
  await AsyncStorage.removeItem(DUE_KEY);
  // The pre-rendered file this used to leave behind. Cleared so an install
  // upgrading across this change does not keep a stale PDF of last week's
  // health data sitting in storage.
  await AsyncStorage.removeItem('auto_report_ready_uri');
}
