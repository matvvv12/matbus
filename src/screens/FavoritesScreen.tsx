import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Text, TextInput } from '../components/Typography';
import { useInsets } from '../hooks/useInsets';
import { Ionicons } from '@expo/vector-icons';
import { GlassButton, GlassCard, LiquidGlass } from '../components/Glass';
import { AddressSearch } from '../components/AddressSearch';
import { usePlaces } from '../theme/PlacesContext';
import { PLACE_META, PlaceType, RoutePlace, SavedPlace, pointOf } from '../models/place';
import { useUserLocation } from '../hooks/useUserLocation';
import { reverseGeocode } from '../services/geocode';
import { withAlpha } from '../theme/themes';
import { FadeSlideIn, PressableScale } from '../components/Motion';
import { RouteBadge } from '../components/StopCard';
import { useTheme } from '../theme/ThemeContext';
import { useFavorites } from '../theme/FavoritesContext';
import { loadTransitData } from '../data/dataSource';
import { TRANSPORT_META } from '../models/transport';
import { formatTime, nextDepartures } from '../services/schedule';

type Slot = { type: PlaceType; id?: string } | null;

export default function FavoritesScreen({
  onOpenStop, onOpenRoute, onPlan, onPickOnMap,
}: {
  onOpenStop: (id: string) => void; onOpenRoute: (id: string) => void;
  onPlan: (from?: RoutePlace, to?: RoutePlace) => void;
  onPickOnMap: (type: PlaceType, title?: string, id?: string) => void;
}) {
  const insets = useInsets();
  const { colors, palette } = useTheme();
  const { stopIds, routeIds, toggle, toggleRoute } = useFavorites();
  const data = useMemo(() => loadTransitData(), []);
  const [now] = useState(new Date());

  const stops = stopIds.map((id) => data.stopById.get(id)).filter(Boolean) as NonNullable<ReturnType<typeof data.stopById.get>>[];
  const routes = routeIds.map((id) => data.routes.find((r) => r.id === id)).filter(Boolean) as typeof data.routes;

  return (
    <ScrollView contentContainerStyle={{ paddingTop: insets.top + 16, paddingHorizontal: 16, paddingBottom: 150, gap: 12 }}>
      <FadeSlideIn><Text style={{ color: colors.text, fontSize: 34, fontWeight: '800' }}>Избранное</Text></FadeSlideIn>

      <MyPlaces onPlan={onPlan} onPickOnMap={onPickOnMap} />

      {!stops.length && !routes.length && (
        <Text style={{ color: colors.subtext, fontSize: 13 }}>
          Остановки (звёздочка в карточке на карте) и маршруты (вкладка «Транспорт») появятся здесь.
        </Text>
      )}

      {stops.length > 0 && <Text style={{ color: colors.subtext, fontWeight: '700', fontSize: 13, textTransform: 'uppercase' }}>Остановки</Text>}
      {stops.map((s, i) => {
        const next = nextDepartures(data, s.id, now, 1)[0];
        return (
          <FadeSlideIn key={s.id} delay={i * 60} distance={14}>
            <PressableScale onPress={() => onOpenStop(s.id)} scaleTo={0.98}>
              <GlassCard radius={22} padding={14}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.text, fontSize: 16, fontWeight: '700' }} numberOfLines={1}>{s.name}</Text>
                    <Text style={{ color: colors.subtext, fontSize: 12, marginTop: 2 }}>
                      {s.types.map((t) => TRANSPORT_META[t].title).join(', ')}{s.isDemo ? ' · ДЕМО' : ''}
                    </Text>
                    {next && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 8 }}>
                        <RouteBadge number={next.route.number} type={next.route.type} />
                        <Text style={{ color: palette.accent, fontWeight: '800' }}>{next.inMin <= 0 ? 'сейчас' : `${next.inMin} мин`}</Text>
                        <Text style={{ color: colors.subtext, fontSize: 12 }}>{formatTime(next.timeMin)}</Text>
                      </View>
                    )}
                  </View>
                  <PressableScale onPress={() => toggle(s.id)} hitSlop={10}>
                    <Ionicons name="star" size={24} color={palette.accent} />
                  </PressableScale>
                </View>
              </GlassCard>
            </PressableScale>
          </FadeSlideIn>
        );
      })}

      {routes.length > 0 && <Text style={{ color: colors.subtext, fontWeight: '700', fontSize: 13, textTransform: 'uppercase', marginTop: 8 }}>Маршруты</Text>}
      {routes.map((r, i) => (
        <FadeSlideIn key={r.id} delay={(stops.length + i) * 60} distance={14}>
          <PressableScale onPress={() => onOpenRoute(r.id)} scaleTo={0.98}>
            <GlassCard radius={22} padding={14}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <RouteBadge number={r.number} type={r.type} />
                <Text style={{ color: colors.text, flex: 1, marginLeft: 12, fontSize: 14 }} numberOfLines={2}>
                  {r.directions[0]?.title ?? TRANSPORT_META[r.type].title}
                </Text>
                <PressableScale onPress={() => toggleRoute(r.id)} hitSlop={10}>
                  <Ionicons name="star" size={24} color={palette.accent} />
                </PressableScale>
              </View>
            </GlassCard>
          </PressableScale>
        </FadeSlideIn>
      ))}
    </ScrollView>
  );
}

function MyPlaces({ onPlan, onPickOnMap }: { onPlan: (from?: RoutePlace, to?: RoutePlace) => void; onPickOnMap: (type: PlaceType, title?: string, id?: string) => void }) {
  const { colors, palette } = useTheme();
  const { places, savePlace, removePlace } = usePlaces();
  const { location, request, status } = useUserLocation();
  const [slot, setSlot] = useState<Slot>(null);
  const [editing, setEditing] = useState(false);
  const [customTitle, setCustomTitle] = useState('');
  const [wantMe, setWantMe] = useState(false);

  const fixed: PlaceType[] = ['home', 'work', 'study'];
  const customs = places.filter((p) => p.type === 'custom');
  const current: SavedPlace | undefined = slot ? places.find((p) => p.id === (slot.id ?? slot.type)) : undefined;
  const isNew = !!slot && !current;
  const showSearch = !!slot && (isNew || editing);

  const close = () => { setSlot(null); setEditing(false); setCustomTitle(''); };

  const save = (data: { address: string; latitude: number; longitude: number }) => {
    if (!slot) return;
    savePlace(slot.type, { ...data, title: slot.type === 'custom' ? customTitle || 'Место' : undefined }, slot.id);
    close();
  };

  const onPick = (p: RoutePlace) => {
    if (p.kind === 'point') save({ address: [p.title, p.subtitle].filter(Boolean).join(', '), latitude: p.latitude, longitude: p.longitude });
    else if (p.kind === 'me') { setWantMe(true); request(); }
  };

  useEffect(() => {
    if (!wantMe || !location) return;
    setWantMe(false);
    reverseGeocode(location.latitude, location.longitude).then((a) =>
      save({ address: a ?? 'Моё местоположение', latitude: location.latitude, longitude: location.longitude }));
  }, [wantMe, location]);

  const tile = (key: string, type: PlaceType, p: SavedPlace | undefined, id?: string) => {
    const meta = PLACE_META[type];
    const active = slot && (slot.id ?? slot.type) === (id ?? type);
    return (
      <PressableScale key={key} onPress={() => { setSlot({ type, id: p?.id }); setEditing(false); }} scaleTo={0.95} style={{ width: '31%' }}>
        <LiquidGlass radius={20} tint={active ? 0.5 : p ? 0.28 : 0.08}
          contentStyle={{ padding: 12, alignItems: 'center', minHeight: 92, justifyContent: 'center' }}>
          <Ionicons name={meta.icon as any} size={24} color={p ? palette.accent : colors.subtext} />
          <Text style={{ color: colors.text, fontWeight: '800', fontSize: 13, marginTop: 6 }} numberOfLines={1}>{p ? p.title : meta.title}</Text>
          <Text style={{ color: colors.subtext, fontSize: 10, marginTop: 2 }} numberOfLines={1}>{p ? p.address : 'Задать'}</Text>
        </LiquidGlass>
      </PressableScale>
    );
  };

  return (
    <View style={{ gap: 12 }}>
      <Text style={{ color: colors.subtext, fontWeight: '700', fontSize: 13, textTransform: 'uppercase' }}>Мои места</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10 }}>
        {fixed.map((t) => tile(t, t, places.find((p) => p.id === t)))}
        {customs.map((c) => tile(c.id, 'custom', c, c.id))}
        <PressableScale key="add" onPress={() => { setSlot({ type: 'custom' }); setEditing(false); setCustomTitle(''); }} scaleTo={0.95} style={{ width: '31%' }}>
          <LiquidGlass radius={20} tint={0.06} contentStyle={{ padding: 12, alignItems: 'center', minHeight: 92, justifyContent: 'center' }}>
            <Ionicons name="add" size={26} color={palette.accent} />
            <Text style={{ color: colors.text, fontWeight: '700', fontSize: 12, marginTop: 6 }}>Другое</Text>
          </LiquidGlass>
        </PressableScale>
      </View>

      {slot && (
        <FadeSlideIn distance={-8} duration={240} key={(slot.id ?? slot.type) + String(showSearch)}>
          <GlassCard radius={24} tinted padding={14}>
            {showSearch ? (
              <View style={{ gap: 10 }}>
                <Text style={{ color: colors.text, fontSize: 16, fontWeight: '800' }}>
                  {slot.type === 'custom' ? 'Новое место' : `Где ваш${slot.type === 'home' ? ' дом' : slot.type === 'work' ? 'а работа' : 'а учёба'}?`}
                </Text>
                {slot.type === 'custom' && (
                  <TextInput value={customTitle} onChangeText={setCustomTitle} placeholder="Название (например, Магазин)"
                    placeholderTextColor={colors.subtext}
                    style={{ color: colors.text, fontSize: 16, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: withAlpha(colors.text, 0.15), outlineStyle: 'none' } as any} />
                )}
                <AddressSearch placeholder="Адрес или название места" allowMe showStops={false} showSaved={false} onPick={onPick} />
                {status === 'denied' && <Text style={{ color: '#FF453A', fontSize: 12 }}>Доступ к геолокации запрещён.</Text>}
                <GlassButton label="Выбрать на карте" icon="map" onPress={() => onPickOnMap(slot.type, slot.type === 'custom' ? customTitle || 'Место' : undefined, slot.id)} />
                <PressableScale onPress={close}><Text style={{ color: colors.subtext, textAlign: 'center', paddingVertical: 4 }}>Отмена</Text></PressableScale>
              </View>
            ) : current ? (
              <View style={{ gap: 10 }}>
                <Text style={{ color: colors.text, fontSize: 18, fontWeight: '800' }}>{current.title}</Text>
                <Text style={{ color: colors.subtext, fontSize: 13 }}>{current.address}</Text>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <PressableScale style={{ flex: 1 }} onPress={() => onPlan({ kind: 'me' }, pointOf(current))}>
                    <View style={{ paddingVertical: 12, borderRadius: 14, alignItems: 'center', backgroundColor: withAlpha(palette.accent, 0.25) }}>
                      <Text style={{ color: palette.accent, fontWeight: '800', fontSize: 13 }}>Маршрут сюда</Text>
                    </View>
                  </PressableScale>
                  <PressableScale style={{ flex: 1 }} onPress={() => onPlan(pointOf(current), undefined)}>
                    <View style={{ paddingVertical: 12, borderRadius: 14, alignItems: 'center', backgroundColor: withAlpha(palette.accent, 0.25) }}>
                      <Text style={{ color: palette.accent, fontWeight: '800', fontSize: 13 }}>Маршрут отсюда</Text>
                    </View>
                  </PressableScale>
                </View>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <PressableScale style={{ flex: 1 }} onPress={() => setEditing(true)}>
                    <View style={{ paddingVertical: 10, borderRadius: 14, alignItems: 'center', backgroundColor: withAlpha(colors.text, 0.08) }}>
                      <Text style={{ color: colors.text, fontWeight: '700', fontSize: 13 }}>Изменить</Text>
                    </View>
                  </PressableScale>
                  <PressableScale style={{ flex: 1 }} onPress={() => { removePlace(current.id); close(); }}>
                    <View style={{ paddingVertical: 10, borderRadius: 14, alignItems: 'center', backgroundColor: 'rgba(255,69,58,0.15)' }}>
                      <Text style={{ color: '#FF453A', fontWeight: '700', fontSize: 13 }}>Удалить</Text>
                    </View>
                  </PressableScale>
                  <PressableScale style={{ width: 44 }} onPress={close}>
                    <View style={{ paddingVertical: 10, borderRadius: 14, alignItems: 'center', backgroundColor: withAlpha(colors.text, 0.08) }}>
                      <Ionicons name="close" size={16} color={colors.subtext} />
                    </View>
                  </PressableScale>
                </View>
              </View>
            ) : null}
          </GlassCard>
        </FadeSlideIn>
      )}
    </View>
  );
}
