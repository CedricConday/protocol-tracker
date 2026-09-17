import { useCallback, useEffect, useState } from 'react';
import { AppState, InteractionManager, Text, TouchableOpacity, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import Navigation from './src/navigation';
import { initDb, getDb } from './src/db/schema';
import { seedDb } from './src/db/seed';
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
 * How long a boot may stay on the bare native splash before we put our own
 * screen up. The fast path never reaches this — it exists so a cold, slow or
 * migrating device shows the mark instead of an apparently frozen OS splash.
 */
const SLOW_BOOT_MS = 2500;

export default function App() {
  // The tier decides the status bar's own contents: dark glyphs on the light
  // ground, light glyphs on dim and dark. It was pinned to "light", which put
  // white icons on a near-white ground.
  const themeMode = useTheme();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPriming, setShowPriming] = useState(false);
  const [slowBoot, setSlowBoot] = useState(false);
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

  useEffect(() => {
    if (ready || showPriming) return;
    const t = setTimeout(() => setSlowBoot(true), SLOW_BOOT_MS);
    return () => clearTimeout(t);
  }, [ready, showPriming]);

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

  if (error) {
    return (
      <SplashAnimation onLayout={hideNativeSplash}>
        <Text style={styles.errorText}>DB Error: {error}</Text>
      </SplashAnimation>
    );
  }

  if (!ready) {
    // First run needs a host for the priming modal, and a slow boot deserves
    // something to look at. A normal warm boot gets neither: it stays on the
    // native splash and goes straight to Home.
    if (!showPriming && !slowBoot) return null;
    return (
      <SplashAnimation onLayout={hideNativeSplash}>
        <PermissionPrimingModal
          visible={showPriming}
          onComplete={dismissPriming}
          onSkip={dismissPriming}
        />
      </SplashAnimation>
    );
  }

  if (locked) {
    return (
      <SplashAnimation onLayout={hideNativeSplash}>
        <Text style={styles.errorText}>Authenticate to continue</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={authenticate} activeOpacity={0.8}>
          <Text style={styles.retryBtnText}>Try Again</Text>
        </TouchableOpacity>
      </SplashAnimation>
    );
  }

  return (
    <ErrorBoundary>
      <FontScaleProvider>
        <StatusBar style={themeMode === 'light' ? 'dark' : 'light'} />
        <Navigation onReady={onNavigationReady} />
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
