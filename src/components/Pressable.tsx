import React, { useCallback, useRef } from 'react';
import { Animated, Pressable as RNPressable, PressableProps, ViewStyle, StyleProp } from 'react-native';
import { motion } from '../theme';
import { tap } from '../utils/haptics';

type Props = PressableProps & {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  haptic?: boolean;
  scale?: number;
};

export default function Pressable({
  children, style, haptic = true, scale = motion.tapScale, onPressIn, onPressOut, onPress, ...rest
}: Props) {
  const s = useRef(new Animated.Value(1)).current;

  const handleIn = useCallback((e: any) => {
    Animated.spring(s, { toValue: scale, useNativeDriver: true, ...motion.springSnap }).start();
    onPressIn?.(e);
  }, [s, scale, onPressIn]);

  const handleOut = useCallback((e: any) => {
    Animated.spring(s, { toValue: 1, useNativeDriver: true, ...motion.spring }).start();
    onPressOut?.(e);
  }, [s, onPressOut]);

  const handlePress = useCallback((e: any) => {
    if (haptic) tap();
    onPress?.(e);
  }, [haptic, onPress]);

  return (
    <Animated.View style={[{ transform: [{ scale: s }] }, style]}>
      <RNPressable onPressIn={handleIn} onPressOut={handleOut} onPress={handlePress} {...rest}>
        {children}
      </RNPressable>
    </Animated.View>
  );
}
