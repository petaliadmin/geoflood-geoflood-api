import { WeatherCondition } from '@/common/dtos';

export interface WeatherSnapshotData {
  city?: string;
  lat?: number;
  lng?: number;
  tempC: number;
  condition: WeatherCondition;
  rainChance: number; // 0-100
  humidity: number; // 0-100
  windKmh: number;
  timestamp: Date;
}

export interface WeatherProviderQuery {
  city?: string;
  lat?: number;
  lng?: number;
}

export interface IWeatherProvider {
  readonly name: string;
  isAvailable(): boolean;

  getCurrent(query: WeatherProviderQuery): Promise<WeatherSnapshotData | null>;

  /**
   * Returns up to `hours` hourly snapshots starting now.
   * For daily-forecast providers, returns one entry per day (subset of hours).
   */
  getForecast(query: WeatherProviderQuery, hours: number): Promise<WeatherSnapshotData[]>;
}

export const WEATHER_PROVIDER = Symbol('WEATHER_PROVIDER');
