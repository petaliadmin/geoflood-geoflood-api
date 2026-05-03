import {
  AlertDto,
  FloodReportDto,
  FloodZoneDto,
  PredictionDto,
  WeatherDto,
} from '@/common/dtos';

export class SyncSnapshotUserDto {
  id: string;
  email: string;
  role: 'citizen' | 'authority' | 'admin';
  city: string;
}

export class SyncSnapshotAlertsDto {
  items: AlertDto[];
  unreadCount: number;
}

export class SyncSnapshotWeatherDto {
  current: WeatherDto;
  forecast: WeatherDto[];
}

export class SyncSnapshotDto {
  syncedAt: string;
  version: string;
  user: SyncSnapshotUserDto;
  zones: FloodZoneDto[];
  floodedAreas: unknown[];
  alerts: SyncSnapshotAlertsDto;
  predictions: PredictionDto[];
  reports: FloodReportDto[];
  weather: SyncSnapshotWeatherDto;
}
