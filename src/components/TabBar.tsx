import React, { useEffect, useRef, useState } from 'react';
import { Animated, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useInsets } from '../hooks/useInsets';
import { GlassCard, LiquidGlass } from './Glass';
import { PressableScale } from './Motion';
import { Text } from './Typography';
import { useTheme } from '../theme/ThemeContext';

export type TabKey = 'map' | 'routes' | 'transport' | 'favorites' | 'settings';

const TABS: { key: TabKey; title: string; icon: string }[] = [
  { key: 'map', title: 'Карта', icon: 'map' },
  { key: 'routes', title: 'Маршруты', icon: 'navigate' },
  { key: 'transport', title: 'Транспорт', icon: 'bus' },
  { key: 'favorites', title: 'Избранное', icon: 'star' },
  { key: 'settings', title: 'Настройки', icon: 'settings' },
];

function TabItem({ tab, active, onPress }: { tab: (typeof TABS)[number]; active: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  const lift = useRef(new Animated.Value(active ? 1 : 0)).current;
  useEffect(() => {
    Animated.spring(lift, { toValue: active ? 1 : 0, friction: 6, tension: 140, useNativeDriver: true }).start();
  }, [active]);
  return (
    <PressableScale onPress={onPress} style={{ flex: 1 }} scaleTo={0.92}>
      <View style={{ alignItems: 'center', paddingVertical: 11 }}>
        <Animated.View
          style={{
            transform: [
              { translateY: lift.interpolate({ inputRange: [0, 1], outputRange: [0, 1] }) },
              { scale: lift.interpolate({ inputRange: [0, 1], outputRange: [1, 1.1] }) },
            ],
          }}
        >
          <Ionicons name={(tab.icon + '-outline') as any} size={22} color={active ? colors.text : colors.subtext} />
        </Animated.View>
        <Text style={{ fontSize: 10, fontWeight: active ? '700' : '600', marginTop: 4, color: active ? colors.text : colors.subtext }}>
          {tab.title}
        </Text>
      </View>
    </PressableScale>
  );
}

export function TabBar({ selected, onSelect }: { selected: TabKey; onSelect: (k: TabKey) => void }) {
  const insets = useInsets();
  const { palette } = useTheme();
  const [w, setW] = useState(0);
  const x = useRef(new Animated.Value(0)).current;
  const idx = TABS.findIndex((t) => t.key === selected);
  const itemW = w / TABS.length;

  useEffect(() => {
    if (!itemW) return;
    Animated.spring(x, { toValue: idx * itemW, friction: 9, tension: 80, useNativeDriver: true }).start();
  }, [idx, itemW]);

  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: 14, right: 14, bottom: Math.max(insets.bottom, 8) + 16 }}>
      <GlassCard radius={38} padding={6}>
        <View style={{ flexDirection: 'row' }} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
          {itemW > 0 && (
            <Animated.View style={{ position: 'absolute', top: 0, bottom: 0, width: itemW, transform: [{ translateX: x }] }}>
              <LiquidGlass radius={32} tint={0.5} stretch style={{ flex: 1 }} />
              <View pointerEvents="none" style={{ position: 'absolute', top: 5, left: 0, right: 0, alignItems: 'center' }}>
                <View
                  style={{
                    width: 16, height: 3, borderRadius: 2, backgroundColor: palette.accent,
                    shadowColor: palette.accent, shadowOpacity: 1, shadowRadius: 6, shadowOffset: { width: 0, height: 0 },
                  }}
                />
              </View>
            </Animated.View>
          )}
          {TABS.map((t) => (
            <TabItem key={t.key} tab={t} active={t.key === selected} onPress={() => onSelect(t.key)} />
          ))}
        </View>
      </GlassCard>
    </View>
  );
}
