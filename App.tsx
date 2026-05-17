import { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import Navigation from './src/navigation';
import { initDb } from './src/db/schema';
import { seedDb } from './src/db/seed';

export default function App() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function boot() {
      try {
        await initDb();
        await seedDb();
        setReady(true);
      } catch (e) {
        setError(String(e));
      }
    }
    boot();
  }, []);

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
      </View>
    );
  }

  return (
    <>
      <StatusBar style="light" />
      <Navigation />
    </>
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
