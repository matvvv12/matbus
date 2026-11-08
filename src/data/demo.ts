// ДЕМОНСТРАЦИОННЫЕ ДАННЫЕ. Не являются реальными остановками и расписанием Витебска.
// Реальные данные подключаются через импорт (шаг 3) и не смешиваются с этим файлом.
import { TransportType } from '../models/transport';

export const DEMO_STOPS = [
  { id: 'demo-a', name: 'ДЕМО-остановка А', address: 'Тестовый адрес 1', latitude: 55.1904, longitude: 30.2049 },
  { id: 'demo-b', name: 'ДЕМО-остановка Б', address: 'Тестовый адрес 2', latitude: 55.194, longitude: 30.212 },
  { id: 'demo-c', name: 'ДЕМО-остановка В', address: 'Тестовый адрес 3', latitude: 55.1985, longitude: 30.219 },
  { id: 'demo-d', name: 'ДЕМО-остановка Г', address: 'Тестовый адрес 4', latitude: 55.203, longitude: 30.226 },
  { id: 'demo-e', name: 'ДЕМО-остановка Д', address: 'Тестовый адрес 5', latitude: 55.207, longitude: 30.233 },
  { id: 'demo-f', name: 'ДЕМО-остановка Е', address: 'Тестовый адрес 6', latitude: 55.185, longitude: 30.215 },
  { id: 'demo-g', name: 'ДЕМО-остановка Ж', address: 'Тестовый адрес 7', latitude: 55.18, longitude: 30.223 },
  { id: 'demo-h', name: 'ДЕМО-остановка З', address: 'Тестовый адрес 8', latitude: 55.186, longitude: 30.195 },
];

export const DEMO_ROUTES: {
  id: string; number: string; type: TransportType; stopIds: string[];
  firstMin: number; lastMin: number; intervalMin: number;
}[] = [
  { id: 'demo-r1', number: 'Д1', type: 'bus', stopIds: ['demo-a', 'demo-b', 'demo-c', 'demo-d', 'demo-e'],
    firstMin: 6 * 60, lastMin: 22 * 60 + 30, intervalMin: 12 },
  { id: 'demo-r2', number: 'Д2', type: 'trolleybus', stopIds: ['demo-b', 'demo-f', 'demo-g', 'demo-d'],
    firstMin: 5 * 60 + 40, lastMin: 23 * 60, intervalMin: 9 },
  { id: 'demo-r3', number: 'Д3', type: 'tram', stopIds: ['demo-a', 'demo-h', 'demo-c', 'demo-g'],
    firstMin: 6 * 60 + 10, lastMin: 22 * 60, intervalMin: 15 },
];
