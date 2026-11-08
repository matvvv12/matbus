import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, View, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useFonts, Manrope_400Regular, Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold, Manrope_800ExtraBold } from '@expo-google-fonts/manrope';
import { ThemeProvider, useTheme } from './src/theme/ThemeContext';
import { FavoritesProvider } from './src/theme/FavoritesContext';
import { PlacesProvider } from './src/theme/PlacesContext';
import { PlaceType, RoutePlace } from './src/models/place';
import type { JourneyView } from './src/services/router';
import { Background } from './src/components/Glass';
import { TabBar, TabKey } from './src/components/TabBar';
import MapScreen, { PickRequest } from './src/screens/MapScreen';
import { initTelegram } from './src/telegram';
import SettingsScreen from './src/screens/SettingsScreen';
import RoutesScreen from './src/screens/RoutesScreen';
import TransportScreen from './src/screens/TransportScreen';
import FavoritesScreen from './src/screens/FavoritesScreen';

// В браузере анимации работают без нативного драйвера; это не ошибка, поэтому убираем лишнее предупреждение
if (Platform.OS === 'web') {
  const origWarn = console.warn;
  console.warn = (...args: any[]) => {
    if (typeof args[0] === 'string' && args[0].includes('useNativeDriver')) return;
    origWarn(...args);
  };
}

function Root() {
  const { colors, scheme } = useTheme();
  const [tab, setTab] = useState<TabKey>('map');
  const anim = useRef(new Animated.Value(1)).current;
  const [pendingStop, setPendingStop] = useState<{ id: string; nonce: number } | null>(null);
  const [pendingRoute, setPendingRoute] = useState<{ id: string; nonce: number } | null>(null);
  const [plan, setPlan] = useState<{ from?: RoutePlace; to?: RoutePlace; nonce: number } | null>(null);
  const [pick, setPick] = useState<PickRequest | null>(null);
  const [journeyView, setJourneyView] = useState<JourneyView | null>(null);

  const select = (k: TabKey) => {
    if (k === tab) return;
    setTab(k);
    anim.setValue(0);
    Animated.timing(anim, { toValue: 1, duration: 340, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  };

  const openStop = (id: string) => { setPendingStop({ id, nonce: Date.now() }); select('map'); };
  const openRoute = (id: string) => { setPendingRoute({ id, nonce: Date.now() }); select('transport'); };

  const planRoute = (from?: RoutePlace, to?: RoutePlace) => { setPlan({ from, to, nonce: Date.now() }); select('routes'); };
  const pickOnMap = (type: PlaceType, title?: string, id?: string) => { setPick({ type, title, id, nonce: Date.now() }); select('map'); };
  const pickDone = () => { setPick(null); select('favorites'); };
  const showJourney = (jv: JourneyView) => { setJourneyView(jv); select('map'); };
  const closeJourney = () => { setJourneyView(null); select('routes'); };

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Background />
      <Animated.View
        style={{
          flex: 1,
          opacity: anim,
          transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }],
        }}
      >
        {/* Карта остаётся смонтированной, чтобы не перезагружаться при переключении вкладок */}
        <View style={{ flex: 1, display: tab === 'map' ? 'flex' : 'none' }}>
          <MapScreen pendingStop={pendingStop} pick={pick} onPlan={planRoute} onPickDone={pickDone} journey={journeyView} onCloseJourney={closeJourney} />
        </View>
        {tab === 'routes' && <RoutesScreen plan={plan} onShowJourney={showJourney} />}
        {tab === 'transport' && <TransportScreen onOpenStop={openStop} pendingRoute={pendingRoute} />}
        {tab === 'favorites' && <FavoritesScreen onOpenStop={openStop} onOpenRoute={openRoute} onPlan={planRoute} onPickOnMap={pickOnMap} />}
        {tab === 'settings' && <SettingsScreen />}
      </Animated.View>
      <TabBar selected={tab} onSelect={select} />
    </View>
  );
}

export default function App() {
  useEffect(() => { initTelegram(); }, []);
  const [fontsLoaded] = useFonts({ Manrope_400Regular, Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold, Manrope_800ExtraBold });
  if (!fontsLoaded) return <View style={{ flex: 1, backgroundColor: '#08080A' }} />;
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <FavoritesProvider>
          <PlacesProvider>
            <Root />
          </PlacesProvider>
        </FavoritesProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
