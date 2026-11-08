import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, View } from 'react-native';
import { Text } from './Typography';
import { Ionicons } from '@expo/vector-icons';
import { GlassCard } from './Glass';
import { FadeSlideIn, PressableScale } from './Motion';
import { useTheme } from '../theme/ThemeContext';
import { withAlpha } from '../theme/themes';
import { DAY_LABEL, Stop, TransitData } from '../models/stop';
import { TRANSPORT_META, typesOfMask } from '../models/transport';
import { dayTypeOf, formatTime, nextDepartures, platformHeadsigns, routesAtStop } from '../services/schedule';

type Props = {
  stop: Stop;
  data: TransitData;
  now: Date;
  platformIdx: number;
  onSelectPlatform: (pi: number) => void;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  onClose: () => void;
};

export function RouteBadge({ number, type }: { number: string; type: keyof typeof TRANSPORT_META }) {
  const meta = TRANSPORT_META[type];
  return (
    <View
      style={{
        minWidth: 52, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 12,
        backgroundColor: withAlpha(meta.color, 0.22), flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <Ionicons name={meta.icon as any} size={13} color={meta.color} />
      <Text style={{ color: meta.color, fontWeight: '800', fontSize: 15, marginLeft: 4 }}>{number}</Text>
    </View>
  );
}

export function StopCard({ stop, data, now, platformIdx, onSelectPlatform, isFavorite, onToggleFavorite, onClose }: Props) {
  const { colors, palette } = useTheme();
  const day = dayTypeOf(now);
  const sides = stop.platforms.length > 1 ? platformHeadsigns(data, stop.id) : [];
  const hasSides = sides.some((x) => x && x.length);
  const kinds = (pi: number) => {
    const m = stop.platforms[pi]?.modes;
    const t = m ? typesOfMask(m).filter((x) => stop.types.includes(x)) : [];
    return t.length && t.length < 3 && stop.types.length > 1 ? t.map((x) => TRANSPORT_META[x].title).join('/') : '';
  };
  const departures = nextDepartures(data, stop.id, now, 5, hasSides ? platformIdx : undefined);
  const routesHere = routesAtStop(data, stop.id, hasSides ? platformIdx : undefined);
  const dayLoaded = data.daysLoaded.includes(day);

  const prog = useRef(new Animated.Value(0)).current;
  const star = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.spring(prog, { toValue: 1, friction: 8, tension: 70, useNativeDriver: true }).start();
  }, []);

  const close = () =>
    Animated.timing(prog, { toValue: 0, duration: 200, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(
      () => onClose()
    );

  const fav = () => {
    Animated.sequence([
      Animated.spring(star, { toValue: 1.6, friction: 3, tension: 220, useNativeDriver: true }),
      Animated.spring(star, { toValue: 1, friction: 4, useNativeDriver: true }),
    ]).start();
    onToggleFavorite();
  };

  const typesText = stop.types.map((t) => TRANSPORT_META[t].title).join(', ');

  return (
    <Animated.View
      style={{
        opacity: prog,
        transform: [
          { translateY: prog.interpolate({ inputRange: [0, 1], outputRange: [70, 0] }) },
          { scale: prog.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) },
        ],
      }}
    >
      <GlassCard radius={28} tinted padding={16}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={{ color: colors.text, fontSize: 18, fontWeight: '800', flexShrink: 1 }}>{stop.name}</Text>
              {stop.isDemo && (
                <View style={{ backgroundColor: '#FF9F0A33', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                  <Text style={{ color: '#FF9F0A', fontSize: 10, fontWeight: '800' }}>ДЕМО</Text>
                </View>
              )}
            </View>
            <Text style={{ color: colors.subtext, fontSize: 13, marginTop: 2 }}>
              {[stop.address, typesText, stop.platforms.length > 1 ? `платформ на карте: ${stop.platforms.length}` : ''].filter(Boolean).join(' · ')}
            </Text>
            {stop.latitude == null && (
              <Text style={{ color: colors.subtext, fontSize: 11, marginTop: 2 }}>Положение на карте не определено</Text>
            )}
          </View>
          <Pressable onPress={close} hitSlop={10}>
            <Ionicons name="close-circle" size={26} color={colors.subtext} />
          </Pressable>
        </View>

        {hasSides && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
            {stop.platforms.map((_, pi) => {
              const active = pi === platformIdx;
              const heads = (sides[pi] ?? []).slice(0, 2).join(', ');
              return (
                <PressableScale key={pi} onPress={() => onSelectPlatform(pi)} scaleTo={0.96}>
                  <View style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14, maxWidth: 260,
                    backgroundColor: active ? withAlpha(palette.accent, 0.35) : withAlpha(colors.text, 0.08),
                    borderWidth: 1, borderColor: active ? palette.accent : 'transparent' }}>
                    <Text style={{ color: colors.text, fontSize: 12, fontWeight: '700' }} numberOfLines={1}>
                      Сторона {pi + 1}{kinds(pi) ? ` · ${kinds(pi)}` : ''}{heads ? ` → ${heads}` : ''}
                    </Text>
                  </View>
                </PressableScale>
              );
            })}
          </View>
        )}

        {routesHere.length > 0 && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
            {routesHere.slice(0, 10).map((r, i) => (
              <FadeSlideIn key={r.id} delay={60 + i * 35} distance={8} duration={260}>
                <RouteBadge number={r.number} type={r.type} />
              </FadeSlideIn>
            ))}
            {routesHere.length > 10 && (
              <Text style={{ color: colors.subtext, alignSelf: 'center', fontSize: 12 }}>+{routesHere.length - 10}</Text>
            )}
          </View>
        )}

        <View style={{ marginTop: 12, gap: 8 }}>
          {!dayLoaded ? (
            <Text style={{ color: colors.subtext, fontSize: 14, paddingVertical: 8 }}>
              Расписание на «{DAY_LABEL[day]}» ещё не загружено. Загружено:{' '}
              {data.daysLoaded.map((d) => DAY_LABEL[d]).join(', ') || 'ничего'}.
            </Text>
          ) : departures.length === 0 ? (
            <Text style={{ color: colors.subtext, fontSize: 14, paddingVertical: 8 }}>
              На сегодня рейсов по расписанию больше нет.
            </Text>
          ) : (
            departures.map((d, i) => (
              <FadeSlideIn key={d.route.id + d.timeMin + i} delay={120 + i * 70} distance={14} duration={320}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <RouteBadge number={d.route.number} type={d.route.type} />
                  <Text style={{ color: colors.text, fontSize: 14, flex: 1, marginLeft: 10 }} numberOfLines={1}>
                    → {d.headsign}
                  </Text>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ color: palette.accent, fontSize: 15, fontWeight: '800' }}>
                      {d.inMin <= 0 ? 'сейчас' : `${d.inMin} мин`}
                    </Text>
                    <Text style={{ color: colors.subtext, fontSize: 11 }}>{d.estimated ? '≈ ' : ''}{formatTime(d.timeMin)}</Text>
                  </View>
                </View>
              </FadeSlideIn>
            ))
          )}
        </View>
        <Text style={{ color: colors.subtext, fontSize: 11, marginTop: 10 }}>
          По расписанию, не по GPS · ≈ — расчётное время · {data.sourceName}
        </Text>

        <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
          <PressableScale onPress={fav} style={{ flex: 1 }}>
            <View
              style={{
                flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                paddingVertical: 12, borderRadius: 16, backgroundColor: withAlpha(palette.accent, 0.2),
              }}
            >
              <Animated.View style={{ transform: [{ scale: star }] }}>
                <Ionicons name={isFavorite ? 'star' : 'star-outline'} size={18} color={palette.accent} />
              </Animated.View>
              <Text style={{ color: palette.accent, fontWeight: '700' }}>{isFavorite ? 'В избранном' : 'В избранное'}</Text>
            </View>
          </PressableScale>
          <View style={{ flex: 1 }}>
            <View
              style={{
                flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                paddingVertical: 12, borderRadius: 16, backgroundColor: withAlpha(colors.text, 0.08),
              }}
            >
              <Ionicons name="navigate-outline" size={18} color={colors.subtext} />
              <Text style={{ color: colors.subtext, fontWeight: '700' }}>Маршрут · шаг 4</Text>
            </View>
          </View>
        </View>
      </GlassCard>
    </Animated.View>
  );
}
