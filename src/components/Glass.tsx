import React from 'react';
import { Animated, Easing, Platform, StyleSheet, View, ViewStyle, StyleProp } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Text } from './Typography';
import { useTheme } from '../theme/ThemeContext';
import { withAlpha } from '../theme/themes';
import { FadeSlideIn, PopIn, PressableScale } from './Motion';

const fill = (r: number): ViewStyle => ({ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: r });

function useBreathing(duration: number, from: number, to: number) {
  const v = React.useRef(new Animated.Value(from)).current;
  React.useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: to, duration, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(v, { toValue: from, duration, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);
  return v;
}

/** Тонкая зернистость (как на референсе): убирает «лесенку» (бандинг) на тёмных градиентах. Только веб. */
let noiseUri: string | null = null;
function getNoise(): string | null {
  if (Platform.OS !== 'web') return null;
  if (noiseUri) return noiseUri;
  try {
    const doc = (globalThis as any).document;
    const c = doc.createElement('canvas');
    c.width = 128; c.height = 128;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(128, 128);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.random() * 255;
      img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v; img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    noiseUri = c.toDataURL('image/png');
  } catch {
    noiseUri = null;
  }
  return noiseUri;
}

/** Фон: почти чёрный графит (или мягкий светлый серый) + едва заметное свечение акцента и «луч» света сверху */
export function Background() {
  const { palette, intensity, scheme, grainEnabled } = useTheme();
  const dark = scheme === 'dark';
  const a = useBreathing(6500, 0.6, 1);
  const b = useBreathing(8200, 1, 0.55);
  const noise = React.useMemo(() => getNoise(), []);
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <LinearGradient colors={dark ? ['#0D0D11', '#060608'] : ['#F5F5F7', '#E5E5E9']} style={StyleSheet.absoluteFill} />
      <Animated.View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 360, opacity: a }}>
        <LinearGradient colors={[withAlpha(palette.accent, (dark ? 0.2 : 0.13) * intensity), 'transparent']} style={{ flex: 1 }} />
      </Animated.View>
      {dark && (
        <Animated.View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 420, opacity: b }}>
          <LinearGradient colors={['rgba(255,255,255,0.05)', 'rgba(255,255,255,0)']} style={{ flex: 1 }} />
        </Animated.View>
      )}
      <Animated.View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 300, opacity: b }}>
        <LinearGradient colors={['transparent', withAlpha(palette.accent, (dark ? 0.12 : 0.08) * intensity)]} style={{ flex: 1 }} />
      </Animated.View>
      {noise && grainEnabled && (
        <View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { opacity: dark ? 0.02 : 0.012, backgroundImage: `url(${noise})`, backgroundSize: '128px 128px' } as any]}
        />
      )}
    </View>
  );
}

type GlassProps = {
  children?: React.ReactNode;
  radius?: number;
  tinted?: boolean;
  style?: StyleProp<ViewStyle>;
  padding?: number;
};

/**
 * Основа стекла. Тень лежит на внешней обёртке, все слои (размытие, градиенты, кромка) обрезаются по скруглению
 * во внутренней — без «квадратов» по углам в браузере.
 */
function GlassBase({
  radius, shadowColor, shadowOpacity, shadowRadius, shadowY, borderColor, blur, layers, style, contentStyle, stretch, children,
}: {
  radius: number; shadowColor: string; shadowOpacity: number; shadowRadius: number; shadowY: number;
  borderColor: string; blur: number; layers: React.ReactNode; style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>; stretch?: boolean; children?: React.ReactNode;
}) {
  const { colors, scheme, blurEnabled } = useTheme();
  const dark = scheme === 'dark';
  const clip: any = Platform.OS === 'web' ? { clipPath: `inset(0px round ${radius}px)` } : null;
  return (
    <View style={[{ borderRadius: radius, shadowColor, shadowOpacity, shadowRadius, shadowOffset: { width: 0, height: shadowY } }, style]}>
      <View style={[{ borderRadius: radius, overflow: 'hidden', borderWidth: 1, borderColor }, stretch ? { flex: 1 } : null, clip]}>
        {blurEnabled ? (
          <BlurView intensity={blur} tint={colors.cardTint} style={fill(radius)} />
        ) : (
          <View style={[fill(radius), { backgroundColor: dark ? 'rgba(22,22,28,0.88)' : 'rgba(255,255,255,0.9)' }]} />
        )}
        <View style={[fill(radius), { backgroundColor: dark ? 'rgba(255,255,255,0.045)' : 'rgba(255,255,255,0.5)' }]} />
        {layers}
        {/* тонкий блик по верхней кромке */}
        <LinearGradient
          colors={['rgba(255,255,255,0)', dark ? 'rgba(255,255,255,0.40)' : 'rgba(255,255,255,1)', 'rgba(255,255,255,0)']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
          style={{ position: 'absolute', top: 0, left: radius * 0.5, right: radius * 0.5, height: 1 }}
        />
        <View style={[stretch ? { flex: 1 } : null, contentStyle]}>{children}</View>
      </View>
    </View>
  );
}

export function GlassCard({ children, radius = 28, tinted = false, style, padding = 0 }: GlassProps) {
  const { palette, intensity, scheme } = useTheme();
  const dark = scheme === 'dark';
  return (
    <GlassBase
      radius={radius}
      shadowColor={dark ? '#000' : '#7A7A90'} shadowOpacity={dark ? 0.45 : 0.2} shadowRadius={dark ? 24 : 22} shadowY={dark ? 12 : 10}
      borderColor={tinted ? withAlpha(palette.accent, 0.32) : dark ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.95)'}
      blur={55} style={style} contentStyle={{ padding }}
      layers={
        <>
          <LinearGradient
            colors={[dark ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.6)', 'rgba(255,255,255,0)']}
            start={{ x: 0, y: 0 }} end={{ x: 0.8, y: 0.9 }} style={fill(radius)}
          />
          {tinted && (
            <LinearGradient
              colors={[withAlpha(palette.accent, 0.04 + 0.2 * intensity), 'rgba(0,0,0,0)']}
              start={{ x: 0, y: 1 }} end={{ x: 0.9, y: 0.1 }} style={fill(radius)}
            />
          )}
        </>
      }
    >
      {children}
    </GlassBase>
  );
}

/**
 * Активный элемент (как выбранный пункт в референсе): тёмное стекло, тонкий контур цвета темы,
 * мягкое свечение одного цвета. Без многоцветных градиентов.
 */
export function LiquidGlass({
  children, radius = 20, tint = 0.5, colors: cols, style, contentStyle, blur = 40, stretch,
}: {
  children?: React.ReactNode; radius?: number; tint?: number; colors?: [string, string];
  style?: StyleProp<ViewStyle>; contentStyle?: StyleProp<ViewStyle>; blur?: number; stretch?: boolean;
}) {
  const { palette, scheme } = useTheme();
  const c1 = cols?.[0] ?? palette.accent;
  const dark = scheme === 'dark';
  return (
    <GlassBase
      radius={radius} shadowColor={c1} shadowOpacity={0.15 + 0.5 * tint} shadowRadius={10 + 12 * tint} shadowY={2}
      borderColor={withAlpha(c1, Math.min(0.95, 0.3 + 0.7 * tint))} blur={blur}
      style={style} contentStyle={contentStyle} stretch={stretch}
      layers={
        <>
          <View style={[fill(radius), { backgroundColor: withAlpha(c1, 0.05 + 0.35 * tint * tint) }]} />
          <LinearGradient
            colors={[withAlpha(c1, 0.55 * tint), withAlpha(c1, 0)]}
            start={{ x: 0, y: 1 }} end={{ x: 0.85, y: 0.05 }} style={fill(radius)}
          />
          <LinearGradient
            colors={['rgba(255,255,255,0.28)', 'rgba(255,255,255,0.04)', 'rgba(255,255,255,0)']}
            locations={[0, 0.4, 0.8]} start={{ x: 0, y: 0 }} end={{ x: 0.7, y: 1 }} style={fill(radius)}
          />
        </>
      }
    >
      {children}
    </GlassBase>
  );
}

/** Иконка в стеклянной плитке (спокойная, без заливки) */
export function GradientBadge({ icon, size = 40 }: { icon: string; size?: number }) {
  const { colors, scheme, palette } = useTheme();
  return (
    <LiquidGlass radius={size * 0.36} tint={0.22} style={{ width: size, height: size }}
      contentStyle={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name={(icon + '-outline') as any} size={size * 0.5} color={scheme === 'dark' ? '#FFFFFF' : palette.accent === colors.text ? colors.text : colors.text} />
    </LiquidGlass>
  );
}

export function GlassButton({
  label, onPress, disabled, icon,
}: { label: string; onPress?: () => void; disabled?: boolean; icon?: string }) {
  const { colors } = useTheme();
  return (
    <PressableScale onPress={onPress} disabled={disabled} scaleTo={0.97}>
      <LiquidGlass radius={26} tint={disabled ? 0.06 : 0.6} blur={50}
        contentStyle={{ paddingVertical: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        {icon && <Ionicons name={(icon + '-outline') as any} size={18} color={disabled ? colors.subtext : colors.text} />}
        <Text style={{ color: disabled ? colors.subtext : colors.text, fontWeight: '700', fontSize: 16 }}>{label}</Text>
      </LiquidGlass>
    </PressableScale>
  );
}

export function EmptyState({ icon, title, message }: { icon: string; title: string; message: string }) {
  const { colors, palette } = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 }}>
      <PopIn>
        <GlassCard radius={34} tinted padding={26}>
          <Ionicons name={(icon + '-outline') as any} size={44} color={palette.accent} />
        </GlassCard>
      </PopIn>
      <FadeSlideIn delay={120} style={{ alignItems: 'center' }}>
        <Text style={{ color: colors.text, fontSize: 22, fontWeight: '700', marginTop: 16 }}>{title}</Text>
        <Text style={{ color: colors.subtext, fontSize: 15, textAlign: 'center', marginTop: 6 }}>{message}</Text>
      </FadeSlideIn>
    </View>
  );
}
