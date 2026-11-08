import React from 'react';
import { ScrollView, View } from 'react-native';
import { Text } from '../components/Typography';
import { useInsets } from '../hooks/useInsets';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { GlassButton, GlassCard, GradientBadge, LiquidGlass } from '../components/Glass';
import { FadeSlideIn, PopIn, PressableScale } from '../components/Motion';
import { useTheme } from '../theme/ThemeContext';
import { INTENSITY_LEVELS, MODES, PALETTES, THEME_KEYS, withAlpha } from '../theme/themes';

function SectionTitle({ children }: { children: string }) {
  const { colors } = useTheme();
  return (
    <Text style={{ color: colors.subtext, fontSize: 13, fontWeight: '700', textTransform: 'uppercase', marginBottom: 10 }}>
      {children}
    </Text>
  );
}

function Segmented<T extends string | number>({
  items, value, onChange,
}: { items: { key: T; title: string }[]; value: T; onChange: (k: T) => void }) {
  const { palette, colors, scheme } = useTheme();
  return (
    <GlassCard radius={24} padding={4}>
      <View style={{ flexDirection: 'row' }}>
        {items.map((it) => {
          const active = it.key === value;
          return (
            <PressableScale key={String(it.key)} onPress={() => onChange(it.key)} style={{ flex: 1 }} scaleTo={0.94}>
              {active ? (
                <LiquidGlass radius={20} tint={0.55} contentStyle={{ paddingVertical: 10, alignItems: 'center' }}>
                  <Text style={{ fontWeight: '800', fontSize: 14, color: scheme === 'dark' ? '#fff' : colors.text }}>{it.title}</Text>
                </LiquidGlass>
              ) : (
                <View style={{ paddingVertical: 10, alignItems: 'center', borderRadius: 12 }}>
                  <Text style={{ fontWeight: '600', fontSize: 14, color: colors.subtext }}>{it.title}</Text>
                </View>
              )}
            </PressableScale>
          );
        })}
      </View>
    </GlassCard>
  );
}

export default function AppearanceScreen({ onBack }: { onBack: () => void }) {
  const insets = useInsets();
  const { colors, palette, scheme, themeKey, setThemeKey, mode, setMode, intensity, setIntensity, blurEnabled, setBlurEnabled, grainEnabled, setGrainEnabled } = useTheme();

  return (
    <ScrollView
      contentContainerStyle={{ paddingTop: insets.top + 8, paddingHorizontal: 16, paddingBottom: 150, gap: 22 }}
    >
      <PressableScale onPress={onBack} style={{ alignSelf: 'flex-start' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6 }}>
          <Ionicons name="chevron-back" size={22} color={palette.accent} />
          <Text style={{ color: palette.accent, fontSize: 17 }}>Настройки</Text>
        </View>
      </PressableScale>
      <Text style={{ color: colors.text, fontSize: 34, fontWeight: '800', marginTop: -10 }}>Внешний вид</Text>

      <GlassCard radius={28} tinted padding={16}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <GradientBadge icon="bus" size={44} />
          <View style={{ marginLeft: 12, flex: 1 }}>
            <Text style={{ color: colors.text, fontSize: 17, fontWeight: '700' }}>Предпросмотр</Text>
            <Text style={{ color: colors.subtext, fontSize: 13 }}>Так выглядит выбранная тема</Text>
          </View>
        </View>
        <View style={{ height: 6, borderRadius: 3, backgroundColor: withAlpha(palette.accent, 0.25), marginTop: 14 }}>
          <View style={{ width: '62%', height: 6, borderRadius: 3, backgroundColor: palette.accent }} />
        </View>
        <View style={{ marginTop: 14 }}>
          <GlassButton label="Акцентная кнопка" icon="sparkles" />
        </View>
      </GlassCard>

      <View>
        <SectionTitle>Цветовая тема</SectionTitle>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12 }}>
          {THEME_KEYS.map((k) => {
            const p = PALETTES[k];
            const selected = k === themeKey;
            return (
              <PressableScale key={k} onPress={() => setThemeKey(k)} style={{ width: '31%' }} scaleTo={0.92}>
                <GlassCard radius={20} padding={12} style={selected ? { borderColor: p.accent, borderWidth: 2 } : undefined}>
                  <View style={{ alignItems: 'center' }}>
                    <LiquidGlass radius={24} tint={0.85} colors={[p.accent, p.secondary]} blur={30}
                      style={{ width: 48, height: 48 }}
                      contentStyle={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}>
                      {selected && (
                        <PopIn>
                          <Ionicons name="checkmark" size={22} color="#FFFFFF" />
                        </PopIn>
                      )}
                    </LiquidGlass>
                    <Text style={{ color: colors.text, fontSize: 12, marginTop: 8 }}>{p.title}</Text>
                  </View>
                </GlassCard>
              </PressableScale>
            );
          })}
        </View>
      </View>

      <View>
        <SectionTitle>Режим</SectionTitle>
        <Segmented items={MODES} value={mode} onChange={setMode} />
      </View>

      <View>
        <SectionTitle>Размытие стекла</SectionTitle>
        <Segmented
          items={[{ key: 'on', title: 'Включено' }, { key: 'off', title: 'Выключено' }]}
          value={blurEnabled ? 'on' : 'off'}
          onChange={(k) => setBlurEnabled(k === 'on')}
        />
        <Text style={{ color: colors.subtext, fontSize: 12, marginTop: 6 }}>
          Если по краям плашек видны артефакты, выключите размытие.
        </Text>
      </View>

      <View>
        <SectionTitle>Зернистость фона</SectionTitle>
        <Segmented
          items={[{ key: 'on', title: 'Включена' }, { key: 'off', title: 'Выключена' }]}
          value={grainEnabled ? 'on' : 'off'}
          onChange={(k) => setGrainEnabled(k === 'on')}
        />
        <Text style={{ color: colors.subtext, fontSize: 12, marginTop: 6 }}>
          Тонкий шум скрывает ступеньки на градиентах. Если рябит, выключите.
        </Text>
      </View>

      <View>
        <SectionTitle>Интенсивность градиентов</SectionTitle>
        <Segmented
          items={INTENSITY_LEVELS.map((l) => ({ key: l.value, title: l.title }))}
          value={INTENSITY_LEVELS.reduce((a, b) => (Math.abs(b.value - intensity) < Math.abs(a.value - intensity) ? b : a)).value}
          onChange={setIntensity}
        />
      </View>
    </ScrollView>
  );
}
