import { useEffect, useRef } from 'react';
import { Animated, StyleSheet } from 'react-native';
import { C, radius } from '../theme';

interface Props {
  height?: number;
  width?: number;
  borderRadius?: number;
}

export default function SkeletonCard({ height = 80, width, borderRadius = radius.md }: Props) {
  const opacity = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.75, duration: 900, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.35, duration: 900, useNativeDriver: true }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [opacity]);

  return (
    <Animated.View style={[styles.skeleton, { height, width, borderRadius, opacity }]} />
  );
}

const styles = StyleSheet.create({
  skeleton: { backgroundColor: C.surface2, marginBottom: 8 },
});
