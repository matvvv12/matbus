import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Dimensions, Easing, Pressable, ScrollView, View } from 'react-native';
import { Text } from './Typography';
import { Ionicons } from '@expo/vector-icons';
import { GlassCard } from './Glass';
import { FadeSlideIn, PressableScale } from './Motion';
import { useTheme } from '../theme/ThemeContext';
import { withAlpha } from '../theme/themes';
import { DAY_LABEL, Stop, TransitData } from '../models/stop';
import { TRANSPORT_META, TransportType, typesOfMask } from '../models/transport';
import {
  addCalendarDays, dateChipLabel, dateLongLabel, dayTypeOf, formatTime, minutesOfDay,
  nextDepartures, nextDepartureByType, platformHeadsigns, routeScheduleAtStop, routesAtStop,
} from '../services/schedule';

type Props = {
  stop: Stop;
  data: TransitData;
  now: Date;
  platformIdx: number;
  onSelectPlatform: (pi: number) => void;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  onClose: () => void;
  onOpenRoute: (routeId: string, directionIndex?: number) => void;
};

const CITY_TYPES: TransportType[] = ['bus', 'trolleybus', 'tram'];
const TYPE_ORDER: TransportType[] = ['bus', 'trolleybus', 'tram', 'minibus'];
const DATE_RANGE = 14;

export function RouteBadge({ number, type }: { number: string; type: keyof typeof TRANSPORT_META }) {
  const meta = TRANSPORT_META[type];
  return (
    <View style={{
      minWidth: 52, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 12,
      backgroundColor: withAlpha(meta.color, 0.22), flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    }}>
      <Ionicons name={meta.icon as any} size={13} color={meta.color} />
      <Text style={{ color: meta.color, fontWeight: '800', fontSize: 15, marginLeft: 4 }}>{number}</Text>
    </View>
  );
}

export function StopCard({ stop, data, now, platformIdx, onSelectPlatform, isFavorite, onToggleFavorite, onClose, onOpenRoute }: Props) {
  const { colors, palette } = useTheme();
  const sides = stop.platforms.length > 1 ? platformHeadsigns(data, stop.id) : [];
  const hasSides = sides.some((x) => x && x.length);
  const kinds = (pi: number) => {
    const m = stop.platforms[pi]?.modes;
    const t = m ? typesOfMask(m).filter((x) => stop.types.includes(x)) : [];
    return t.length && t.length < 3 && stop.types.length > 1 ? t.map((x) => TRANSPORT_META[x].title).join('/') : '';
  };
  const routesHere = useMemo(
    () => routesAtStop(data, stop.id),
    [data, stop.id]
  );
  const [transportGroup, setTransportGroup] = useState<'city' | 'minibus'>('city');
  const [activeType, setActiveType] = useState<TransportType | 'all'>('all');
  const [activeRouteId, setActiveRouteId] = useState<string | null>(null);
  const [dateOffset, setDateOffset] = useState(0);
  const selectedDate = useMemo(() => addCalendarDays(now, dateOffset), [now.getFullYear(), now.getMonth(), now.getDate(), dateOffset]);
  const selectedDay = dayTypeOf(selectedDate);
  const dayLoaded = data.daysLoaded.includes(selectedDay);
  const groupTypes: TransportType[] = transportGroup === 'city' ? CITY_TYPES : ['minibus'];
  const groupRoutes = useMemo(
    () => routesHere.filter((route) => groupTypes.includes(route.type)),
    [routesHere, transportGroup]
  );
  const routeTypes = useMemo(
    () => TYPE_ORDER.filter((type) => groupTypes.includes(type) && groupRoutes.some((route) => route.type === type)),
    [groupRoutes, transportGroup]
  );
  const activeRoutes = groupRoutes.filter((route) => activeType === 'all' || route.type === activeType);
  const activeRoute = groupRoutes.find((route) => route.id === activeRouteId) ?? null;
  const selectedSchedule = useMemo(
    () => activeRouteId ? routeScheduleAtStop(data, stop.id, activeRouteId, selectedDate) : [],
    [data, stop.id, activeRouteId, selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate()]
  );
  const selectedScheduleCount = selectedSchedule.reduce((sum, group) => sum + group.times.length, 0);
  const hasRouteTimetable = activeRouteId != null && (data.byStop.get(stop.id) ?? []).some((entry) => entry.routeId === activeRouteId);
  // Ограничение выполняется после фильтра по группе транспорта внутри nextDepartures.
  // Маршрутки больше не могут занять первые строки и вытеснить городской транспорт.
  const nearestDepartures = nextDepartures(data, stop.id, now, 12, undefined, groupTypes);
  // Берём ближайший рейс каждого вида внутри выбранной вкладки.
  const nearestByType = nextDepartureByType(data, stop.id, now)
    .filter((departure) => groupTypes.includes(departure.route.type));
  const selectedDateIsToday = dateOffset === 0;
  const todayMin = minutesOfDay(now);

  useEffect(() => {
    if (activeType !== 'all' && !routeTypes.includes(activeType)) setActiveType('all');
  }, [stop.id, transportGroup, routeTypes.join('|')]);
  useEffect(() => {
    setActiveRouteId(null);
  }, [stop.id, activeType, transportGroup]);
  useEffect(() => {
    setDateOffset(0);
  }, [stop.id]);

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
  const dates = Array.from({ length: DATE_RANGE }, (_, i) => ({ offset: i, date: addCalendarDays(now, i) }));

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
        <ScrollView
          style={{ maxHeight: Dimensions.get('window').height * 0.66 }}
          showsVerticalScrollIndicator={false}
          nestedScrollEnabled
          contentContainerStyle={{ paddingBottom: 2 }}
        >
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

        <View style={{ flexDirection: 'row', gap: 8, marginTop: 13 }}>
          {([
            { key: 'city' as const, title: 'Городской', subtitle: 'Автобус · троллейбус · трамвай', icon: 'bus' as const,
              count: routesHere.filter((route) => CITY_TYPES.includes(route.type)).length },
            { key: 'minibus' as const, title: 'Маршрутки', subtitle: 'Отдельное расписание', icon: 'car' as const,
              count: routesHere.filter((route) => route.type === 'minibus').length },
          ]).map((tab) => {
            const active = transportGroup === tab.key;
            const tint = tab.key === 'minibus' ? TRANSPORT_META.minibus.color : palette.accent;
            return (
              <PressableScale key={tab.key} style={{ flex: 1 }} onPress={() => {
                setTransportGroup(tab.key);
                setActiveType('all');
                setActiveRouteId(null);
              }} scaleTo={0.98}>
                <View style={{ borderRadius: 15, paddingHorizontal: 10, paddingVertical: 10,
                  backgroundColor: active ? withAlpha(tint, 0.17) : withAlpha(colors.text, 0.055),
                  borderWidth: 1, borderColor: active ? withAlpha(tint, 0.7) : 'transparent' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                    <Ionicons name={tab.icon} size={14} color={active ? tint : colors.subtext} />
                    <Text style={{ color: active ? colors.text : colors.subtext, fontSize: 11, fontWeight: '800' }}>{tab.title}</Text>
                    <Text style={{ color: active ? tint : colors.subtext, fontSize: 10, fontWeight: '800' }}>{tab.count}</Text>
                  </View>
                  <Text style={{ color: colors.subtext, fontSize: 9, textAlign: 'center', marginTop: 3 }}>{tab.subtitle}</Text>
                </View>
              </PressableScale>
            );
          })}
        </View>

        <View style={{ marginTop: 13, gap: 9 }}>
          <Text style={{ color: colors.text, fontSize: 13, fontWeight: '800' }}>Ближайшие отправления</Text>
          <Text style={{ color: colors.subtext, fontSize: 10, marginTop: -5 }}>Учитываются обе стороны остановки — ни один вид транспорта не скрывается из-за выбранной платформы.</Text>
          {nearestByType.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {nearestByType.map((d) => (
                <PressableScale key={d.route.type} onPress={() => onOpenRoute(d.route.id, d.directionIndex >= 0 ? d.directionIndex : 0)} scaleTo={0.96}>
                  <View style={{ minWidth: 116, borderRadius: 16, padding: 10, backgroundColor: withAlpha(TRANSPORT_META[d.route.type].color, 0.12), borderWidth: 1, borderColor: withAlpha(TRANSPORT_META[d.route.type].color, 0.38) }}>
                    <RouteBadge number={d.route.number} type={d.route.type} />
                    <Text style={{ color: colors.text, fontWeight: '800', fontSize: 13, marginTop: 8 }}>{d.inMin <= 0 ? 'Сейчас' : `Через ${d.inMin} мин`}</Text>
                    <Text style={{ color: colors.subtext, fontSize: 11, marginTop: 2 }}>{formatTime(d.timeMin)}{d.estimated ? ' ≈' : ''}</Text>
                    <Text style={{ color: colors.subtext, fontSize: 10, marginTop: 3 }} numberOfLines={1}>{d.headsign}</Text>
                  </View>
                </PressableScale>
              ))}
            </ScrollView>
          ) : (
            <Text style={{ color: colors.subtext, fontSize: 12 }}>На сегодня ближайших отправлений по расписанию нет.</Text>
          )}
          <Text style={{ color: colors.text, fontSize: 13, fontWeight: '800', marginTop: 2 }}>Все ближайшие рейсы</Text>
          {nearestDepartures.length === 0 ? (
            <Text style={{ color: colors.subtext, fontSize: 12 }}>Ближайших рейсов на сегодня больше нет.</Text>
          ) : nearestDepartures.map((d, i) => (
            <FadeSlideIn key={d.route.id + d.timeMin + i} delay={50 + i * 35} distance={8} duration={240}>
              <PressableScale onPress={() => onOpenRoute(d.route.id, d.directionIndex >= 0 ? d.directionIndex : 0)} scaleTo={0.985}>
                <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 2 }}>
                  <RouteBadge number={d.route.number} type={d.route.type} />
                  <Text style={{ color: colors.text, fontSize: 13, flex: 1, marginLeft: 9 }} numberOfLines={1}>→ {d.headsign}</Text>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ color: palette.accent, fontSize: 14, fontWeight: '800' }}>
                      {d.inMin <= 0 ? 'сейчас' : `${d.inMin} мин`}
                    </Text>
                    <Text style={{ color: colors.subtext, fontSize: 11 }}>{formatTime(d.timeMin)}{d.estimated ? ' ≈' : ''}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={15} color={colors.subtext} style={{ marginLeft: 6 }} />
                </View>
              </PressableScale>
            </FadeSlideIn>
          ))}
        </View>

        <View style={{ marginTop: 14, gap: 9 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ color: colors.text, fontSize: 14, fontWeight: '800' }}>Транспорт на остановке</Text>
            <Text style={{ color: colors.subtext, fontSize: 11 }}>{groupRoutes.length} маршрутов</Text>
          </View>
          {groupRoutes.length > 0 ? (
            <>
              {transportGroup === 'city' && routeTypes.length > 1 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 7 }}>
                <PressableScale onPress={() => { setActiveType('all'); setActiveRouteId(null); }} scaleTo={0.96}>
                  <View style={{ paddingHorizontal: 12, paddingVertical: 9, borderRadius: 14,
                    backgroundColor: activeType === 'all' ? withAlpha(palette.accent, 0.22) : withAlpha(colors.text, 0.07),
                    borderWidth: 1, borderColor: activeType === 'all' ? palette.accent : 'transparent' }}>
                    <Text style={{ color: colors.text, fontSize: 12, fontWeight: '800' }}>Все · {groupRoutes.length}</Text>
                  </View>
                </PressableScale>
                {routeTypes.map((type) => {
                  const meta = TRANSPORT_META[type];
                  const active = activeType === type;
                  const count = groupRoutes.filter((route) => route.type === type).length;
                  return (
                    <PressableScale key={type} onPress={() => { setActiveType(type); setActiveRouteId(null); }} scaleTo={0.96}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 11, paddingVertical: 9,
                        borderRadius: 14, backgroundColor: active ? withAlpha(meta.color, 0.22) : withAlpha(colors.text, 0.07),
                        borderWidth: 1, borderColor: active ? meta.color : 'transparent' }}>
                        <Ionicons name={meta.icon as any} size={15} color={meta.color} />
                        <Text style={{ color: colors.text, fontWeight: '700', fontSize: 12 }}>{meta.title}</Text>
                        <Text style={{ color: meta.color, fontWeight: '800', fontSize: 11 }}>{count}</Text>
                      </View>
                    </PressableScale>
                  );
                })}
              </ScrollView>
              )}

              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 7 }}>
                {activeRoutes.map((route) => {
                  const active = activeRouteId === route.id;
                  const meta = TRANSPORT_META[route.type];
                  return (
                    <PressableScale key={route.id} onPress={() => setActiveRouteId(active ? null : route.id)} scaleTo={0.94}>
                      <View style={{ borderRadius: 12, borderWidth: 1.5, borderColor: active ? meta.color : 'transparent',
                        backgroundColor: active ? withAlpha(meta.color, 0.18) : 'transparent' }}>
                        <RouteBadge number={route.number} type={route.type} />
                      </View>
                    </PressableScale>
                  );
                })}
              </ScrollView>

              {activeRoute && (
                <View style={{ borderRadius: 18, backgroundColor: withAlpha(colors.text, 0.055), padding: 11, gap: 9 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <RouteBadge number={activeRoute.number} type={activeRoute.type} />
                      <Text style={{ color: colors.text, fontSize: 13, fontWeight: '800' }}>Полное расписание</Text>
                    </View>
                    <Text style={{ color: colors.subtext, fontSize: 10 }}>за день</Text>
                  </View>

                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                    {dates.map(({ offset, date }) => {
                      const active = offset === dateOffset;
                      return (
                        <PressableScale key={offset} onPress={() => setDateOffset(offset)} scaleTo={0.96}>
                          <View style={{ paddingHorizontal: 10, paddingVertical: 8, borderRadius: 12,
                            backgroundColor: active ? withAlpha(palette.accent, 0.25) : withAlpha(colors.text, 0.07),
                            borderWidth: 1, borderColor: active ? palette.accent : 'transparent' }}>
                            <Text style={{ color: colors.text, fontSize: 11, fontWeight: '700' }}>{dateChipLabel(date, offset)}</Text>
                          </View>
                        </PressableScale>
                      );
                    })}
                  </ScrollView>
                  <Text style={{ color: colors.subtext, fontSize: 11 }}>
                    {dateLongLabel(selectedDate)} · {DAY_LABEL[selectedDay]}
                  </Text>

                  {!dayLoaded ? (
                    <Text style={{ color: colors.subtext, fontSize: 12 }}>Расписание на этот день не загружено.</Text>
                  ) : selectedScheduleCount === 0 ? (
                    <Text style={{ color: colors.subtext, fontSize: 12 }}>
                      {hasRouteTimetable
                        ? 'На выбранную дату отправления не найдены.'
                        : 'Маршрут проходит через эту остановку, но отдельное время отправления в источнике не опубликовано.'}
                    </Text>
                  ) : (
                    <>
                      <Text style={{ color: colors.subtext, fontSize: 11 }}>Всего отправлений: {selectedScheduleCount}</Text>
                      <ScrollView style={{ maxHeight: 190 }} nestedScrollEnabled showsVerticalScrollIndicator contentContainerStyle={{ gap: 12, paddingBottom: 4 }}>
                        {selectedSchedule.map((group, groupIndex) => (
                          <View key={`${group.title}-${groupIndex}`} style={{ gap: 6 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              <Ionicons name="arrow-forward" size={13} color={palette.accent} />
                              <Text style={{ color: colors.text, fontSize: 12, fontWeight: '700', flex: 1 }} numberOfLines={2}>{group.headsign}</Text>
                              {group.estimated && <Text style={{ color: '#FF9F0A', fontSize: 10, fontWeight: '700' }}>≈ ориентир.</Text>}
                              {group.times.some((t) => t >= 1440) && <Text style={{ color: colors.subtext, fontSize: 9 }}>+ следующий день</Text>}
                            </View>
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                              {group.times.map((time, timeIndex) => {
                                const passed = selectedDateIsToday && time < todayMin;
                                return (
                                  <View key={`${time}-${timeIndex}`} style={{ paddingHorizontal: 9, paddingVertical: 6, borderRadius: 9,
                                    backgroundColor: passed ? withAlpha(colors.text, 0.045) : withAlpha(palette.accent, 0.13), opacity: passed ? 0.52 : 1 }}>
                                    <Text style={{ color: passed ? colors.subtext : colors.text, fontSize: 12, fontWeight: '700' }}>
                                      {formatTime(time)}{time >= 1440 ? ' +1' : ''}
                                    </Text>
                                  </View>
                                );
                              })}
                            </View>
                          </View>
                        ))}
                      </ScrollView>
                    </>
                  )}
                  <Text style={{ color: colors.subtext, fontSize: 10 }}>Показаны все направления и отправления за выбранный день. Для маршруток с расчётным временем стоит отметка ≈.</Text>
                  <PressableScale onPress={() => onOpenRoute(activeRoute.id)} scaleTo={0.97}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
                      backgroundColor: withAlpha(palette.accent, 0.18), borderRadius: 13, paddingVertical: 10 }}>
                      <Ionicons name="map-outline" size={16} color={palette.accent} />
                      <Text style={{ color: palette.accent, fontWeight: '800', fontSize: 12 }}>Показать путь на карте</Text>
                    </View>
                  </PressableScale>
                </View>
              )}
            </>
          ) : (
            <Text style={{ color: colors.subtext, fontSize: 12 }}>
              {transportGroup === 'city'
                ? 'На этой остановке не найдено городских автобусов, троллейбусов или трамваев.'
                : 'На этой остановке не найдено маршруток.'}
            </Text>
          )}
        </View>


        <Text style={{ color: colors.subtext, fontSize: 10, marginTop: 10 }}>
          Все направления остановки · по расписанию, не по GPS · ≈ — расчётное время · {data.sourceName}
        </Text>

        <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
          <PressableScale onPress={fav} style={{ flex: 1 }}>
            <View style={{
              flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
              paddingVertical: 12, borderRadius: 16, backgroundColor: withAlpha(palette.accent, 0.2),
            }}>
              <Animated.View style={{ transform: [{ scale: star }] }}>
                <Ionicons name={isFavorite ? 'star' : 'star-outline'} size={18} color={palette.accent} />
              </Animated.View>
              <Text style={{ color: palette.accent, fontWeight: '700' }}>{isFavorite ? 'В избранном' : 'В избранное'}</Text>
            </View>
          </PressableScale>
          <PressableScale onPress={close} style={{ flex: 1 }}>
            <View style={{
              flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
              paddingVertical: 12, borderRadius: 16, backgroundColor: withAlpha(colors.text, 0.08),
            }}>
              <Ionicons name="close" size={18} color={colors.subtext} />
              <Text style={{ color: colors.subtext, fontWeight: '700' }}>Закрыть</Text>
            </View>
          </PressableScale>
        </View>
        </ScrollView>
      </GlassCard>
    </Animated.View>
  );
}
