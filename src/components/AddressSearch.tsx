import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { Text, TextInput } from './Typography';
import { Ionicons } from '@expo/vector-icons';
import { FadeSlideIn, PressableScale } from './Motion';
import { useTheme } from '../theme/ThemeContext';
import { usePlaces } from '../theme/PlacesContext';
import { loadTransitData } from '../data/dataSource';
import { PLACE_META, RoutePlace, pointOf } from '../models/place';
import { GeoResult, searchAddress } from '../services/geocode';
import { TRANSPORT_META } from '../models/transport';

function SectionLabel({ children }: { children: string }) {
  const { colors } = useTheme();
  return <Text style={{ color: colors.subtext, fontSize: 11, fontWeight: '800', textTransform: 'uppercase', marginTop: 10, marginBottom: 2 }}>{children}</Text>;
}

export function AddressSearch({
  placeholder, allowMe = false, showStops = true, showSaved = true, onPick, onClose,
}: {
  placeholder: string; allowMe?: boolean; showStops?: boolean; showSaved?: boolean;
  onPick: (p: RoutePlace) => void; onClose?: () => void;
}) {
  const { colors, palette } = useTheme();
  const { places } = usePlaces();
  const data = useMemo(() => loadTransitData(), []);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<GeoResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const reqId = useRef(0);

  const query = q.trim();
  const stopHits = useMemo(() => {
    if (!showStops || query.length < 2) return [];
    const s = query.toLowerCase().replace(/ё/g, 'е');
    return data.stops.filter((x) => x.name.toLowerCase().replace(/ё/g, 'е').includes(s)).slice(0, 4);
  }, [data, query, showStops]);

  useEffect(() => {
    if (query.length < 3) { setResults([]); setLoading(false); setError(false); return; }
    const id = ++reqId.current;
    setLoading(true); setError(false);
    const t = setTimeout(async () => {
      try {
        const r = await searchAddress(query);
        if (id === reqId.current) { setResults(r); setLoading(false); }
      } catch {
        if (id === reqId.current) { setResults([]); setLoading(false); setError(true); }
      }
    }, 450);
    return () => clearTimeout(t);
  }, [query]);

  const row = (icon: string, title: string, sub: string, onPress: () => void, key: string, color?: string) => (
    <PressableScale key={key} onPress={onPress} scaleTo={0.98}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 12 }}>
        <Ionicons name={icon as any} size={20} color={color ?? palette.accent} style={{ width: 24, textAlign: 'center' }} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.text, fontSize: 15, fontWeight: '600' }} numberOfLines={1}>{title}</Text>
          {!!sub && <Text style={{ color: colors.subtext, fontSize: 12 }} numberOfLines={1}>{sub}</Text>}
        </View>
      </View>
    </PressableScale>
  );

  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Ionicons name="search" size={18} color={colors.subtext} />
        <TextInput
          autoFocus value={q} onChangeText={setQ} placeholder={placeholder} placeholderTextColor={colors.subtext}
          style={{ flex: 1, marginLeft: 8, color: colors.text, fontSize: 16, paddingVertical: 4, outlineStyle: 'none' } as any}
        />
        {onClose && (
          <PressableScale onPress={onClose} hitSlop={8}>
            <Ionicons name="close-circle" size={20} color={colors.subtext} />
          </PressableScale>
        )}
      </View>

      {query.length === 0 && (
        <FadeSlideIn distance={6} duration={220}>
          {allowMe && row('locate', 'Моё местоположение', 'по GPS', () => onPick({ kind: 'me' }), 'me')}
          {showSaved && places.length > 0 && <SectionLabel>Мои места</SectionLabel>}
          {showSaved && places.map((p) => row(PLACE_META[p.type].icon, p.title, p.address, () => onPick(pointOf(p)), p.id))}
          <Text style={{ color: colors.subtext, fontSize: 12, marginTop: 10 }}>
            Введите адрес («Ленина 10»), название магазина, вуза или остановки.
          </Text>
        </FadeSlideIn>
      )}

      {stopHits.length > 0 && <SectionLabel>Остановки</SectionLabel>}
      {stopHits.map((s) =>
        row('bus', s.name, s.types.map((t) => TRANSPORT_META[t].title).join(', '), () => onPick({ kind: 'stop', stop: s }), 's' + s.id))}

      {query.length >= 3 && <SectionLabel>Адреса и места</SectionLabel>}
      {loading && <Text style={{ color: colors.subtext, fontSize: 13, paddingVertical: 8 }}>Ищем…</Text>}
      {error && <Text style={{ color: '#FF453A', fontSize: 13, paddingVertical: 8 }}>Не удалось выполнить поиск. Проверьте интернет.</Text>}
      {!loading && !error && query.length >= 3 && results.length === 0 && (
        <Text style={{ color: colors.subtext, fontSize: 13, paddingVertical: 8 }}>Ничего не найдено. Уточните адрес.</Text>
      )}
      {results.map((r, i) =>
        row('location', r.title, r.subtitle,
          () => onPick({ kind: 'point', title: r.title, subtitle: r.subtitle, latitude: r.latitude, longitude: r.longitude }), 'g' + i, '#FF453A'))}
    </View>
  );
}
