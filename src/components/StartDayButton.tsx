import { useEffect, useRef } from 'react';
import {
  Animated,
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
} from 'react-native';
import { t, useLanguage } from '../i18n';

interface Props {
  onPress: () => void;
  loading: boolean;
}

export default function StartDayButton({ onPress, loading }: Props) {
  useLanguage(); // re-render this screen when the language changes
  const scaleAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!loading) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(scaleAnim, {
            toValue: 1.03,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(scaleAnim, {
            toValue: 1.0,
            duration: 1000,
            useNativeDriver: true,
          }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    } else {
      scaleAnim.setValue(1);
    }
  }, [loading, scaleAnim]);

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
       <TouchableOpacity
         style={[styles.button, loading ? styles.buttonDisabled : null]}
         onPress={onPress}
         disabled={loading}
         activeOpacity={0.8}
       >
        {loading ? (
          <ActivityIndicator color="#F7F7F2" size="small" />
        ) : (
          <Text style={styles.text}>{t('startDay')}</Text>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: '#1B58B8',
    borderRadius: 16,
    paddingHorizontal: 48,
    paddingVertical: 20,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 220,
    shadowColor: '#12408C',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  text: {
    color: '#F7F7F2',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
});
