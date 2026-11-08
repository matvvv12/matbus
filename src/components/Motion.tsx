import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleProp, ViewStyle } from 'react-native';

/** Плавное появление со сдвигом */
export function FadeSlideIn({
  children, delay = 0, distance = 16, duration = 380, axis = 'y', style,
}: {
  children: React.ReactNode; delay?: number; distance?: number; duration?: number;
  axis?: 'x' | 'y'; style?: StyleProp<ViewStyle>;
}) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(v, { toValue: 1, duration, delay, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, []);
  const shift = v.interpolate({ inputRange: [0, 1], outputRange: [distance, 0] });
  return (
    <Animated.View
      style={[{ opacity: v, transform: [axis === 'y' ? { translateY: shift } : { translateX: shift }] }, style]}
    >
      {children}
    </Animated.View>
  );
}

/** Появление «выскакиванием» (для галочек, значков) */
export function PopIn({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(v, { toValue: 1, delay, friction: 5, tension: 150, useNativeDriver: true }).start();
  }, []);
  return <Animated.View style={{ opacity: v, transform: [{ scale: v }] }}>{children}</Animated.View>;
}

/** Нажимаемый элемент с пружинным эффектом */
export function PressableScale({
  children, onPress, style, scaleTo = 0.95, hitSlop, disabled,
}: {
  children: React.ReactNode; onPress?: () => void; style?: StyleProp<ViewStyle>;
  scaleTo?: number; hitSlop?: number; disabled?: boolean;
}) {
  const s = useRef(new Animated.Value(1)).current;
  const to = (v: number) =>
    Animated.spring(s, { toValue: v, useNativeDriver: true, speed: 40, bounciness: 8 }).start();
  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => to(scaleTo)}
      onPressOut={() => to(1)}
      hitSlop={hitSlop}
      disabled={disabled}
      style={style}
    >
      <Animated.View style={{ transform: [{ scale: s }] }}>{children}</Animated.View>
    </Pressable>
  );
}
