import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';

import { t, useLanguage } from '../i18n';
/**
 * The app's one startup screen.
 *
 * Every pre-Navigation state renders THIS — boot, biometric lock and DB error —
 * so the butterfly never moves, resizes or re-mounts between them. The native
 * splash (app.json -> expo-splash-screen) draws the same image at the same
 * width on the same background, and is held until this has painted, so the OS
 * layer and this one are a single continuous screen.
 *
 * It stays up for exactly as long as the state behind it needs and not one
 * frame longer — there is no timed intro. Mark present from frame 0 (no fade
 * in, no pop), gentle 3.5 s float, caption at 1.4 s.
 */
const MARK = 168;
const FLOAT_PX = 7;
const FLOAT_HALF_MS = 1750;
const CAPTION_DELAY_MS = 1400;
const CAPTION_FADE_MS = 600;

interface Props {
  /** Rendered under the caption: priming modal, auth button, error text. */
  children?: ReactNode;
  onLayout?: () => void;
}

export default function SplashAnimation({ children, onLayout }: Props) {
  useLanguage(); // re-render when the language changes
  const captionAnim = useRef(new Animated.Value(0)).current;
  const floatAnim = useRef(new Animated.Value(0)).current;

  // Continuous drift, started on mount and never restarted, so the mark is
  // already where it belongs on the first painted frame.
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, { toValue: 1, duration: FLOAT_HALF_MS, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(floatAnim, { toValue: -1, duration: FLOAT_HALF_MS, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [floatAnim]);

  useEffect(() => {
    Animated.timing(captionAnim, { toValue: 1, duration: CAPTION_FADE_MS, delay: CAPTION_DELAY_MS, useNativeDriver: true }).start();
  }, [captionAnim]);

  const translateY = floatAnim.interpolate({ inputRange: [-1, 1], outputRange: [-FLOAT_PX, FLOAT_PX] });

  return (
    <View style={styles.container} onLayout={onLayout}>
      <Animated.Image
        source={require('../../assets/splash-icon.png')}
        style={[styles.mark, { transform: [{ translateY }] }]}
        resizeMode="contain"
      />
      <Animated.View style={[styles.caption, { opacity: captionAnim }]}>
        <Text style={styles.appName}>Protocol Tracker</Text>
        <Text style={styles.tagline}>{t('splashTagline')}</Text>
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#F7FAFE',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
  },
  // Centred with no sibling in flow, so it sits on the exact pixel the native
  // splash put it on.
  mark: {
    width: MARK,
    height: MARK,
    borderRadius: 28,
  },
  // Absolute, so adding a caption or a button never shifts the mark.
  caption: {
    position: 'absolute',
    top: '50%',
    left: 0,
    right: 0,
    marginTop: MARK / 2 + 28,
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  appName: {
    fontSize: 28,
    fontWeight: '300',
    color: '#112438',
    letterSpacing: 4,
    marginBottom: 8,
  },
  tagline: {
    fontSize: 13,
    color: '#617285',
    letterSpacing: 1,
  },
});
