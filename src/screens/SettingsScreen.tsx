import React, { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Text } from '../components/Typography';
import { useInsets } from '../hooks/useInsets';
import { Ionicons } from '@expo/vector-icons';
import { GlassCard, GradientBadge } from '../components/Glass';
import { FadeSlideIn, PressableScale } from '../components/Motion';
import { useTheme } from '../theme/ThemeContext';
import { MODES } from '../theme/themes';
import { VITEBSK } from '../models/city';
import { DAY_LABEL } from '../models/stop';
import { loadTransitData } from '../data/dataSource';
import AppearanceScreen from './AppearanceScreen';

function Row({ icon, title, subtitle, onPress }: { icon: string; title: string; subtitle: string; onPress?: () => void }) {
  const { colors } = useTheme();
  return (
    <PressableScale onPress={onPress} disabled={!onPress} scaleTo={0.97}>
      <GlassCard padding={14}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <GradientBadge icon={icon} />
          <View style={{ marginLeft: 14, flex: 1 }}>
            <Text style={{ color: colors.text, fontSize: 17, fontWeight: '600' }}>{title}</Text>
            <Text style={{ color: colors.subtext, fontSize: 14, marginTop: 2 }}>{subtitle}</Text>
          </View>
          {onPress && <Ionicons name="chevron-forward" size={18} color={colors.subtext} />}
        </View>
      </GlassCard>
    </PressableScale>
  );
}

export default function SettingsScreen() {
  const insets = useInsets();
  const { colors, palette, mode } = useTheme();
  const [page, setPage] = useState<'main' | 'appearance'>('main');
  const data = useMemo(() => loadTransitData(), []);

  if (page === 'appearance') {
    return (
      <FadeSlideIn axis="x" distance={50} duration={320} style={{ flex: 1 }}>
        <AppearanceScreen onBack={() => setPage('main')} />
      </FadeSlideIn>
    );
  }

  const modeTitle = MODES.find((m) => m.key === mode)?.title ?? '';
  const dataText = data.isDemo
    ? 'ДЕМО-данные (реальные не загружены)'
    : `${data.stops.length} остановок · ${data.routes.length} маршрутов · ${data.daysLoaded.map((d) => DAY_LABEL[d]).join(', ')}`;

  return (
    <ScrollView
      contentContainerStyle={{ paddingTop: insets.top + 16, paddingHorizontal: 16, paddingBottom: 150, gap: 14 }}
    >
      <FadeSlideIn>
        <Text style={{ color: colors.text, fontSize: 34, fontWeight: '800' }}>Настройки</Text>
      </FadeSlideIn>
      <FadeSlideIn delay={80}>
        <Row icon="color-palette" title="Внешний вид" subtitle={`${palette.title} · ${modeTitle}`} onPress={() => setPage('appearance')} />
      </FadeSlideIn>
      <FadeSlideIn delay={160}>
        <Row icon="business" title="Город" subtitle={VITEBSK.name} />
      </FadeSlideIn>
      <FadeSlideIn delay={240}>
        <Row icon="server" title="Данные" subtitle={dataText} />
      </FadeSlideIn>
      <FadeSlideIn delay={320}>
        <Row icon="information-circle" title="Версия MatBus" subtitle="0.6 (новый дизайн)" />
      </FadeSlideIn>
    </ScrollView>
  );
}
