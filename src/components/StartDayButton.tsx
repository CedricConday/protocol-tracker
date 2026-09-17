import { useEffect, useRef } from 'react';
import { C, themed, useTheme } from '../theme/colors';
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
  useTheme(); // ...and when the theme tier changes
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
          <ActivityIndicator color={C.bg} size="small" />
        ) : (
          <Text style={styles.text}>{t('startDay')}</Text>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = themed((C) => StyleSheet.create({
  button: {
    backgroundColor: C.primary,
    borderRadius: 16,
    paddingHorizontal: 48,
    paddingVertical: 20,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 220,
    shadowColor: C.primaryDk,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  text: {
    color: C.bg,
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
}));
