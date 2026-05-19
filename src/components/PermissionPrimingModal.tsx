import { useState } from 'react';
import {
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Notifications from 'expo-notifications';

interface Props {
  visible: boolean;
  onComplete: () => void;
  onSkip: () => void;
}

export default function PermissionPrimingModal({ visible, onComplete, onSkip }: Props) {
  const [requesting, setRequesting] = useState(false);

  const handleAllow = async () => {
    setRequesting(true);
    try {
      const { status } = await Notifications.requestPermissionsAsync();
      if (status === 'granted') {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'Reminders',
          importance: Notifications.AndroidImportance.HIGH,
        });
      }
    } catch {
      // permission request failed silently
    } finally {
      setRequesting(false);
      onComplete();
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.iconCircle}>
            <Text style={styles.iconText}>🔔</Text>
          </View>

          <Text style={styles.title}>Stay on Track</Text>
          <Text style={styles.body}>
            Notifications help you remember every dose, track your water, and stay
            consistent with your Protocol.
          </Text>
          <Text style={styles.body}>
            We'll send you gentle reminders when a dose is due, when it's time to
            drink water, and a summary at the end of the day.
          </Text>

          <TouchableOpacity
            style={[styles.primaryButton, requesting ? styles.buttonDisabled : null]}
            onPress={handleAllow}
            disabled={requesting}
            activeOpacity={0.8}
          >
            <Text style={styles.primaryButtonText}>
              {requesting ? 'Requesting...' : 'Allow Notifications'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.skipButton}
            onPress={onSkip}
            activeOpacity={0.7}
          >
            <Text style={styles.skipText}>Not now</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  card: {
    backgroundColor: '#FAF7F4',
    borderRadius: 20,
    padding: 28,
    alignItems: 'center',
    width: '100%',
    shadowColor: '#2C2420',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 8,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#FBF0ED',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  iconText: {
    fontSize: 32,
  },
  title: {
    color: '#2C2420',
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 12,
  },
  body: {
    color: '#7A6A62',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 8,
  },
  primaryButton: {
    backgroundColor: '#C96A50',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    width: '100%',
    marginTop: 16,
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  primaryButtonText: {
    color: '#FAF7F4',
    fontSize: 17,
    fontWeight: '800',
  },
  skipButton: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  skipText: {
    color: '#B0A098',
    fontSize: 14,
    fontWeight: '600',
  },
});
