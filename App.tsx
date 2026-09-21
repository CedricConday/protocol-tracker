import { useCallback, useEffect, useState } from 'react';
import { AppState, InteractionManager, Text, TouchableOpacity, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import Navigation from './src/navigation';
import { initDb, getDb } from './src/db/schema';
import { seedDb } from './src/db/seed';
import { seedWebDemo } from './src/db/demoSeed';
import { runMigrations } from './src/db/migrations';
import { getLanguage } from './src/i18n';
import { loadThemeMode, useTheme } from './src/theme/colors';
import { loadPatientName, setupNotificationHandler, registerBackgroundTask } from './src/notifications';
import { syncAll } from './src/api/syncClient';
import { FontScaleProvider } from './src/context/FontScaleContext';
import PermissionPrimingModal from './src/components/PermissionPrimingModal';
import SplashAnimation from './src/components/SplashAnimation';
import { useBiometricGate } from './src/hooks/useBiometricGate';
import { ErrorBoundary } from './src/components/ErrorBoundary';

SplashScreen.preventAutoHideAsync().catch(() => {});

const PRIMING_KEY = '@pt:permission_primed';
/**
 * The key was '@coimbra:...' before the 2026-06-03 rename, and an install from
 * before then still has the flag under that name. Read through to it once so
 * nobody gets re-prompted for permissions they already granted, then delete it.
 * Safe to drop this, and readPrimingFlag with it, once no install predates the
 * rename.
 */
const LEGACY_PRIMING_KEY = '@coimbra:permission_primed';

async function readPrimingFlag(): Promise<string | null> {
  const primed = await AsyncStorage.getItem(PRIMING_KEY);
  if (primed !== null) return primed;

  const legacy = await AsyncStorage.getItem(LEGACY_PRIMING_KEY);
  if (legacy === null) return null;

  // Migrate it forward, then drop the old key. A failure here is not worth
  // blocking the boot on: the worst case is that we try again next launch.
  try {
    await AsyncStorage.setItem(PRIMING_KEY, legacy);
    await AsyncStorage.removeItem(LEGACY_PRIMING_KEY);
  } catch {}
  return legacy;
}

/**
 * Launch, as close as this module can get to it. Used to measure the startup
 * screen's minimum against the app opening rather than against the moment the
 * screen happens to mount, which on a warm boot is much later.
 */
const APP_START = Date.now();

/**
 * How long the startup screen stays up, at minimum — 2026-09-21, Cedric's
 * number, chosen against the frame-by-frame preview.
 *
 * Until then this was zero in effect, and worse than zero: a warm boot took the
 * `return null` path below and the startup screen never rendered at all, so the
 * name and the tagline were unreachable on the one launch that happens every
 * day. The OS splash alone was the whole opening.
 *
 * It is a real cost and it is worth stating plainly: every launch now takes at
 * least this long before Home. **Set it to 0 to go back to showing Home the
 * instant boot finishes** — nothing else has to change, the screen simply
 * fades out immediately and the wordmark goes unread on fast devices.
 */
const MIN_SPLASH_MS = 2700;

export default function App() {
  // The tier decides the status bar's own contents: dark glyphs on the light
  // ground, light glyphs on dim and dark. It was pinned to "light", which put
  // white icons on a near-white ground.
  const themeMode = useTheme();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPriming, setShowPriming] = useState(false);
  // The startup screen outlives `ready`: it stays mounted over Home until its
  // minimum has elapsed, then fades off it. `exiting` starts that fade,
  // `splashGone` unmounts it once the fade has finished.
  const [exiting, setExiting] = useState(false);
  const [splashGone, setSplashGone] = useState(false);
  const { locked, authenticate } = useBiometricGate();

  // The native splash is only dropped once there is real content underneath —
  // never for a blank frame and never for a second splash screen of our own.
  const hideNativeSplash = useCallback(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  // Everything the first frame does not need. Notification categories, the
  // background dose check and the first sync are all native round trips, and
  // none of them is worth a millisecond between the user and their dose list,
  // so they run after Home has painted.
  const startDeferredWork = useCallback(() => {
    InteractionManager.runAfterInteractions(() => {
      setupNotificationHandler();
      loadPatientName().catch(() => {});
      registerBackgroundTask().catch(() => {});
      syncAll().catch(() => {});
    });
  }, []);

  const onNavigationReady = useCallback(() => {
    hideNativeSplash();
    startDeferredWork();
  }, [hideNativeSplash, startDeferredWork]);

  useEffect(() => {
    async function boot() {
      try {
        // The priming flag lives in AsyncStorage and the schema lives in
        // SQLite; neither waits on the other, so they open in parallel.
        const [primed] = await Promise.all([
          readPrimingFlag(),
          // The stored language, before the first screen paints. Without this
          // `lang` sits at its 'en' default until something calls getLanguage()
          // — which used to be Settings alone, so a German user's first launch
          // came up in English, and any notification scheduled before they
          // opened Settings was written in English too.
          getLanguage().catch(() => 'en'),
          // Same reason, for the theme tier: read it here and the app paints
          // dim or dark from the first frame instead of flashing light.
          loadThemeMode().catch(() => 'light' as const),
          (async () => {
            const db = await getDb();
            await runMigrations(db);
            await initDb();
            await seedDb();
            // No-op unless EXPO_PUBLIC_DEMO=1 was set at export time, which
            // only the /try/ web build is. Inlined by Expo, so the Android
            // build cannot reach it.
            await seedWebDemo();
          })(),
        ]);

        if (primed === 'true') {
          setReady(true);
        } else {
          setShowPriming(true);
        }
      } catch (e) {
        setError(String(e));
      }
    }
    boot();
  }, []);

  // Start the fade once the app is usable AND the screen has had its minimum.
  // Measured from launch, not from here, so a slow boot spends the minimum
  // booting rather than adding to it: a 3 s boot hands off immediately, a 200 ms
  // one waits out the remainder.
  useEffect(() => {
    if (!ready || locked || showPriming || exiting) return;
    const remaining = Math.max(0, MIN_SPLASH_MS - (Date.now() - APP_START));
    const t = setTimeout(() => setExiting(true), remaining);
    return () => clearTimeout(t);
  }, [ready, locked, showPriming, exiting]);

  // Clear badge + sync when the app comes back to the foreground. The first
  // sync of the session is part of the deferred work above, not of boot.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        Notifications.setBadgeCountAsync(0).catch(() => {});
        syncAll().catch(() => {});
      }
    });
    Notifications.setBadgeCountAsync(0).catch(() => {});
    return () => sub.remove();
  }, []);

  const dismissPriming = async () => {
    await AsyncStorage.setItem(PRIMING_KEY, 'true');
    setShowPriming(false);
    setReady(true);
  };

  // One SplashAnimation instance for every pre-Home state — boot, first-run
  // priming, biometric lock, DB error — and it stays mounted over Home for the
  // handoff. Mounting a second one per state would restart the rise and jump
  // the mark, which is the thing this screen exists not to do.
  const splash = splashGone ? null : (
    <SplashAnimation
      onLayout={hideNativeSplash}
      exiting={exiting}
      onExited={() => setSplashGone(true)}
    >
      {error ? <Text style={styles.errorText}>DB Error: {error}</Text> : null}
      {!error && locked ? (
        <>
          <Text style={styles.errorText}>Authenticate to continue</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={authenticate} activeOpacity={0.8}>
            <Text style={styles.retryBtnText}>Try Again</Text>
          </TouchableOpacity>
        </>
      ) : null}
      {!error && !locked && !ready ? (
        <PermissionPrimingModal
          visible={showPriming}
          onComplete={dismissPriming}
          onSkip={dismissPriming}
        />
      ) : null}
    </SplashAnimation>
  );

  // Home is mounted under the splash as soon as the app is usable, so it has
  // painted by the time the fade starts.
  const showHome = ready && !error && !locked;

  return (
    <ErrorBoundary>
      <FontScaleProvider>
        <StatusBar style={themeMode === 'light' ? 'dark' : 'light'} />
        {showHome ? <Navigation onReady={onNavigationReady} /> : null}
        {splash}
      </FontScaleProvider>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  errorText: {
    color: '#ef4444',
    fontSize: 13,
    padding: 20,
    textAlign: 'center',
  },
  retryBtn: {
    backgroundColor: '#C96A50',
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 32,
  },
  retryBtnText: {
    color: '#FAF7F4',
    fontSize: 16,
    fontWeight: '800',
  },
});
