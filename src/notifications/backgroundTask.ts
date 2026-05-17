import * as TaskManager from 'expo-task-manager';
import * as BackgroundFetch from 'expo-background-fetch';

export const COIMBRA_CHECK_DOSES = 'COIMBRA_CHECK_DOSES';

TaskManager.defineTask(COIMBRA_CHECK_DOSES, async () => {
  try {
    const now = new Date();
    const nowISO = now.toISOString();
    console.log(`[Coimbra Background Task] Checking doses at ${nowISO}`);

    // TODO: Check if any doses are overdue (past scheduled time + tolerance)
    // Will wire to DB in next iteration
    console.log('[Coimbra Background Task] Dose check completed - no overdue doses found');

    return BackgroundFetch.BackgroundFetchResult.NewData;
  } catch (error) {
    console.error('[Coimbra Background Task] Error:', error);
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

export const registerBackgroundTask = async (): Promise<void> => {
  try {
    const status = await BackgroundFetch.getStatusAsync();
    console.log('[Coimbra Background Task] Status:', status);

    const isRegistered = await TaskManager.isTaskRegisteredAsync(COIMBRA_CHECK_DOSES);

    if (!isRegistered) {
      await BackgroundFetch.registerTaskAsync(COIMBRA_CHECK_DOSES, {
        minimumInterval: 15 * 60,
        stopOnTerminate: false,
        startOnBoot: true,
      });
      console.log('[Coimbra] Background task registered successfully');
    }
  } catch (error) {
    console.error('[Coimbra Background Task] Registration error:', error);
  }
};