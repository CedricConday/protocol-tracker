import { useCallback, useEffect, useState } from 'react';
import { AppState, View, Text, Linking, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { StatusBar } from 'expo-status-bar';
import Navigation from './src/navigation';
import { initDb } from './src/db/schema';
import { seedDb } from './src/db/seed';
import { loadPatientName, setupNotificationHandler, registerBackgroundTask } from './src/notifications';
import { FontScaleProvider } from './src/context/FontScaleContext';
import { SimpleModeProvider } from './src/context/SimpleModeContext';
import PermissionPrimingModal from './src/components/PermissionPrimingModal';
import { navigate } from './src/navigation/navigationRef';

const PRIMING_KEY = '@coimbra:permission_primed';

export default function App() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPriming, setShowPriming] = useState(false);

  const completeBoot = useCallback(async () => {
    await registerBackgroundTask();
    setReady(true);
  }, []);

  useEffect(() => {
    async function boot() {
      try {
        await initDb();
        await seedDb();
        setupNotificationHandler();
        await loadPatientName();

        const primed = await AsyncStorage.getItem(PRIMING_KEY);
        if (primed === 'true') {
          await completeBoot();
        } else {
          setShowPriming(true);
        }
      } catch (e) {
        setError(String(e));
      }
    }
    boot();
  }, [completeBoot]);

  // Clear badge when app comes to foreground
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        Notifications.setBadgeCountAsync(0).catch(() => {});
      }
    });
    // Clear on first mount too
    Notifications.setBadgeCountAsync(0).catch(() => {});
    return () => sub.remove();
  }, []);

  useEffect(() => {
    const handler = Linking.addEventListener('url', (event) => {
      const url = event.url;
      if (url === 'coimbra://start-day') {
        navigate('Home');
      }
    });
    return () => handler.remove();
  }, []);

  const handlePrimingComplete = async () => {
    await AsyncStorage.setItem(PRIMING_KEY, 'true');
    setShowPriming(false);
    await completeBoot();
  };

  const handlePrimingSkip = async () => {
    await AsyncStorage.setItem(PRIMING_KEY, 'true');
    setShowPriming(false);
    await completeBoot();
  };

  if (error) {
    return (
      <View style={styles.splash}>
        <Text style={styles.errorText}>DB Error: {error}</Text>
      </View>
    );
  }

  if (!ready) {
    return (
      <View style={styles.splash}>
        <Text style={styles.splashText}>Coimbra</Text>
        <PermissionPrimingModal
          visible={showPriming}
          onComplete={handlePrimingComplete}
          onSkip={handlePrimingSkip}
        />
      </View>
    );
  }

  return (
    <FontScaleProvider>
      <SimpleModeProvider>
        <StatusBar style="light" />
        <Navigation />
      </SimpleModeProvider>
    </FontScaleProvider>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    backgroundColor: '#0d0d0d',
    alignItems: 'center',
    justifyContent: 'center',
  },
  splashText: {
    color: '#22c55e',
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: 2,
  },
  errorText: {
    color: '#ef4444',
    fontSize: 13,
    padding: 20,
    textAlign: 'center',
  },
});
