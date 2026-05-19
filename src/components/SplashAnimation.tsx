import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export default function SplashAnimation({ onFinish }: { onFinish: () => void }) {
  const pulseAnim = useRef(new Animated.Value(0.8)).current;
  const fadeAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.1, duration: 400, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1.0, duration: 400, useNativeDriver: true }),
      ]),
      Animated.delay(1000),
      Animated.timing(fadeAnim, { toValue: 0, duration: 400, useNativeDriver: true }),
    ]).start(() => onFinish());
  }, []);

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      <Animated.View style={[styles.circle, { transform: [{ scale: pulseAnim }] }]}>
        <Ionicons name="medical" size={36} color="#22c55e" />
      </Animated.View>
      <Animated.Text style={[styles.appName, { opacity: fadeAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 1] }) }]}>
        MS Central
      </Animated.Text>
      <Animated.Text style={[styles.tagline, { opacity: fadeAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 1] }) }]}>
        Your protocol. Your pace.
      </Animated.Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#FAF7F4',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
  },
  circle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#22c55e22',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  appName: {
    fontSize: 28,
    fontWeight: '300',
    color: '#2C2420',
    letterSpacing: 4,
    marginBottom: 8,
  },
  tagline: {
    fontSize: 13,
    color: '#9A8A82',
    letterSpacing: 1,
  },
});
