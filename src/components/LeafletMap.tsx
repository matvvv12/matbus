import React from 'react';
import { Stop } from '../models/stop';
import { LatLng } from '../services/geo';
import { EmptyState } from './Glass';

export type MapProps = {
  stops: Stop[];
  selectedId: string | null;
  selectedPlatform: number | null;
  user: LatLng | null;
  userAccuracy?: number | null;
  userHeading?: number | null;
  followUser?: boolean;
  onMapInteraction?: () => void;
  focus: (LatLng & { nonce: number }) | null;
  dark: boolean;
  accent: string;
  pin: { latitude: number; longitude: number } | null;
  route: import('../services/journeyGeometry').RouteGeometry | null;
  fit: { bounds: [[number, number], [number, number]]; nonce: number } | null;
  onTap: (lat: number, lng: number) => void;
  onSelect: (id: string, platform: number) => void;
};

// Нативная карта (react-native-maps) будет подключена отдельным шагом при сборке под iOS.
export default function LeafletMap(_: MapProps) {
  return <EmptyState icon="map" title="Карта" message="Нативная карта будет подключена при сборке под iPhone. Сейчас используйте веб-версию." />;
}
