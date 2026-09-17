import { useState } from 'react';
import {
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Notifications from 'expo-notifications';
import { t, useLanguage } from '../i18n';

interface Props {
  visible: boolean;
  onComplete: () => void;
  onSkip: () => void;
}

export default function PermissionPrimingModal({ visible, onComplete, onSkip }: Props) {
  useLanguage(); // re-render this screen when the language changes
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

          <Text style={styles.title}>{t('stayOnTrack')}</Text>
          <Text style={styles.body}>{t('primingBody1')}</Text>
          <Text style={styles.body}>{t('primingBody2')}</Text>

          <TouchableOpacity
            style={[styles.primaryButton, requesting ? styles.buttonDisabled : null]}
            onPress={handleAllow}
            disabled={requesting}
            activeOpacity={0.8}
          >
            <Text style={styles.primaryButtonText}>
              {requesting ? t('primingRequesting') : t('primingAllow')}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.skipButton}
            onPress={onSkip}
            activeOpacity={0.7}
          >
            <Text style={styles.skipText}>{t('notNow')}</Text>
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
    backgroundColor: '#F7FAFE',
    borderRadius: 20,
    padding: 28,
    alignItems: 'center',
    width: '100%',
    shadowColor: '#112438',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 8,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#DEEFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  iconText: {
    fontSize: 32,
  },
  title: {
    color: '#112438',
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 12,
  },
  body: {
    color: '#495D72',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 8,
  },
  primaryButton: {
    backgroundColor: '#1162B9',
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
    color: '#F7FAFE',
    fontSize: 17,
    fontWeight: '800',
  },
  skipButton: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  skipText: {
    color: '#617285',
    fontSize: 14,
    fontWeight: '600',
  },
});
