/**
 * A reminder that arrives has to make a noise the app itself controls.
 *
 * The tone shipped on 2026-09-20 and only the Settings test ever played it, so
 * every real reminder was still at the mercy of the OS — silent wherever the OS
 * swallows it, which is exactly the Chromebook case the tone was written for.
 * These pin the wiring: which arriving types sound, and which deliberately do
 * not.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const playReminderTone = vi.fn(async () => true);
let waterProgress = { waterMl: 0, goalMl: 2500 };
let received: ((n: unknown) => void | Promise<void>) | null = null;

vi.mock('react-native', () => ({
  Alert: { alert: vi.fn() },
  Platform: { OS: 'android' },
}));
vi.mock('expo-device', () => ({ isDevice: true }));
vi.mock('expo-notifications', () => ({
  setNotificationHandler: vi.fn(),
  setNotificationCategoryAsync: vi.fn(async () => {}),
  setNotificationChannelAsync: vi.fn(async () => {}),
  deleteNotificationChannelAsync: vi.fn(async () => {}),
  addNotificationReceivedListener: (fn: (n: unknown) => void) => { received = fn; return { remove: vi.fn() }; },
  addNotificationResponseReceivedListener: vi.fn(() => ({ remove: vi.fn() })),
  getAllScheduledNotificationsAsync: vi.fn(async () => []),
  cancelScheduledNotificationAsync: vi.fn(async () => {}),
  scheduleNotificationAsync: vi.fn(async () => 'id'),
  AndroidImportance: { HIGH: 4, DEFAULT: 3, LOW: 2 },
  AndroidNotificationVisibility: { PRIVATE: 0 },
  SchedulableTriggerInputTypes: { DATE: 'date', TIME_INTERVAL: 'timeInterval', DAILY: 'daily' },
}));
vi.mock('../backgroundTask', () => ({ CHECK_DOSES: 'CHECK_DOSES', registerBackgroundTask: vi.fn() }));
vi.mock('../../db/schema', () => ({ getDb: vi.fn() }));
vi.mock('../../navigation/navigationRef', () => ({ navigate: vi.fn() }));
vi.mock('../../i18n', () => ({ t: (k: string) => k }));
vi.mock('../../db/queries', () => ({
  getWaterProgress: async () => waterProgress,
  getMiscFlag: async () => null,
  setMiscFlag: vi.fn(),
  getAverageStartTime: vi.fn(),
  getLowStockSupplements: vi.fn(),
  getPatientName: vi.fn(),
}));
vi.mock('../../sound/reminderTone', () => ({
  playReminderTone: (...a: unknown[]) => playReminderTone(...(a as [])),
  releaseReminderTone: vi.fn(),
  reminderToneStatus: vi.fn(),
}));

import { setupNotificationHandler } from '../index';

const arrive = async (type: string | undefined) => {
  await received?.({
    request: { identifier: 'n1', content: { title: 'T', body: 'B', data: type ? { type } : {} } },
  });
  // The tone is fired and not awaited, by design — let the microtask run.
  await Promise.resolve();
};

describe('an arriving reminder sounds from the app, not only from the OS', () => {
  beforeEach(() => {
    playReminderTone.mockClear();
    waterProgress = { waterMl: 0, goalMl: 2500 };
    setupNotificationHandler();
  });

  it('registers a listener at all', () => {
    expect(received).toBeTypeOf('function');
  });

  for (const type of ['supplement', 'water', 'exercise', 'morning', 'missed', 'test']) {
    it(`plays the tone for a ${type} reminder`, async () => {
      await arrive(type);
      expect(playReminderTone).toHaveBeenCalledTimes(1);
      // Unforced: quiet hours stay in charge of whether it actually sounds.
      expect(playReminderTone.mock.calls[0]).toEqual([]);
    });
  }

  it('stays silent for the end-of-day summary, which is quiet on purpose', async () => {
    await arrive('summary');
    expect(playReminderTone).not.toHaveBeenCalled();
  });

  it('stays silent for a notification carrying no type, such as the dose-confirmed toast', async () => {
    await arrive(undefined);
    expect(playReminderTone).not.toHaveBeenCalled();
  });

  it('does not sound a water reminder that is being cancelled for a met goal', async () => {
    waterProgress = { waterMl: 2600, goalMl: 2500 };
    await arrive('water');
    expect(playReminderTone).not.toHaveBeenCalled();
  });
});
