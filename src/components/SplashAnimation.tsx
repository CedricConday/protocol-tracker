import { useEffect, useRef, type ReactNode } from 'react';
import { C, themed, useTheme } from '../theme/colors';
import { AccessibilityInfo, Animated, Easing, StyleSheet, View } from 'react-native';

import { t, useLanguage } from '../i18n';
import SunMascot from './SunMascot';
/**
 * The app's one startup screen.
 *
 * Every pre-Navigation state renders THIS — boot, biometric lock and DB error —
 * so the mascot never moves, resizes or re-mounts between them. The native
 * splash (app.json -> expo-splash-screen) draws the same artwork at the same
 * width on the same background, and is held until this has painted, so the OS
 * layer and this one are a single continuous screen.
 *
 * Three motions, settled 2026-09-21 against a frame-by-frame preview:
 *
 *   1. The rays turn, once a minute, for as long as the screen is up. The disc
 *      and the face do not, so the eyes never drift. It never finishes, so
 *      there is no half-done state for a fast boot to catch.
 *   2. The name rises ten points and fades in over 1.8 s; the tagline follows
 *      at 30% of that, so the two arrive as a phrase rather than a block. This
 *      replaced a 1.4 s delay that simply held the caption at zero — on a warm
 *      boot the app reached Home first and the name never painted at all.
 *   3. The screen fades off Home rather than being swapped out. That part is
 *      App.tsx's: it owns the handoff and passes `exiting`.
 *
 * The earlier continuous float was dropped with the same change. Two idle
 * motions at once read as restless, and the rays are the one that survives
 * being looked at.
 *
 * Every motion here is opacity or transform, so all of it runs on the native
 * driver. Nothing may touch colour, width or letter-spacing: those animate on
 * the JS thread, and the JS thread during boot is the one place that cannot
 * afford it.
 */
const MARK = 168;

/** One revolution per minute. Slow enough to read as alive, not as a spinner. */
const RAY_PERIOD_MS = 60000;

/** Name rise; the tagline starts at RISE_MS * TAGLINE_OFFSET. */
const RISE_MS = 1800;
const TAGLINE_OFFSET = 0.3;
const RISE_PX = 10;

/** Handoff to Home. Also how long App.tsx must keep this mounted. */
export const EXIT_MS = 250;

interface Props {
  /** Rendered under the caption: priming modal, auth button, error text. */
  children?: ReactNode;
  onLayout?: () => void;
  /** Fade the whole screen out, then call `onExited`. */
  exiting?: boolean;
  onExited?: () => void;
}

export default function SplashAnimation({ children, onLayout, exiting, onExited }: Props) {
  useLanguage(); // re-render when the language changes
  useTheme(); // ...and when the theme tier changes
  const nameAnim = useRef(new Animated.Value(0)).current;
  const taglineAnim = useRef(new Animated.Value(0)).current;
  const spinAnim = useRef(new Animated.Value(0)).current;
  const exitAnim = useRef(new Animated.Value(1)).current;

  // Motion is a preference, not a default. Someone who has asked the OS to
  // reduce it gets the finished screen on frame 0 and no rotation at all.
  useEffect(() => {
    let cancelled = false;
    const rise = (value: Animated.Value, delay: number) =>
      Animated.timing(value, {
        toValue: 1,
        duration: RISE_MS,
        delay,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      });

    const spin = Animated.loop(
      Animated.timing(spinAnim, {
        toValue: 1,
        duration: RAY_PERIOD_MS,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );

    AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => false)
      .then((reduced) => {
        if (cancelled) return;
        if (reduced) {
          nameAnim.setValue(1);
          taglineAnim.setValue(1);
          return;
        }
        spin.start();
        rise(nameAnim, 0).start();
        rise(taglineAnim, RISE_MS * TAGLINE_OFFSET).start();
      });

    return () => {
      cancelled = true;
      spin.stop();
    };
  }, [nameAnim, taglineAnim, spinAnim]);

  useEffect(() => {
    if (!exiting) return;
    Animated.timing(exitAnim, {
      toValue: 0,
      duration: EXIT_MS,
      easing: Easing.in(Easing.quad),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) onExited?.();
    });
  }, [exiting, exitAnim, onExited]);

  const spin = spinAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const lift = (value: Animated.Value) => ({
    opacity: value,
    transform: [
      { translateY: value.interpolate({ inputRange: [0, 1], outputRange: [RISE_PX, 0] }) },
    ],
  });

  return (
    <Animated.View style={[styles.container, { opacity: exitAnim }]} onLayout={onLayout}>
      {/* Two stacked copies: the rays turn underneath, the face does not. */}
      <View style={styles.mark} pointerEvents="none">
        <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ rotate: spin }] }]}>
          <SunMascot size={MARK} layers="rays" />
        </Animated.View>
        <View style={StyleSheet.absoluteFill}>
          <SunMascot size={MARK} layers="bodyFace" />
        </View>
      </View>
      <View style={styles.caption}>
        <Animated.Text style={[styles.appName, lift(nameAnim)]}>Protocol Tracker</Animated.Text>
        <Animated.Text style={[styles.tagline, lift(taglineAnim)]}>
          {t('splashTagline')}
        </Animated.Text>
        {children}
      </View>
    </Animated.View>
  );
}

const styles = themed((C) => StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: C.bg,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
  },
  // Centred with no sibling in flow, so it sits on the exact pixel the native
  // splash put it on.
  mark: {
    width: MARK,
    height: MARK,
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
    color: C.text,
    letterSpacing: 4,
    marginBottom: 8,
  },
  tagline: {
    fontSize: 13,
    color: C.textMuted,
    letterSpacing: 1,
  },
}));
