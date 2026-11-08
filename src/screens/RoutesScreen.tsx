import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, ScrollView, View } from 'react-native';
import { Text } from '../components/Typography';
import { useInsets } from '../hooks/useInsets';
import { Ionicons } from '@expo/vector-icons';
import { GlassButton, GlassCard } from '../components/Glass';
import { FadeSlideIn, PressableScale } from '../components/Motion';
import { RouteBadge } from '../components/StopCard';
import { AddressSearch } from '../components/AddressSearch';
import { useTheme } from '../theme/ThemeContext';
import { usePlaces } from '../theme/PlacesContext';
import { withAlpha } from '../theme/themes';
import { loadTransitData } from '../data/dataSource';
import { DAY_LABEL } from '../models/stop';
import { PLACE_META, RoutePlace, pointOf } from '../models/place';
import { distanceMeters, formatDistance } from '../services/geo';
import { dayTypeOf, formatTime, minutesOfDay } from '../services/schedule';
import { Journey, JourneyView, Origin, WALK_DETOUR, planJourneys, stopsAround } from '../services/router';
import { useUserLocation } from '../hooks/useUserLocation';

const TAGS = { fastest: 'Самый быстрый', fewest: 'Минимум пересадок', leastWalk: 'Минимум пешком', walk: 'Пешком', alt: 'От другой остановки' } as const;
const OFFSETS = [0, 15, 30, 60];

const placeLabel = (p: RoutePlace | null, ph: string) =>
  !p ? ph : p.kind === 'me' ? 'Моё местоположение' : p.kind === 'stop' ? p.stop.name : p.title;

export default function RoutesScreen({ plan, onShowJourney }: { plan?: { from?: RoutePlace; to?: RoutePlace; nonce: number } | null; onShowJourney: (jv: JourneyView) => void }) {
  const insets = useInsets();
  const { colors, palette } = useTheme();
  const { places } = usePlaces();
  const data = useMemo(() => loadTransitData(), []);
  const { location, status, request } = useUserLocation();

  const [from, setFrom] = useState<RoutePlace | null>(null);
  const [to, setTo] = useState<RoutePlace | null>(null);
  const [editing, setEditing] = useState<'from' | 'to' | null>(null);
  const [offset, setOffset] = useState(0);
  const [state, setState] = useState<{ phase: 'idle' | 'loading' | 'done'; journeys: Journey[]; message?: string }>({ phase: 'idle', journeys: [] });
  const [wantSearch, setWantSearch] = useState(false);
  const [autoRun, setAutoRun] = useState(false);
  const spin = useRef(new Animated.Value(0)).current;
  const spinN = useRef(0);
  const ctxRef = useRef<{ from: JourneyView['from']; to: JourneyView['to'] }>({ from: null, to: null });

  useEffect(() => {
    if (!plan) return;
    if (plan.from) setFrom(plan.from);
    if (plan.to) setTo(plan.to);
    setEditing(null);
    setState({ phase: 'idle', journeys: [] });
    if (plan.from && plan.to) setAutoRun(true);
    else if (!plan.from) setEditing('from');
    else setEditing('to');
  }, [plan?.nonce]);

  const swap = () => {
    if (from?.kind === 'me' || to?.kind === 'me') return;
    spinN.current += 1;
    Animated.timing(spin, { toValue: spinN.current, duration: 350, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    setFrom(to); setTo(from);
  };

  const coordsOf = (p: RoutePlace) =>
    p.kind === 'me' ? location
    : p.kind === 'point' ? { latitude: p.latitude, longitude: p.longitude }
    : p.stop.latitude != null ? { latitude: p.stop.latitude, longitude: p.stop.longitude as number } : null;

  const endpoints = (f: RoutePlace, t: RoutePlace): { origins: Origin[]; dests: Origin[]; direct?: { meters: number; fromLabel: string; toLabel: string } } | string => {
    const asEnds = (p: RoutePlace): Origin[] | string => {
      if (p.kind === 'stop') return [{ stopId: p.stop.id, walkMin: 0, walkMeters: 0, label: p.stop.name }];
      const c = coordsOf(p);
      if (!c) return 'ME';
      const list = stopsAround(data, c, placeLabel(p, ''));
      return list.length ? list : `Рядом с «${placeLabel(p, '')}» (в радиусе 900 м) нет остановок с известным положением.`;
    };
    const o = asEnds(f);
    if (o === 'ME') return 'ME';
    if (typeof o === 'string') return o;
    const d = asEnds(t);
    if (typeof d === 'string') return d === 'ME' ? 'Назначение «Моё местоположение» не поддерживается.' : d;

    const cf = coordsOf(f), ct = coordsOf(t);
    if (f.kind === 'stop' && t.kind === 'stop' && f.stop.id === t.stop.id) return 'Остановки «откуда» и «куда» совпадают.';
    let direct;
    if (cf && ct) {
      const m = distanceMeters(cf, ct);
      if (m < 60) return 'Точки «откуда» и «куда» практически совпадают.';
      direct = { meters: m * WALK_DETOUR, fromLabel: placeLabel(f, ''), toLabel: placeLabel(t, '') };
    }
    return { origins: o, dests: d, direct };
  };

  const run = () => {
    if (!from || !to) return;
    const now = new Date();
    const depart = minutesOfDay(now) + offset;
    const day = dayTypeOf(now);
    if (!data.daysLoaded.includes(day)) {
      setState({ phase: 'done', journeys: [], message: `Расписание на «${DAY_LABEL[day]}» ещё не загружено. Запустите загрузку в такой день недели (см. README).` });
      return;
    }
    const ends = endpoints(from, to);
    const cfp = coordsOf(from), ctp = coordsOf(to);
    ctxRef.current = {
      from: cfp ? { latitude: cfp.latitude, longitude: cfp.longitude, title: placeLabel(from, '') } : null,
      to: ctp ? { latitude: ctp.latitude, longitude: ctp.longitude, title: placeLabel(to, '') } : null,
    };
    if (ends === 'ME') { setWantSearch(true); request(); return; }
    if (typeof ends === 'string') { setState({ phase: 'done', journeys: [], message: ends }); return; }

    setState({ phase: 'loading', journeys: [] });
    setTimeout(() => {
      const r = planJourneys(data, ends.origins, ends.dests, depart, day, ends.direct, { from: ctxRef.current.from, to: ctxRef.current.to });
      setState({
        phase: 'done', journeys: r.journeys,
        message: r.reason === 'no-routes'
          ? 'Нет данных о порядке остановок маршрутов. Выполните: node tools/import-voat.mjs --routes-only'
          : r.reason === 'not-found'
          ? 'Подходящих рейсов по расписанию не найдено (максимум 3 пересадки). Попробуйте другое время или места.'
          : undefined,
      });
    }, 350);
  };

  useEffect(() => { if (wantSearch && location) { setWantSearch(false); run(); } }, [location, wantSearch]);
  useEffect(() => { if (autoRun && from && to) { setAutoRun(false); run(); } }, [autoRun, from, to]);

  const pick = (p: RoutePlace) => {
    if (editing === 'from') setFrom(p); else setTo(p);
    if (p.kind === 'me') request();
    setEditing(null);
  };

  const canGo = !!from && !!to && to.kind !== 'me';
  const quick = places.slice(0, 4);

  return (
    <ScrollView keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ paddingTop: insets.top + 16, paddingHorizontal: 16, paddingBottom: 150, gap: 12 }}>
      <FadeSlideIn><Text style={{ color: colors.text, fontSize: 34, fontWeight: '800' }}>Маршруты</Text></FadeSlideIn>

      <FadeSlideIn delay={60}>
        <GlassCard radius={24} tinted padding={14}>
          <PressableScale onPress={() => setEditing('from')} scaleTo={0.98}>
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8 }}>
              <Ionicons name="radio-button-on" size={18} color={palette.accent} />
              <Text style={{ color: from ? colors.text : colors.subtext, fontSize: 16, marginLeft: 10, flex: 1 }} numberOfLines={1}>
                {placeLabel(from, 'Откуда: адрес, место или остановка')}
              </Text>
            </View>
          </PressableScale>
          <View style={{ height: 1, backgroundColor: withAlpha(colors.text, 0.1), marginLeft: 28 }} />
          <PressableScale onPress={() => setEditing('to')} scaleTo={0.98}>
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8 }}>
              <Ionicons name="location" size={18} color="#FF453A" />
              <Text style={{ color: to ? colors.text : colors.subtext, fontSize: 16, marginLeft: 10, flex: 1 }} numberOfLines={1}>
                {placeLabel(to, 'Куда: адрес, место или остановка')}
              </Text>
              <PressableScale onPress={swap} hitSlop={10}>
                <Animated.View style={{ transform: [{ rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] }) }] }}>
                  <Ionicons name="swap-vertical" size={22} color={palette.accent} />
                </Animated.View>
              </PressableScale>
            </View>
          </PressableScale>
        </GlassCard>
      </FadeSlideIn>

      {editing && (
        <FadeSlideIn distance={-10} duration={240} key={editing}>
          <GlassCard radius={22} padding={12}>
            <AddressSearch
              placeholder={editing === 'from' ? 'Откуда' : 'Куда'}
              allowMe={editing === 'from'}
              onPick={pick}
              onClose={() => setEditing(null)}
            />
          </GlassCard>
        </FadeSlideIn>
      )}

      {quick.length > 0 && !editing && (
        <FadeSlideIn delay={100}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {quick.map((p) => (
              <PressableScale key={p.id} onPress={() => (from ? setTo(pointOf(p)) : setFrom(pointOf(p)))}>
                <GlassCard radius={16}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8 }}>
                    <Ionicons name={PLACE_META[p.type].icon as any} size={14} color={palette.accent} />
                    <Text style={{ color: colors.text, fontWeight: '600', fontSize: 13 }}>{p.title}</Text>
                  </View>
                </GlassCard>
              </PressableScale>
            ))}
          </ScrollView>
        </FadeSlideIn>
      )}

      <FadeSlideIn delay={140}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {OFFSETS.map((o) => (
            <PressableScale key={o} onPress={() => setOffset(o)}>
              <View style={{ paddingHorizontal: 14, paddingVertical: 9, borderRadius: 16,
                backgroundColor: o === offset ? withAlpha(palette.accent, 0.35) : withAlpha(colors.text, 0.08) }}>
                <Text style={{ color: colors.text, fontWeight: '600', fontSize: 13 }}>{o === 0 ? 'Выехать сейчас' : `Через ${o} мин`}</Text>
              </View>
            </PressableScale>
          ))}
        </ScrollView>
      </FadeSlideIn>

      <FadeSlideIn delay={180}>
        <GlassButton
          label={status === 'loading' && wantSearch ? 'Определяем местоположение…' : 'Найти маршрут'}
          icon="search" onPress={run} disabled={!canGo}
        />
        {status === 'denied' && from?.kind === 'me' && (
          <Text style={{ color: '#FF453A', fontSize: 12, marginTop: 6 }}>Доступ к геолокации запрещён. Выберите «откуда» вручную.</Text>
        )}
      </FadeSlideIn>

      {state.phase === 'loading' && (
        <FadeSlideIn><Text style={{ color: colors.subtext, textAlign: 'center', marginTop: 16 }}>Ищем лучшие варианты…</Text></FadeSlideIn>
      )}
      {state.phase === 'done' && state.journeys.length === 0 && (
        <FadeSlideIn>
          <GlassCard radius={20} padding={16}>
            <Text style={{ color: colors.text, fontWeight: '700', marginBottom: 4 }}>Ничего не найдено</Text>
            <Text style={{ color: colors.subtext, fontSize: 14 }}>{state.message}</Text>
          </GlassCard>
        </FadeSlideIn>
      )}
      {state.journeys.map((j, i) => (
        <JourneyCard key={i + '-' + j.leaveAt + j.arriveAt} journey={j} index={i}
          onPress={() => onShowJourney({ journey: j, from: ctxRef.current.from, to: ctxRef.current.to, nonce: Date.now() })} />
      ))}
      {state.journeys.length > 0 && (
        <Text style={{ color: colors.subtext, fontSize: 11 }}>
          Расчёт по расписанию{data.isDemo ? ' (ДЕМО-данные)' : ''}, без GPS транспорта. Пешие участки считаются по прямой с поправкой на улицы (≈75 м/мин); время в пути между остановками определено по расписанию соседних остановок.
        </Text>
      )}
    </ScrollView>
  );
}

function JourneyCard({ journey: j, index, onPress }: { journey: Journey; index: number; onPress: () => void }) {
  const { colors, palette } = useTheme();
  const data = useMemo(() => loadTransitData(), []);
  const name = (id?: string) => (id ? data.stopById.get(id)?.name ?? '—' : '—');
  return (
    <FadeSlideIn delay={index * 120} distance={24} duration={420}>
      <PressableScale onPress={onPress} scaleTo={0.985}>
      <GlassCard radius={26} tinted={index === 0} padding={16}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
          {j.tags.map((t) => (
            <View key={t} style={{ backgroundColor: withAlpha(palette.accent, 0.25), borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
              <Text style={{ color: palette.accent, fontSize: 11, fontWeight: '800' }}>{TAGS[t]}</Text>
            </View>
          ))}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <Text style={{ color: colors.text, fontSize: 28, fontWeight: '800' }}>{j.totalMin} мин</Text>
          <Text style={{ color: colors.text, fontSize: 16, fontWeight: '700' }}>{formatTime(j.leaveAt)} → {formatTime(j.arriveAt)}</Text>
        </View>
        <Text style={{ color: colors.subtext, fontSize: 12, marginTop: 2 }}>
          пересадок: {j.transfers} · пешком: {j.walkMin} мин
        </Text>
        <View style={{ marginTop: 12, gap: 10 }}>
          {j.legs.map((l, i) =>
            l.kind === 'walk' ? (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Ionicons name="walk" size={20} color={colors.subtext} style={{ width: 52, textAlign: 'center' }} />
                <Text style={{ color: colors.subtext, fontSize: 13, flex: 1 }}>
                  Пешком {l.minutes} мин ({formatDistance(l.meters)}) до {l.toLabel ? `«${l.toLabel}»` : `остановки «${name(l.toStopId)}»`}
                </Text>
              </View>
            ) : (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                <RouteBadge number={l.route.number} type={l.route.type} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontSize: 14, fontWeight: '600' }}>{name(l.fromStopId)} · {formatTime(l.dep)}</Text>
                  <Text style={{ color: colors.subtext, fontSize: 12 }}>→ {l.headsign} · {l.stopsCount} ост. · {l.arr - l.dep} мин</Text>
                  <Text style={{ color: colors.text, fontSize: 14, fontWeight: '600', marginTop: 2 }}>Выйти: {name(l.toStopId)} · {formatTime(l.arr)}</Text>
                </View>
              </View>
            )
          )}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: withAlpha(colors.text, 0.1) }}>
          <Ionicons name="map-outline" size={16} color={palette.accent} />
          <Text style={{ color: palette.accent, fontWeight: '700', fontSize: 13 }}>Показать на карте</Text>
        </View>
      </GlassCard>
      </PressableScale>
    </FadeSlideIn>
  );
}
