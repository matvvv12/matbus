import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, View } from 'react-native';
import { Text } from './Typography';
import { PressableScale } from './Motion';
import { useTheme } from '../theme/ThemeContext';
import { withAlpha } from '../theme/themes';

type Props = { value: string; onChange: (value: string) => void };
const SIZE = 244;
const CENTER = SIZE / 2;
const HOUR_RADIUS = 88;
const INNER_RADIUS = 55;
const MINUTE_RADIUS = 99;

const parseValue = (value: string) => {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return { hour: 8, minute: 0 };
  return { hour: Math.min(23, Number(match[1])), minute: Math.min(59, Number(match[2])) };
};
const pad = (n: number) => String(n).padStart(2, '0');
const polar = (value: number, divisions: number, radius: number) => {
  const angle = (value / divisions) * Math.PI * 2;
  return { left: CENTER + Math.sin(angle) * radius - 13, top: CENTER - Math.cos(angle) * radius - 13 };
};

export default function ClockTimePicker({ value, onChange }: Props) {
  const { colors, palette } = useTheme();
  const parsed = parseValue(value);
  const [mode, setMode] = useState<'hour' | 'minute'>('hour');
  const [hour, setHour] = useState(parsed.hour);
  const [minute, setMinute] = useState(parsed.minute);
  const appear = useRef(new Animated.Value(0)).current;
  const handAngle = useRef(new Animated.Value((parsed.hour % 12) * 30)).current;
  const handAngleTarget = useRef((parsed.hour % 12) * 30);
  const modeScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.spring(appear, { toValue: 1, useNativeDriver: true, friction: 8, tension: 65 }).start();
  }, []);

  useEffect(() => {
    let next = mode === 'hour' ? (hour % 12) * 30 : minute * 6;
    // Выбираем кратчайший поворот, чтобы переход через 12/00 не делал полный оборот назад.
    while (next - handAngleTarget.current > 180) next -= 360;
    while (next - handAngleTarget.current < -180) next += 360;
    handAngleTarget.current = next;
    Animated.spring(handAngle, { toValue: next, useNativeDriver: true, speed: 24, bounciness: 5 }).start();
    Animated.sequence([
      Animated.timing(modeScale, { toValue: 0.97, duration: 90, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.spring(modeScale, { toValue: 1, useNativeDriver: true, speed: 24, bounciness: 6 }),
    ]).start();
  }, [mode, hour, minute]);

  useEffect(() => {
    const next = parseValue(value);
    setHour(next.hour);
    setMinute(next.minute);
  }, [value]);

  const emit = (h: number, m: number) => onChange(`${pad(h)}:${pad(m)}`);

  const selectAt = (x: number, y: number) => {
    const dx = x - CENTER;
    const dy = CENTER - y;
    const radius = Math.sqrt(dx * dx + dy * dy);
    let angle = Math.atan2(dx, dy);
    if (angle < 0) angle += Math.PI * 2;
    if (mode === 'hour') {
      const step = Math.round(angle / (Math.PI / 6)) % 12;
      const selectedHour = radius < 72 ? (step === 0 ? 0 : step + 12) : (step === 0 ? 12 : step);
      setHour(selectedHour);
      emit(selectedHour, minute);
    } else {
      const selectedMinute = Math.round((angle / (Math.PI * 2)) * 60) % 60;
      setMinute(selectedMinute);
      emit(hour, selectedMinute);
    }
  };

  const labels = useMemo(() => {
    if (mode === 'hour') {
      return Array.from({ length: 24 }, (_, index) => {
        const inner = index >= 12;
        const v = inner ? (index === 12 ? 0 : index) : index + 1;
        const position = polar(v % 12, 12, inner ? INNER_RADIUS : HOUR_RADIUS);
        return { value: v, label: pad(v), inner, ...position };
      });
    }
    return Array.from({ length: 12 }, (_, index) => {
      const v = index * 5;
      const position = polar(index, 12, MINUTE_RADIUS);
      return { value: v, label: pad(v), inner: false, ...position };
    });
  }, [mode]);

  const handRotation = handAngle.interpolate({ inputRange: [-720, 720], outputRange: ['-720deg', '720deg'] });
  const selectedAngle = mode === 'hour' ? (hour % 12) * 30 : minute * 6;
  const selectedRadius = mode === 'hour' && (hour === 0 || hour > 12) ? INNER_RADIUS : mode === 'hour' ? HOUR_RADIUS : MINUTE_RADIUS;
  const selectedPoint = polar(selectedAngle / 30, 12, selectedRadius);

  const onTouch = (event: any) => {
    const x = event?.nativeEvent?.locationX;
    const y = event?.nativeEvent?.locationY;
    if (typeof x === 'number' && typeof y === 'number') selectAt(x, y);
  };

  return (
    <Animated.View style={{ opacity: appear, transform: [{ translateY: appear.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }, { scale: modeScale }] }}>
      <View style={{ alignItems: 'center', paddingTop: 4, gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <PressableScale onPress={() => setMode('hour')} scaleTo={0.96}>
            <View style={{ paddingVertical: 8, paddingHorizontal: 13, borderRadius: 12, backgroundColor: mode === 'hour' ? withAlpha(palette.accent, 0.22) : withAlpha(colors.text, 0.06), borderWidth: 1, borderColor: mode === 'hour' ? palette.accent : 'transparent' }}>
              <Text style={{ color: mode === 'hour' ? palette.accent : colors.subtext, fontSize: 13, fontWeight: '800' }}>Часы · {pad(hour)}</Text>
            </View>
          </PressableScale>
          <Text style={{ color: colors.subtext, fontSize: 16, fontWeight: '800' }}>:</Text>
          <PressableScale onPress={() => setMode('minute')} scaleTo={0.96}>
            <View style={{ paddingVertical: 8, paddingHorizontal: 13, borderRadius: 12, backgroundColor: mode === 'minute' ? withAlpha(palette.accent, 0.22) : withAlpha(colors.text, 0.06), borderWidth: 1, borderColor: mode === 'minute' ? palette.accent : 'transparent' }}>
              <Text style={{ color: mode === 'minute' ? palette.accent : colors.subtext, fontSize: 13, fontWeight: '800' }}>Минуты · {pad(minute)}</Text>
            </View>
          </PressableScale>
        </View>

        <View
          onStartShouldSetResponder={() => true}
          onMoveShouldSetResponder={() => true}
          onResponderGrant={onTouch}
          onResponderMove={onTouch}
          onResponderRelease={() => { if (mode === 'hour') setMode('minute'); }}
          style={{ width: SIZE, height: SIZE, borderRadius: SIZE / 2, backgroundColor: withAlpha(colors.text, 0.055), borderWidth: 1, borderColor: withAlpha(colors.text, 0.10), justifyContent: 'center', alignItems: 'center' }}
        >
          <View style={{ position: 'absolute', width: SIZE - 18, height: SIZE - 18, borderRadius: SIZE, borderWidth: 1, borderColor: withAlpha(colors.text, 0.07) }} />
          <Animated.View style={{ position: 'absolute', left: CENTER, top: CENTER, width: 0, height: 0, transform: [{ rotate: handRotation }] }}>
            <View style={{ position: 'absolute', left: -1.5, top: -selectedRadius, width: 3, height: selectedRadius, borderRadius: 3, backgroundColor: withAlpha(palette.accent, 0.9) }} />
          </Animated.View>
          <View style={{ position: 'absolute', left: selectedPoint.left + 13, top: selectedPoint.top + 13, width: 26, height: 26, borderRadius: 13, backgroundColor: palette.accent, opacity: 0.18 }} />
          {labels.map((label) => {
            const selected = mode === 'hour' ? label.value === hour : label.value === Math.floor(minute / 5) * 5;
            return (
              <View key={`${mode}-${label.value}`} style={{ position: 'absolute', left: label.left, top: label.top, width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: selected ? palette.accent : 'transparent' }}>
                <Text style={{ color: selected ? '#FFFFFF' : colors.text, fontSize: mode === 'hour' && label.inner ? 11 : 12, fontWeight: selected ? '800' : '600' }}>{label.label}</Text>
              </View>
            );
          })}
          {mode === 'minute' && Array.from({ length: 60 }, (_, i) => {
            if (i % 5 === 0) return null;
            const p = polar(i, 60, MINUTE_RADIUS);
            return <View key={`tick-${i}`} pointerEvents="none" style={{ position: 'absolute', left: p.left + 11, top: p.top + 11, width: 4, height: 4, borderRadius: 2, backgroundColor: withAlpha(colors.text, 0.24) }} />;
          })}
          <View pointerEvents="none" style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: palette.accent, borderWidth: 2, borderColor: colors.text }} />
        </View>
        <Text style={{ color: colors.subtext, fontSize: 11, textAlign: 'center' }}>
          {mode === 'hour' ? 'Проведи пальцем по циферблату и выбери час' : 'Проведи пальцем по циферблату и выбери минуты'}
        </Text>
      </View>
    </Animated.View>
  );
}
