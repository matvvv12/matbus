import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Mode, Palette, PALETTES, ThemeKey, paletteFor } from './themes';

const STORAGE_KEY = 'matbus.theme.v1';

type Colors = {
  bg: string;
  text: string;
  subtext: string;
  border: string;
  cardTint: 'dark' | 'light';
};

type ThemeValue = {
  themeKey: ThemeKey;
  palette: Palette;
  mode: Mode;
  scheme: 'dark' | 'light';
  intensity: number;
  blurEnabled: boolean;
  grainEnabled: boolean;
  colors: Colors;
  setThemeKey: (k: ThemeKey) => void;
  setMode: (m: Mode) => void;
  setIntensity: (v: number) => void;
  setBlurEnabled: (v: boolean) => void;
  setGrainEnabled: (v: boolean) => void;
};

const Ctx = createContext<ThemeValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();
  const [themeKey, setThemeKey] = useState<ThemeKey>('purple');
  const [mode, setMode] = useState<Mode>('dark');
  const [intensity, setIntensity] = useState(0.7);
  const [blurEnabled, setBlurEnabled] = useState(true);
  const [grainEnabled, setGrainEnabled] = useState(true);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (!raw) return;
        const s = JSON.parse(raw);
        if (s.themeKey && PALETTES[s.themeKey as ThemeKey]) setThemeKey(s.themeKey);
        if (s.mode) setMode(s.mode);
        if (typeof s.intensity === 'number') setIntensity(s.intensity);
        if (typeof s.blur === 'boolean') setBlurEnabled(s.blur);
        if (typeof s.grain === 'boolean') setGrainEnabled(s.grain);
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  useEffect(() => {
    if (!loaded) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ themeKey, mode, intensity, blur: blurEnabled, grain: grainEnabled })).catch(() => {});
  }, [themeKey, mode, intensity, blurEnabled, grainEnabled, loaded]);

  const value = useMemo<ThemeValue>(() => {
    const scheme: 'dark' | 'light' = mode === 'system' ? (system === 'light' ? 'light' : 'dark') : mode;
    const colors: Colors =
      scheme === 'dark'
        ? { bg: '#08080A', text: '#FFFFFF', subtext: 'rgba(255,255,255,0.56)', border: 'rgba(255,255,255,0.10)', cardTint: 'dark' }
        : { bg: '#ECECEF', text: '#15151A', subtext: 'rgba(21,21,26,0.52)', border: 'rgba(255,255,255,0.95)', cardTint: 'light' };
    return {
      themeKey, palette: paletteFor(themeKey, scheme), mode, scheme, intensity, blurEnabled, grainEnabled, colors,
      setThemeKey, setMode, setIntensity, setBlurEnabled, setGrainEnabled,
    };
  }, [themeKey, mode, intensity, blurEnabled, grainEnabled, system]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTheme(): ThemeValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useTheme must be used inside ThemeProvider');
  return v;
}
