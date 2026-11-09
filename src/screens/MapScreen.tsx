import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Keyboard, ScrollView, View } from 'react-native';
import { Text, TextInput } from '../components/Typography';
import { useInsets } from '../hooks/useInsets';
import { Ionicons } from '@expo/vector-icons';
import LeafletMap from '../components/LeafletMap';
import { GlassCard } from '../components/Glass';
import { FadeSlideIn, PressableScale } from '../components/Motion';
import { RouteBadge, StopCard } from '../components/StopCard';
import { useTheme } from '../theme/ThemeContext';
import { useFavorites } from '../theme/FavoritesContext';
import { withAlpha } from '../theme/themes';
import { loadTransitData } from '../data/dataSource';
import { TRANSPORT_META, TransportType } from '../models/transport';
import { Stop } from '../models/stop';
import { distanceMeters, formatDistance } from '../services/geo';
import { formatTime, nextDepartures } from '../services/schedule';
import { useUserLocation } from '../hooks/useUserLocation';
import { GlassButton } from '../components/Glass';
import { usePlaces } from '../theme/PlacesContext';
import { PLACE_META, PlaceType, RoutePlace } from '../models/place';
import { reverseGeocode } from '../services/geocode';
import type { JourneyView } from '../services/router';
import { RouteGeometry, buildGeometry, buildRoutePreview, computeBounds } from '../services/journeyGeometry';
import { snapToRoad } from '../services/osrm';

const FILTERS: TransportType[] = ['bus', 'trolleybus', 'tram', 'minibus'];
const hasCoords = (s: Stop) => s.latitude != null && s.longitude != null;


type Pin = { latitude: number; longitude: number; label: string | null };
export type PickRequest = { type: PlaceType; title?: string; id?: string; nonce: number };

export default function MapScreen({
  pendingStop, pick, onPlan, onPickDone, journey, onCloseJourney,
}: {
  pendingStop?: { id: string; nonce: number } | null;
  pick?: PickRequest | null;
  onPlan: (from?: RoutePlace, to?: RoutePlace) => void;
  onPickDone: () => void;
  journey?: JourneyView | null;
  onCloseJourney: () => void;
}) {
  const insets = useInsets();
  const { colors, palette, scheme } = useTheme();
  const { isFavorite, toggle } = useFavorites();
  const data = useMemo(() => loadTransitData(), []);
  const { location, status, request } = useUserLocation();

  const [now, setNow] = useState(new Date());
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<TransportType | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedPi, setSelectedPi] = useState(0);
  const [pin, setPin] = useState<Pin | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [geom, setGeom] = useState<RouteGeometry | null>(null);
  const [geomLoading, setGeomLoading] = useState(false);
  const [routePreview, setRoutePreview] = useState<{ routeId: string; directionIndex: number; nonce: number } | null>(null);
  const [fit, setFit] = useState<{ bounds: [[number, number], [number, number]]; nonce: number } | null>(null);
  const { savePlace } = usePlaces();
  const locRef = React.useRef(location);
  locRef.current = location;
  const [focus, setFocus] = useState<{ latitude: number; longitude: number; nonce: number } | null>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  const visibleStops = useMemo(
    () => (filter ? data.stops.filter((s) => s.types.includes(filter)) : data.stops),
    [data, filter]
  );
  const mappedStops = useMemo(() => visibleStops.filter(hasCoords), [visibleStops]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/ё/g, 'е');
    if (!q) return [];
    return data.stops
      .filter((s) => (s.name + ' ' + s.address).toLowerCase().replace(/ё/g, 'е').includes(q))
      .slice(0, 6);
  }, [data, query]);

  const nearby = useMemo(() => {
    const anchor = pin ?? location;
    if (!anchor) return [];
    return mappedStops
      .map((s) => ({ stop: s, dist: distanceMeters(anchor, s as any) }))
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 8);
  }, [location, pin, mappedStops]);

  const selected = data.stops.find((s) => s.id === selectedId) ?? null;
  const previewRoute = routePreview ? data.routes.find((route) => route.id === routePreview.routeId) ?? null : null;
  const preview = useMemo(() => previewRoute ? buildRoutePreview(data, previewRoute, routePreview?.directionIndex ?? 0) : null, [data, previewRoute, routePreview?.directionIndex]);
  const [previewGeometry, setPreviewGeometry] = useState<RouteGeometry | null>(null);

  const focusPlatform = useCallback((stop: Stop, pi: number) => {
    const p = stop.platforms[pi] ?? (hasCoords(stop) ? { latitude: stop.latitude as number, longitude: stop.longitude as number } : null);
    if (p) setFocus({ latitude: p.latitude, longitude: p.longitude, nonce: Date.now() });
  }, []);

  const select = useCallback((stop: Stop, pi?: number) => {
    let idx = pi ?? 0;
    const loc = locRef.current;
    if (pi == null && loc && stop.platforms.length > 1) {
      let best = Infinity;
      stop.platforms.forEach((pl, i) => {
        const d = distanceMeters(loc, pl);
        if (d < best) { best = d; idx = i; }
      });
    }
    setRoutePreview(null);
    setSelectedId(stop.id);
    setSelectedPi(idx);
    focusPlatform(stop, idx);
  }, [focusPlatform]);

  const onMapSelect = useCallback(
    (id: string, pi: number) => {
      const s = data.stops.find((x) => x.id === id);
      if (s) select(s, pi);
    },
    [data, select]
  );

  useEffect(() => {
    if (!pendingStop) return;
    const s = data.stopById.get(pendingStop.id);
    if (s) select(s);
  }, [pendingStop?.nonce]);

  useEffect(() => {
    if (location) setFocus({ ...location, nonce: Date.now() });
  }, [location]);

  useEffect(() => {
    if (!journey) { setGeom(null); setGeomLoading(false); return; }
    let cancelled = false;
    setGeom(null);
    setGeomLoading(true);
    const g = buildGeometry(data, journey);
    (async () => {
      const lines = await Promise.all(
        g.lines.map(async (ln) => {
          if (ln.kind !== 'ride' || ln.type === 'tram') return ln; // трамвай идёт по рельсам, прямые отрезки точнее
          const snapped = await Promise.race([snapToRoad(ln.pts), new Promise<null>((r) => setTimeout(() => r(null), 3500))]);
          return snapped ? { ...ln, pts: snapped } : ln;
        })
      );
      if (!cancelled) {
        setGeom({ ...g, lines, bounds: computeBounds(lines, g.markers) });
        setGeomLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [journey?.nonce]);

  // Для автобусов, троллейбусов и маршруток уточняем линию по уличной сети.
  // Если OSRM недоступен, сразу остаётся базовая линия между координатами остановок.
  useEffect(() => {
    if (!routePreview || !preview) { setPreviewGeometry(null); return; }
    let cancelled = false;
    const base = preview.geometry;
    setPreviewGeometry(base);
    if (previewRoute?.type === 'tram' || !base.lines.length) return;
    (async () => {
      const lines = await Promise.all(base.lines.map(async (line) => {
        if (line.kind !== 'ride') return line;
        const snapped = await Promise.race([
          snapToRoad(line.pts),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 4500)),
        ]);
        return snapped ? { ...line, pts: snapped } : line;
      }));
      if (!cancelled) setPreviewGeometry({ ...base, lines, bounds: computeBounds(lines, base.markers) });
    })();
    return () => { cancelled = true; };
  }, [routePreview?.nonce, preview, previewRoute?.type]);

  const onMapTap = useCallback((lat: number, lng: number) => {
    setSelectedId(null);
    setPin({ latitude: lat, longitude: lng, label: null });
    reverseGeocode(lat, lng).then((a) =>
      setPin((p) => (p && p.latitude === lat && p.longitude === lng ? { ...p, label: a ?? 'Точка на карте' } : p)));
  }, []);

  useEffect(() => {
    if (pick) { setPin(null); setSelectedId(null); }
  }, [pick?.nonce]);

  const flash = (t: string) => { setToast(t); setTimeout(() => setToast(null), 2200); };

  const openRoutePreview = useCallback((routeId: string, directionIndex = 0) => {
    setRoutePreview({ routeId, directionIndex, nonce: Date.now() });
    setSelectedId(null);
    setPin(null);
    setFilter(null);
  }, []);

  const saveAs = (type: PlaceType, title?: string, id?: string) => {
    if (!pin) return;
    const address = pin.label ?? 'Точка на карте';
    savePlace(type, { address, latitude: pin.latitude, longitude: pin.longitude, title: type === 'custom' ? title || address.split(',')[0] : undefined }, id);
    if (pick) { setPin(null); onPickDone(); }
    else { flash(`Сохранено: ${type === 'custom' ? title || address.split(',')[0] : PLACE_META[type].title}`); }
  };

  const bottom = Math.max(insets.bottom, 8) + 104;

  return (
    <View style={{ flex: 1 }}>
      <LeafletMap
        stops={journey || routePreview ? [] : mappedStops}
        selectedId={selectedId}
        selectedPlatform={selectedPi}
        user={location}
        focus={focus}
        dark={scheme === 'dark'}
        accent={palette.accent}
        pin={journey || routePreview ? null : pin}
        route={journey ? geom : previewGeometry ?? preview?.geometry ?? null}
        fit={fit}
        onTap={journey || routePreview ? () => {} : onMapTap}
        onSelect={onMapSelect}
      />

      <View style={[{ position: 'absolute', top: insets.top + 16, left: 16, right: 16 }, journey || routePreview ? { display: 'none' } : null]} pointerEvents="box-none">
        <FadeSlideIn distance={-20} duration={450}>
          <GlassCard radius={22} padding={12}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Ionicons name="search" size={18} color={colors.subtext} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Поиск остановки"
                placeholderTextColor={colors.subtext}
                style={{ flex: 1, marginLeft: 8, color: colors.text, fontSize: 16, paddingVertical: 2, outlineStyle: 'none' } as any}
              />
              {query.length > 0 && (
                <PressableScale onPress={() => setQuery('')} hitSlop={8} style={{ marginRight: 10 }}>
                  <Ionicons name="close-circle" size={18} color={colors.subtext} />
                </PressableScale>
              )}
              <PressableScale onPress={request} hitSlop={8}>
                <Ionicons
                  name={location ? 'locate' : 'locate-outline'}
                  size={22}
                  color={status === 'loading' ? colors.subtext : palette.accent}
                />
              </PressableScale>
            </View>
          </GlassCard>
        </FadeSlideIn>

        {results.length > 0 && (
          <FadeSlideIn distance={-8} duration={220} key={'r' + results.length + results[0].id}>
            <GlassCard radius={20} padding={6} style={{ marginTop: 8 }}>
              {results.map((s, i) => (
                <FadeSlideIn key={s.id} delay={i * 35} distance={8} duration={240}>
                  <PressableScale
                    scaleTo={0.98}
                    onPress={() => {
                      select(s);
                      setQuery('');
                      Keyboard.dismiss();
                    }}
                  >
                    <View style={{ paddingVertical: 10, paddingHorizontal: 10 }}>
                      <Text style={{ color: colors.text, fontSize: 15, fontWeight: '600' }}>{s.name}</Text>
                      <Text style={{ color: colors.subtext, fontSize: 12 }}>
                        {s.types.map((t) => TRANSPORT_META[t].title).join(', ') || s.address}{s.latitude == null ? ' · нет координат на карте' : ''}
                      </Text>
                    </View>
                  </PressableScale>
                </FadeSlideIn>
              ))}
            </GlassCard>
          </FadeSlideIn>
        )}
        {query.trim().length > 0 && results.length === 0 && (
          <FadeSlideIn distance={-8} duration={220}>
            <GlassCard radius={20} padding={14} style={{ marginTop: 8 }}>
              <Text style={{ color: colors.subtext, fontSize: 14 }}>Ничего не найдено</Text>
            </GlassCard>
          </FadeSlideIn>
        )}

        <FadeSlideIn delay={120} distance={-14}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10 }} contentContainerStyle={{ gap: 8 }}>
            <Chip label="Все" active={filter === null} onPress={() => setFilter(null)} />
            {FILTERS.map((t) => (
              <Chip
                key={t}
                label={TRANSPORT_META[t].title}
                icon={TRANSPORT_META[t].icon}
                color={TRANSPORT_META[t].color}
                active={filter === t}
                onPress={() => setFilter(filter === t ? null : t)}
              />
            ))}
          </ScrollView>
        </FadeSlideIn>

        {pick && (
          <FadeSlideIn delay={100} distance={-10}>
            <View style={{ marginTop: 8 }}>
              <GlassCard radius={18} tinted padding={12}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Ionicons name={PLACE_META[pick.type].icon as any} size={20} color={palette.accent} />
                  <Text style={{ color: colors.text, fontWeight: '700', flex: 1 }}>
                    Нажмите на карту, чтобы указать: {pick.title || PLACE_META[pick.type].title}
                  </Text>
                  <PressableScale onPress={() => { setPin(null); onPickDone(); }}>
                    <Text style={{ color: colors.subtext, fontWeight: '700' }}>Отмена</Text>
                  </PressableScale>
                </View>
              </GlassCard>
            </View>
          </FadeSlideIn>
        )}
        {toast && (
          <FadeSlideIn distance={-10} duration={220}>
            <View style={{ marginTop: 8, alignSelf: 'flex-start' }}>
              <GlassCard radius={14}>
                <Text style={{ color: colors.text, fontSize: 13, fontWeight: '700', paddingHorizontal: 12, paddingVertical: 8 }}>{toast}</Text>
              </GlassCard>
            </View>
          </FadeSlideIn>
        )}
        {data.isDemo && (
          <FadeSlideIn delay={250} distance={-10}>
            <View style={{ marginTop: 8, alignSelf: 'flex-start' }}>
              <GlassCard radius={14}>
                <Text style={{ color: '#FF9F0A', fontSize: 11, fontWeight: '700', paddingHorizontal: 10, paddingVertical: 6 }}>
                  Показаны ДЕМО-данные. Реальные: см. README, шаг загрузки
                </Text>
              </GlassCard>
            </View>
          </FadeSlideIn>
        )}
      </View>

      {journey && (
        <View style={{ position: 'absolute', top: insets.top + 16, left: 16, right: 16 }} pointerEvents="box-none">
          <FadeSlideIn distance={-20} duration={400}>
            <GlassCard radius={24} tinted padding={12}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Ionicons name="git-branch-outline" size={20} color={palette.accent} />
                <Text style={{ color: colors.text, fontSize: 15, fontWeight: '700', flex: 1 }} numberOfLines={1}>
                  {(journey.from?.title ?? 'Старт')} → {(journey.to?.title ?? 'Финиш')}
                </Text>
                <PressableScale onPress={onCloseJourney} hitSlop={10}>
                  <Ionicons name="close-circle" size={26} color={colors.subtext} />
                </PressableScale>
              </View>
            </GlassCard>
          </FadeSlideIn>
        </View>
      )}

      {routePreview && previewRoute && (
        <View style={{ position: 'absolute', top: insets.top + 16, left: 16, right: 16 }} pointerEvents="box-none">
          <FadeSlideIn distance={-18} duration={380}>
            <GlassCard radius={22} tinted padding={12}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <RouteBadge number={previewRoute.number} type={previewRoute.type} />
                <Text style={{ color: colors.text, fontSize: 14, fontWeight: '800', flex: 1 }} numberOfLines={1}>{TRANSPORT_META[previewRoute.type].title} · маршрут</Text>
                <PressableScale onPress={() => setRoutePreview(null)} hitSlop={8}>
                  <Ionicons name="close-circle" size={25} color={colors.subtext} />
                </PressableScale>
              </View>
              <Text style={{ color: colors.subtext, fontSize: 11, marginTop: 7 }} numberOfLines={2}>{preview?.direction?.title ?? 'Направление не указано'}</Text>
            </GlassCard>
          </FadeSlideIn>
        </View>
      )}

      <View style={{ position: 'absolute', left: 16, right: 16, bottom }} pointerEvents="box-none">
        {journey ? (
          <JourneyPanel journey={journey} loading={geomLoading} geom={geom} data={data}
            onFitAll={() => geom?.bounds && setFit({ bounds: geom.bounds, nonce: Date.now() })}
            onFitLeg={(i) => { const b = geom?.legBounds[i]; if (b) setFit({ bounds: b, nonce: Date.now() }); }} />
        ) : routePreview && previewRoute && preview ? (
          <RoutePreviewPanel route={previewRoute} directionIndex={routePreview.directionIndex} directionCount={previewRoute.directions.length}
            title={preview.direction?.title ?? 'Направление'} stops={preview.stopNames} mappedStopCount={preview.geometry.markers.length}
            onDirection={(directionIndex) => setRoutePreview((current) => current ? { ...current, directionIndex, nonce: Date.now() } : current)}
            onClose={() => setRoutePreview(null)} onFit={() => (previewGeometry?.bounds ?? preview.geometry.bounds) && setFit({ bounds: (previewGeometry?.bounds ?? preview.geometry.bounds)!, nonce: Date.now() })} />
        ) : selected ? (
          <StopCard
            key={selected.id}
            stop={selected}
            data={data}
            now={now}
            isFavorite={isFavorite(selected.id)}
            platformIdx={selectedPi}
            onSelectPlatform={(pi) => { setSelectedPi(pi); focusPlatform(selected, pi); }}
            onToggleFavorite={() => toggle(selected.id)}
            onClose={() => setSelectedId(null)}
            onOpenRoute={openRoutePreview}
          />
        ) : (pin || location) ? (
          <FadeSlideIn>
            {pin && (
              <View style={{ marginBottom: 10 }}>
                <PinCard key={pin.latitude + ',' + pin.longitude} pin={pin} pick={pick ?? null}
                  onClose={() => setPin(null)} onPlan={onPlan} onSave={saveAs} />
              </View>
            )}
            <Text style={{ color: colors.text, fontSize: 15, fontWeight: '800', marginBottom: 8, marginLeft: 4 }}>
              {pin ? 'Остановки рядом с точкой' : 'Ближайшие остановки'}
            </Text>
            {nearby.length === 0 ? (
              <GlassCard radius={22} padding={14}>
                <Text style={{ color: colors.subtext }}>Нет остановок с известным положением для выбранного типа транспорта.</Text>
              </GlassCard>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
                {nearby.map(({ stop, dist }, i) => {
                  const next = nextDepartures(data, stop.id, now, 1)[0];
                  return (
                    <FadeSlideIn key={stop.id} delay={i * 80} axis="x" distance={40}>
                      <PressableScale onPress={() => select(stop)} style={{ width: 220 }}>
                        <GlassCard radius={22} padding={14}>
                          <Text style={{ color: colors.text, fontSize: 15, fontWeight: '700' }} numberOfLines={1}>
                            {stop.name}
                          </Text>
                          <Text style={{ color: colors.subtext, fontSize: 12, marginTop: 2 }}>
                            {formatDistance(dist)}
                            {stop.isDemo ? ' · ДЕМО' : ''}
                          </Text>
                          {next ? (
                            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10 }}>
                              <RouteBadge number={next.route.number} type={next.route.type} />
                              <Text style={{ color: palette.accent, fontWeight: '800', marginLeft: 10 }}>
                                {next.inMin <= 0 ? 'сейчас' : `${next.inMin} мин`}
                              </Text>
                              <Text style={{ color: colors.subtext, fontSize: 11, marginLeft: 6 }}>{next.estimated ? '≈ ' : ''}{formatTime(next.timeMin)}</Text>
                            </View>
                          ) : (
                            <Text style={{ color: colors.subtext, fontSize: 12, marginTop: 10 }}>Рейсов сегодня нет</Text>
                          )}
                        </GlassCard>
                      </PressableScale>
                    </FadeSlideIn>
                  );
                })}
              </ScrollView>
            )}
          </FadeSlideIn>
        ) : (
          <FadeSlideIn>
            <PressableScale onPress={request} scaleTo={0.98}>
              <GlassCard radius={22} padding={14}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Ionicons name="locate" size={22} color={palette.accent} />
                  <View style={{ marginLeft: 12, flex: 1 }}>
                    <Text style={{ color: colors.text, fontWeight: '700', fontSize: 15 }}>
                      {status === 'loading' ? 'Определяем местоположение…' : 'Показать ближайшие остановки'}
                    </Text>
                    <Text style={{ color: colors.subtext, fontSize: 12, marginTop: 2 }}>
                      {status === 'denied'
                        ? 'Доступ к геолокации запрещён. Разрешите его в настройках (в Telegram: Настройки → Конфиденциальность → Геопозиция).'
                        : status === 'error'
                        ? 'Не удалось определить местоположение. Нажмите, чтобы повторить.'
                        : 'Нажмите, чтобы определить, где вы находитесь. Или выберите остановку на карте.'}
                    </Text>
                  </View>
                </View>
              </GlassCard>
            </PressableScale>
          </FadeSlideIn>
        )}
      </View>
    </View>
  );
}

function Chip({
  label, icon, color, active, onPress,
}: { label: string; icon?: string; color?: string; active: boolean; onPress: () => void }) {
  const { palette, colors } = useTheme();
  return (
    <PressableScale onPress={onPress}>
      <GlassCard radius={18}>
        <View
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8,
            backgroundColor: active ? withAlpha(palette.accent, 0.35) : 'transparent',
          }}
        >
          {icon && <Ionicons name={icon as any} size={14} color={color} />}
          <Text style={{ color: colors.text, fontWeight: '600', fontSize: 13 }}>{label}</Text>
        </View>
      </GlassCard>
    </PressableScale>
  );
}


function RoutePreviewPanel({ route, directionIndex, directionCount, title, stops, mappedStopCount, onDirection, onClose, onFit }: {
  route: import('../models/stop').TransportRoute; directionIndex: number; directionCount: number; title: string;
  stops: { id: string; name: string }[]; mappedStopCount: number; onDirection: (index: number) => void; onClose: () => void; onFit: () => void;
}) {
  const { colors, palette } = useTheme();
  const meta = TRANSPORT_META[route.type];
  return (
    <FadeSlideIn distance={32} duration={390}>
      <GlassCard radius={26} tinted padding={14}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <RouteBadge number={route.number} type={route.type} />
            <View>
              <Text style={{ color: colors.text, fontSize: 14, fontWeight: '800' }}>{meta.title}</Text>
              <Text style={{ color: colors.subtext, fontSize: 10 }}>{stops.length} остановок · на карте {mappedStopCount}{mappedStopCount < stops.length ? ` · без координат ${stops.length - mappedStopCount}` : ''}</Text>
            </View>
          </View>
          <PressableScale onPress={onClose} hitSlop={8}><Ionicons name="close-circle" size={25} color={colors.subtext} /></PressableScale>
        </View>
        {directionCount > 1 && (
          <View style={{ flexDirection: 'row', gap: 7, marginTop: 11 }}>
            {route.directions.map((direction, index) => {
              const active = index === directionIndex;
              return (
                <PressableScale key={`${direction.title}-${index}`} onPress={() => onDirection(index)} style={{ flex: 1 }} scaleTo={0.97}>
                  <View style={{ paddingVertical: 8, paddingHorizontal: 8, borderRadius: 12, backgroundColor: active ? withAlpha(meta.color, 0.2) : withAlpha(colors.text, 0.07), borderWidth: 1, borderColor: active ? meta.color : 'transparent' }}>
                    <Text style={{ color: active ? meta.color : colors.subtext, fontSize: 10, fontWeight: '800', textAlign: 'center' }}>{index === 0 ? 'Направление 1' : `Направление ${index + 1}`}</Text>
                  </View>
                </PressableScale>
              );
            })}
          </View>
        )}
        <Text style={{ color: colors.subtext, fontSize: 11, marginTop: 9, marginBottom: 5 }} numberOfLines={2}>{title}</Text>
        <ScrollView style={{ maxHeight: 122 }} nestedScrollEnabled showsVerticalScrollIndicator contentContainerStyle={{ paddingVertical: 3 }}>
          {stops.map((stop, index) => (
            <View key={`${stop.id}-${index}`} style={{ flexDirection: 'row', alignItems: 'center', minHeight: 26 }}>
              <View style={{ width: 22, alignItems: 'center' }}>
                <View style={{ width: index === 0 || index === stops.length - 1 ? 9 : 6, height: index === 0 || index === stops.length - 1 ? 9 : 6, borderRadius: 9, backgroundColor: index === 0 || index === stops.length - 1 ? meta.color : withAlpha(meta.color, 0.65) }} />
              </View>
              <Text style={{ color: colors.text, fontSize: 11, flex: 1, paddingVertical: 4 }} numberOfLines={1}>{stop.name}</Text>
              {(index === 0 || index === stops.length - 1) && <Text style={{ color: meta.color, fontSize: 9, fontWeight: '800' }}>{index === 0 ? 'СТАРТ' : 'КОНЕЧНАЯ'}</Text>}
            </View>
          ))}
        </ScrollView>
        {stops.length < 2 && <Text style={{ color: colors.subtext, fontSize: 11, marginTop: 6 }}>Недостаточно координат для построения линии на карте.</Text>}
        <PressableScale onPress={onFit} scaleTo={0.98}>
          <View style={{ marginTop: 10, borderRadius: 14, paddingVertical: 10, backgroundColor: withAlpha(palette.accent, 0.17), flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
            <Ionicons name="scan-outline" size={16} color={palette.accent} />
            <Text style={{ color: palette.accent, fontWeight: '800', fontSize: 12 }}>Показать весь маршрут</Text>
          </View>
        </PressableScale>
      </GlassCard>
    </FadeSlideIn>
  );
}

function PinCard({
  pin, pick, onClose, onPlan, onSave,
}: {
  pin: Pin; pick: PickRequest | null; onClose: () => void;
  onPlan: (from?: RoutePlace, to?: RoutePlace) => void;
  onSave: (type: PlaceType, title?: string, id?: string) => void;
}) {
  const { colors, palette } = useTheme();
  const [saving, setSaving] = useState(false);
  const place: RoutePlace = {
    kind: 'point', title: pin.label ?? 'Точка на карте', subtitle: '', latitude: pin.latitude, longitude: pin.longitude,
  };
  const btn = (label: string, icon: string, onPress: () => void, key?: string) => (
    <PressableScale key={key ?? label} style={{ flex: 1 }} onPress={onPress} scaleTo={0.95}>
      <View style={{ paddingVertical: 11, borderRadius: 14, alignItems: 'center', gap: 2, backgroundColor: withAlpha(palette.accent, 0.22) }}>
        <Ionicons name={icon as any} size={17} color={palette.accent} />
        <Text style={{ color: palette.accent, fontWeight: '800', fontSize: 12 }}>{label}</Text>
      </View>
    </PressableScale>
  );
  return (
    <GlassCard radius={26} tinted padding={14}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Ionicons name="location" size={22} color="#FF453A" />
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.text, fontSize: 16, fontWeight: '800' }} numberOfLines={2}>
            {pin.label ?? 'Определяем адрес…'}
          </Text>
          <Text style={{ color: colors.subtext, fontSize: 11 }}>{pin.latitude.toFixed(5)}, {pin.longitude.toFixed(5)}</Text>
        </View>
        <PressableScale onPress={onClose} hitSlop={10}>
          <Ionicons name="close-circle" size={26} color={colors.subtext} />
        </PressableScale>
      </View>
      <View style={{ marginTop: 12, gap: 10 }}>
        {pick ? (
          <GlassButton label={`Сохранить: ${pick.title || PLACE_META[pick.type].title}`} icon="checkmark" onPress={() => onSave(pick.type, pick.title, pick.id)} />
        ) : saving ? (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {(['home', 'work', 'study', 'custom'] as PlaceType[]).map((t) =>
              btn(PLACE_META[t].title, PLACE_META[t].icon, () => { onSave(t); setSaving(false); }, t))}
          </View>
        ) : (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {btn('Сюда', 'flag', () => onPlan({ kind: 'me' }, place))}
            {btn('Отсюда', 'navigate', () => onPlan(place, undefined))}
            {btn('Сохранить', 'bookmark', () => setSaving(true))}
          </View>
        )}
      </View>
    </GlassCard>
  );
}


function JourneyPanel({
  journey, loading, geom, data, onFitAll, onFitLeg,
}: {
  journey: JourneyView; loading: boolean; geom: RouteGeometry | null; data: ReturnType<typeof loadTransitData>;
  onFitAll: () => void; onFitLeg: (i: number) => void;
}) {
  const { colors, palette } = useTheme();
  const j = journey.journey;
  const name = (id?: string) => (id ? data.stopById.get(id)?.name ?? '—' : '—');
  return (
    <FadeSlideIn distance={40} duration={420}>
      <GlassCard radius={28} tinted padding={14}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <Text style={{ color: colors.text, fontSize: 26, fontWeight: '800' }}>{j.totalMin} мин</Text>
          <Text style={{ color: colors.text, fontSize: 15, fontWeight: '700' }}>{formatTime(j.leaveAt)} → {formatTime(j.arriveAt)}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 }}>
          <Text style={{ color: colors.subtext, fontSize: 12 }}>
            {loading ? 'Строим линию маршрута…' : `пересадок: ${j.transfers} · пешком: ${j.walkMin} мин`}
          </Text>
          <PressableScale onPress={onFitAll} hitSlop={8}>
            <Text style={{ color: palette.accent, fontSize: 12, fontWeight: '700' }}>Весь путь</Text>
          </PressableScale>
        </View>
        <ScrollView style={{ maxHeight: 170, marginTop: 10 }} showsVerticalScrollIndicator={false}>
          <View style={{ gap: 8 }}>
            {j.legs.map((l, i) => (
              <PressableScale key={i} onPress={() => onFitLeg(i)} scaleTo={0.98}>
                {l.kind === 'walk' ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Ionicons name="walk-outline" size={20} color={colors.subtext} style={{ width: 52, textAlign: 'center' }} />
                    <Text style={{ color: colors.subtext, fontSize: 13, flex: 1 }}>
                      Пешком {l.minutes} мин ({formatDistance(l.meters)}) до {l.toLabel ? `«${l.toLabel}»` : `«${name(l.toStopId)}»`}
                    </Text>
                  </View>
                ) : (
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                    <RouteBadge number={l.route.number} type={l.route.type} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.text, fontSize: 13, fontWeight: '700' }}>{name(l.fromStopId)} · {formatTime(l.dep)}</Text>
                      <Text style={{ color: colors.subtext, fontSize: 12 }}>
                        {l.stopsCount} ост. · {l.arr - l.dep} мин · выйти: {name(l.toStopId)} · {formatTime(l.arr)}
                      </Text>
                    </View>
                  </View>
                )}
              </PressableScale>
            ))}
          </View>
        </ScrollView>
        {geom && geom.lines.length === 0 && (
          <Text style={{ color: colors.subtext, fontSize: 11, marginTop: 8 }}>
            У части остановок нет координат, поэтому линию построить нельзя.
          </Text>
        )}
      </GlassCard>
    </FadeSlideIn>
  );
}
