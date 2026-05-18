import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export default function SecurityScreen() {
  const [loading, setLoading] = useState(false);

  const handleConnect = () => {
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      Alert.alert(
        'Passkey Research',
        'This feature requires a production domain and native module (react-native-passkey). Researching local-first encryption keys.'
      );
    }, 2000);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.iconContainer}>
          <Ionicons name="key-outline" size={60} color="#C96A50" />
        </View>
        <Text style={styles.title}>Security & Passkeys</Text>
        <Text style={styles.description}>
          Use passkeys to secure your health data using biometric authentication (FaceID / Fingerprint). 
          This replaces traditional passwords with device-bound encryption.
        </Text>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Local-First Protection</Text>
          <Text style={styles.cardText}>
            Your data is currently stored in an encrypted local database. 
            Passkeys will provide an extra layer of biometric security.
          </Text>
        </View>

        <TouchableOpacity 
          style={[styles.button, loading ? styles.buttonDisabled : null]} 
          onPress={handleConnect}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#FAF7F4" />
          ) : (
            <Text style={styles.buttonText}>Connect Passkey</Text>
          )}
        </TouchableOpacity>
        
        <Text style={styles.privacyNote}>
          Passkeys never leave your device and are phishing-resistant.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAF7F4' },
  content: { flex: 1, padding: 24, alignItems: 'center', justifyContent: 'center' },
  iconContainer: { marginBottom: 24, backgroundColor: '#F2EDE8', padding: 20, borderRadius: 30 },
  title: { color: '#FAF7F4', fontSize: 24, fontWeight: '800', marginBottom: 12 },
  description: { color: '#7A6A62', fontSize: 15, textAlign: 'center', lineHeight: 24, marginBottom: 32 },
  card: { backgroundColor: '#F2EDE8', borderRadius: 14, padding: 20, width: '100%', marginBottom: 32 },
  cardTitle: { color: '#FAF7F4', fontSize: 16, fontWeight: '700', marginBottom: 8 },
  cardText: { color: '#7A6A62', fontSize: 14, lineHeight: 20 },
  button: { backgroundColor: '#C96A50', borderRadius: 12, paddingVertical: 16, width: '100%', alignItems: 'center' },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#FAF7F4', fontSize: 16, fontWeight: '800' },
  privacyNote: { color: '#B0A098', fontSize: 12, marginTop: 16 },
});
