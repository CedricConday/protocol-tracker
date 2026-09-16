import { useCallback, useEffect, useRef, useState } from 'react';
import * as Updates from 'expo-updates';

/**
 * Over-the-air updates, driven by the user rather than by the app.
 *
 * `077dbbb` wired EAS Update into `app.json` (channel, runtimeVersion,
 * `updates.url`) and installed `expo-updates`, but nothing ever called it, so a
 * published update only landed if the OS happened to cold-start the app. This
 * hook is the missing half.
 *
 * Two deliberate choices:
 *
 * 1. **It never reloads on its own.** `Updates.reloadAsync()` tears the app down
 *    and relaunches it. Doing that unprompted can happen while someone is
 *    halfway through logging a dose or typing a journal entry, and this is a
 *    medical record — losing an in-flight entry is worse than running yesterday's
 *    bundle for another hour. So a download leaves the hook in `ready` and waits
 *    for a second, explicit press.
 *
 * 2. **`Updates.isEnabled` is checked first, not assumed.** It is false in dev
 *    and in any build without the updates module, where every call below throws.
 *    The screen renders a disabled row in that case rather than a button that
 *    errors on tap.
 */

export type UpdateState =
  /** `expo-updates` is off — dev client, Expo Go without a channel, or a build with updates disabled. */
  | 'unsupported'
  /** Nothing attempted yet this session. */
  | 'idle'
  | 'checking'
  | 'downloading'
  /** Downloaded and staged. The next reload runs it. */
  | 'ready'
  /** Checked, and the running bundle is already the newest. */
  | 'current'
  | 'error';

export type AppUpdate = {
  state: UpdateState;
  /** When the last successful check finished, for the "last checked" line. */
  lastChecked: Date | null;
  /** Populated only in the `error` state. */
  error: string | null;
  /** Check, and download immediately if something is there. */
  check: () => Promise<void>;
  /** Apply a staged update. No-op unless `state === 'ready'`. */
  restart: () => Promise<void>;
};

export function useAppUpdate(): AppUpdate {
  const [state, setState] = useState<UpdateState>(
    Updates.isEnabled ? 'idle' : 'unsupported',
  );
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  // A check outlives the screen if the user navigates away mid-request, and
  // setting state on the way out warns in dev and leaks in production.
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  const check = useCallback(async () => {
    if (!Updates.isEnabled) return;
    setError(null);
    setState('checking');
    try {
      const result = await Updates.checkForUpdateAsync();
      if (!mounted.current) return;

      if (!result.isAvailable) {
        setLastChecked(new Date());
        setState('current');
        return;
      }

      // Fetch straight away. Splitting "an update exists" from "get it" would
      // make the user press twice for one outcome they already asked for.
      setState('downloading');
      await Updates.fetchUpdateAsync();
      if (!mounted.current) return;

      setLastChecked(new Date());
      setState('ready');
    } catch (e: any) {
      if (!mounted.current) return;
      setError(e?.message ?? 'Unknown error');
      setState('error');
    }
  }, []);

  const restart = useCallback(async () => {
    if (state !== 'ready') return;
    try {
      await Updates.reloadAsync();
    } catch (e: any) {
      if (!mounted.current) return;
      // A failed reload leaves the downloaded update staged, so it still runs on
      // the next natural cold start. Say so rather than implying it was lost.
      setError(e?.message ?? 'Unknown error');
      setState('error');
    }
  }, [state]);

  return { state, lastChecked, error, check, restart };
}
