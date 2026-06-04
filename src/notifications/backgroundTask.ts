import * as TaskManager from 'expo-task-manager';
import * as BackgroundFetch from 'expo-background-fetch';
import { getDb } from '../db/schema';
import { scheduleMissedDoseAlert } from './index';

export const CHECK_DOSES = 'CHECK_DOSES';

TaskManager.defineTask(CHECK_DOSES, async () => {
  try {
    const now = new Date();
    const nowISO = now.toISOString();
    console.log(`[Protocol Tracker Background Task] Checking doses at ${nowISO}`);

    const db = await getDb();
    
    // Query today's pending dose logs
    type DoseRow = { id: number; supplement_name: string; scheduled_time: number; status: string; tolerance_window: number };
    const doseLogs = await db.getAllAsync<DoseRow>(`
      SELECT dl.id, s.name as supplement_name, dl.scheduled_time,
             dl.status, sr.tolerance_window
      FROM dose_logs dl
      JOIN schedule_rules sr ON dl.rule_id = sr.id
      JOIN supplements s ON sr.supplement_id = s.id
      WHERE dl.date = date('now') AND dl.status = 'pending'
    `);

    for (const log of doseLogs) {
      const scheduledTime = new Date(log.scheduled_time);
      const toleranceWindow = log.tolerance_window;
      const deadline = new Date(scheduledTime.getTime() + (toleranceWindow * 60 * 1000));
      
      // Check if past deadline and still pending
      if (now >= deadline && log.status === 'pending') {
        // Check if we've already alerted for this dose to avoid duplicates
        const existingLog = await db.getFirstAsync<{ missed_alerted: number }>(`
          SELECT missed_alerted FROM dose_logs WHERE id = ?
        `, [log.id]);
        
        if (existingLog && existingLog.missed_alerted === 0) {
          // Schedule the missed dose alert
          await scheduleMissedDoseAlert(log.supplement_name, scheduledTime);
          
          // Mark as alerted to prevent re-firing
          await db.runAsync(`
            UPDATE dose_logs SET missed_alerted = 1 WHERE id = ?
          `, [log.id]);
          
          console.log(`[Protocol Tracker Background Task] Scheduled missed dose alert for ${log.supplement_name}`);
        }
      }
    }

    console.log('[Protocol Tracker Background Task] Dose check completed');
    return BackgroundFetch.BackgroundFetchResult.NewData;
  } catch (error) {
    console.error('[Protocol Tracker Background Task] Error:', error);
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

export const registerBackgroundTask = async (): Promise<void> => {
  try {
    const status = await BackgroundFetch.getStatusAsync();
    console.log('[Protocol Tracker Background Task] Status:', status);

    const isRegistered = await TaskManager.isTaskRegisteredAsync(CHECK_DOSES);

    if (!isRegistered) {
      await BackgroundFetch.registerTaskAsync(CHECK_DOSES, {
        minimumInterval: 15 * 60,
        stopOnTerminate: false,
        startOnBoot: true,
      });
      console.log('[Protocol Tracker] Background task registered successfully');
    }
  } catch (error) {
    // Background fetch requires UIBackgroundModes in Info.plist — not available in Expo Go
    console.warn('[Protocol Tracker Background Task] Registration skipped (Expo Go):', error);
  }
};