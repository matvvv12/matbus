import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Text, TextInput } from '../components/Typography';
import { useInsets } from '../hooks/useInsets';
import { Ionicons } from '@expo/vector-icons';
import { EmptyState, GlassCard } from '../components/Glass';
import { FadeSlideIn, PressableScale } from '../components/Motion';
import { RouteBadge } from '../components/StopCard';
import { useTheme } from '../theme/ThemeContext';
import { useFavorites } from '../theme/FavoritesContext';
import { withAlpha } from '../theme/themes';
import { loadTransitData } from '../data/dataSource';
import { TRANSPORT_META, TransportType } from '../models/transport';
import { TransportRoute } from '../models/stop';
import { dayTypeOf, formatTime, minutesOfDay, normTitle, shortTitle } from '../services/schedule';

const CATS: TransportType[] = ['bus', 'trolleybus', 'tram', 'minibus'];

export default function TransportScreen({
  onOpenStop, pendingRoute,
}: { onOpenStop: (id: string) => void; pendingRoute?: { id: string; nonce: number } | null }) {
  const insets = useInsets();
  const { colors, palette } = useTheme();
  const { isFavoriteRoute, toggleRoute } = useFavorites();
  const data = useMemo(() => loadTransitData(), []);
  const [cat, setCat] = useState<TransportType>('bus');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<TransportRoute | null>(null);

  useEffect(() => {
    if (!pendingRoute) return;
    const r = data.routes.find((x) => x.id === pendingRoute.id);
    if (r) { setCat(r.type); setOpen(r); }
  }, [pendingRoute?.nonce]);

  const list = useMemo(() => {
    const s = q.trim().toLowerCase().replace(/ё/g, 'е');
    return data.routes
      .filter((r) => r.type === cat)
      .filter((r) => !s || r.number.toLowerCase().includes(s) ||
        r.directions.some((d) => d.title.toLowerCase().replace(/ё/g, 'е').includes(s)))
      .sort((a, b) => a.number.localeCompare(b.number, 'ru', { numeric: true }));
  }, [data, cat, q]);

  if (open) {
    return (
      <FadeSlideIn axis="x" distance={50} duration={300} style={{ flex: 1 }}>
        <RouteDetail route={open} onBack={() => setOpen(null)} onOpenStop={onOpenStop} />
      </FadeSlideIn>
    );
  }

  if (!data.routes.length) {
    return (
      <EmptyState icon="bus" title="Маршруты не загружены"
        message="Выполните: node tools/import-voat.mjs --routes-only и перезапустите приложение." />
    );
  }

  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ paddingTop: insets.top + 16, paddingHorizontal: 16, paddingBottom: 150, gap: 12 }}
    >
      <FadeSlideIn><Text style={{ color: colors.text, fontSize: 34, fontWeight: '800' }}>Транспорт</Text></FadeSlideIn>

      <FadeSlideIn delay={60}>
        <GlassCard radius={18} padding={4}>
          <View style={{ flexDirection: 'row' }}>
            {CATS.map((c) => {
              const active = c === cat;
              return (
                <PressableScale key={c} onPress={() => setCat(c)} style={{ flex: 1 }} scaleTo={0.94}>
                  <View style={{ paddingVertical: 10, alignItems: 'center', borderRadius: 14,
                    backgroundColor: active ? withAlpha(TRANSPORT_META[c].color, 0.3) : 'transparent' }}>
                    <Ionicons name={TRANSPORT_META[c].icon as any} size={16} color={TRANSPORT_META[c].color} />
                    <Text style={{ color: colors.text, fontSize: 12, fontWeight: '700', marginTop: 2 }}>
                      {c === 'minibus' ? 'Маршрутки' : c === 'bus' ? 'Автобусы' : c === 'tram' ? 'Трамваи' : 'Троллейбусы'}
                    </Text>
                  </View>
                </PressableScale>
              );
            })}
          </View>
        </GlassCard>
      </FadeSlideIn>

      <FadeSlideIn delay={120}>
        <GlassCard radius={18} padding={12}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Ionicons name="search" size={18} color={colors.subtext} />
            <TextInput value={q} onChangeText={setQ} placeholder="Номер или название конечной"
              placeholderTextColor={colors.subtext}
              style={{ flex: 1, marginLeft: 8, color: colors.text, fontSize: 16, outlineStyle: 'none' } as any} />
          </View>
        </GlassCard>
      </FadeSlideIn>

      {list.length === 0 && (
        <Text style={{ color: colors.subtext, textAlign: 'center', marginTop: 20 }}>Ничего не найдено</Text>
      )}

      {list.map((r, i) => (
        <FadeSlideIn key={r.id} delay={Math.min(i, 8) * 45} distance={14}>
          <PressableScale onPress={() => setOpen(r)} scaleTo={0.98}>
            <GlassCard radius={20} padding={14}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <RouteBadge number={r.number} type={r.type} />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={{ color: colors.text, fontSize: 14, fontWeight: '600' }} numberOfLines={2}>
                    {r.directions[0]?.title ?? 'Маршрут'}
                  </Text>
                  <Text style={{ color: colors.subtext, fontSize: 12, marginTop: 2 }}>
                    {r.directions.length ? `направлений: ${r.directions.length} · остановок: ${r.directions[0].stopIds.length}` : 'порядок остановок не загружен'}
                  </Text>
                </View>
                <PressableScale onPress={() => toggleRoute(r.id)} hitSlop={10}>
                  <Ionicons name={isFavoriteRoute(r.id) ? 'star' : 'star-outline'} size={22} color={palette.accent} />
                </PressableScale>
              </View>
            </GlassCard>
          </PressableScale>
        </FadeSlideIn>
      ))}
    </ScrollView>
  );
}

function RouteDetail({ route, onBack, onOpenStop }: { route: TransportRoute; onBack: () => void; onOpenStop: (id: string) => void }) {
  const insets = useInsets();
  const { colors, palette } = useTheme();
  const { isFavoriteRoute, toggleRoute } = useFavorites();
  const data = useMemo(() => loadTransitData(), []);
  const [di, setDi] = useState(0);
  const dir = route.directions[di];
  const now = new Date();
  const nowMin = minutesOfDay(now);
  const day = dayTypeOf(now);

  const nextAt = (stopId: string): { time: number; estimated: boolean } | null => {
    if (!dir) return null;
    const nt = normTitle(dir.title);
    const e = (data.byStop.get(stopId) ?? []).find((x) => x.routeId === route.id && x.day === day && normTitle(x.title) === nt);
    const t = e?.times.find((x) => x >= nowMin);
    return t == null ? null : { time: t, estimated: Boolean(e?.estimated) };
  };

  return (
    <ScrollView contentContainerStyle={{ paddingTop: insets.top + 8, paddingHorizontal: 16, paddingBottom: 150, gap: 12 }}>
      <PressableScale onPress={onBack} style={{ alignSelf: 'flex-start' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6 }}>
          <Ionicons name="chevron-back" size={22} color={palette.accent} />
          <Text style={{ color: palette.accent, fontSize: 17 }}>Транспорт</Text>
        </View>
      </PressableScale>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <RouteBadge number={route.number} type={route.type} />
        <Text style={{ color: colors.text, fontSize: 20, fontWeight: '800', flex: 1 }}>
          {TRANSPORT_META[route.type].title} {route.number}
        </Text>
        <PressableScale onPress={() => toggleRoute(route.id)} hitSlop={10}>
          <Ionicons name={isFavoriteRoute(route.id) ? 'star' : 'star-outline'} size={26} color={palette.accent} />
        </PressableScale>
      </View>

      {route.directions.length === 0 ? (
        <Text style={{ color: colors.subtext }}>Порядок остановок не загружен: node tools/import-voat.mjs --routes-only</Text>
      ) : (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {route.directions.map((d, i) => (
              <PressableScale key={i} onPress={() => setDi(i)}>
                <View style={{ paddingHorizontal: 14, paddingVertical: 9, borderRadius: 16,
                  backgroundColor: i === di ? withAlpha(palette.accent, 0.35) : withAlpha(colors.text, 0.08) }}>
                  <Text style={{ color: colors.text, fontWeight: '600', fontSize: 13 }}>→ {shortTitle(d.title)}</Text>
                </View>
              </PressableScale>
            ))}
          </ScrollView>

          <GlassCard radius={22} padding={14}>
            {dir.stopIds.map((id, i) => {
              const st = data.stopById.get(id);
              const departure = nextAt(id);
              const last = i === dir.stopIds.length - 1;
              return (
                <FadeSlideIn key={id + i} delay={Math.min(i, 14) * 30} distance={10} duration={260}>
                  <PressableScale onPress={() => onOpenStop(id)} scaleTo={0.98}>
                    <View style={{ flexDirection: 'row', alignItems: 'stretch' }}>
                      <View style={{ width: 22, alignItems: 'center' }}>
                        <View style={{ width: 2, flex: 1, backgroundColor: i === 0 ? 'transparent' : withAlpha(TRANSPORT_META[route.type].color, 0.5) }} />
                        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: TRANSPORT_META[route.type].color }} />
                        <View style={{ width: 2, flex: 1, backgroundColor: last ? 'transparent' : withAlpha(TRANSPORT_META[route.type].color, 0.5) }} />
                      </View>
                      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', paddingVertical: 11, marginLeft: 8 }}>
                        <Text style={{ color: colors.text, fontSize: 15, flex: 1 }} numberOfLines={1}>{st?.name ?? '—'}</Text>
                        {departure != null && (
                          <Text style={{ color: palette.accent, fontWeight: '700', fontSize: 13 }}>{departure.estimated ? '≈ ' : ''}{formatTime(departure.time)}</Text>
                        )}
                      </View>
                    </View>
                  </PressableScale>
                </FadeSlideIn>
              );
            })}
          </GlassCard>
          <Text style={{ color: colors.subtext, fontSize: 11 }}>
            Справа — ближайшее отправление. Для маршруток знак ≈ означает расчётное время между остановками; нажмите остановку, чтобы открыть её на карте.
          </Text>
        </>
      )}
    </ScrollView>
  );
}
