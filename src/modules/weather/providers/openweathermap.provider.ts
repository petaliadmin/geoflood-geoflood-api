import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { WeatherCondition } from '@/common/dtos';
import { IWeatherProvider, WeatherProviderQuery, WeatherSnapshotData } from '../weather.provider';

interface OWMCurrentResponse {
  coord: { lon: number; lat: number };
  weather: Array<{ id: number; main: string; description: string }>;
  main: { temp: number; humidity: number };
  wind: { speed: number };
  rain?: { '1h'?: number; '3h'?: number };
  name: string;
  dt: number;
}

interface OWMForecastResponse {
  list: Array<{
    dt: number;
    main: { temp: number; humidity: number };
    weather: Array<{ id: number; main: string }>;
    wind: { speed: number };
    pop?: number;
    rain?: { '3h'?: number };
  }>;
  city: { name: string; coord: { lat: number; lon: number } };
}

@Injectable()
export class OpenWeatherMapProvider implements IWeatherProvider {
  readonly name = 'openweathermap';
  private readonly logger = new Logger(OpenWeatherMapProvider.name);
  private readonly baseUrl = 'https://api.openweathermap.org/data/2.5';
  private readonly apiKey?: string;

  constructor(
    private readonly config: ConfigService,
    private readonly http: HttpService,
  ) {
    this.apiKey = this.config.get<string>('OPENWEATHER_API_KEY');
  }

  isAvailable(): boolean {
    return !!this.apiKey;
  }

  async getCurrent(query: WeatherProviderQuery): Promise<WeatherSnapshotData | null> {
    if (!this.isAvailable()) return null;

    try {
      const params = this.buildParams(query);
      const url = `${this.baseUrl}/weather`;
      const { data } = await firstValueFrom(
        this.http.get<OWMCurrentResponse>(url, { params, timeout: 5000 }),
      );

      return {
        city: data.name,
        lat: data.coord.lat,
        lng: data.coord.lon,
        tempC: data.main.temp,
        condition: this.mapCondition(data.weather[0]?.id, data.weather[0]?.main),
        rainChance: this.estimateRainChance(data.rain),
        humidity: data.main.humidity,
        windKmh: data.wind.speed * 3.6,
        timestamp: new Date(data.dt * 1000),
      };
    } catch (err: any) {
      this.logger.warn(`OWM current failed: ${err.message}`);
      return null;
    }
  }

  async getForecast(query: WeatherProviderQuery, hours: number): Promise<WeatherSnapshotData[]> {
    if (!this.isAvailable()) return [];

    try {
      const params = this.buildParams(query);
      const url = `${this.baseUrl}/forecast`; // 3-hour step, 5 days
      const { data } = await firstValueFrom(
        this.http.get<OWMForecastResponse>(url, { params, timeout: 5000 }),
      );

      const cutoff = Date.now() + hours * 3600 * 1000;
      return data.list
        .filter(item => item.dt * 1000 <= cutoff)
        .map(item => ({
          city: data.city.name,
          lat: data.city.coord.lat,
          lng: data.city.coord.lon,
          tempC: item.main.temp,
          condition: this.mapCondition(item.weather[0]?.id, item.weather[0]?.main),
          rainChance: Math.round((item.pop ?? 0) * 100),
          humidity: item.main.humidity,
          windKmh: item.wind.speed * 3.6,
          timestamp: new Date(item.dt * 1000),
        }));
    } catch (err: any) {
      this.logger.warn(`OWM forecast failed: ${err.message}`);
      return [];
    }
  }

  private buildParams(query: WeatherProviderQuery): Record<string, string> {
    const base: Record<string, string> = {
      appid: this.apiKey!,
      units: 'metric',
    };
    if (query.lat != null && query.lng != null) {
      base.lat = String(query.lat);
      base.lon = String(query.lng);
    } else if (query.city) {
      base.q = query.city;
    } else {
      base.q = 'Dakar';
    }
    return base;
  }

  /**
   * OWM weather codes: https://openweathermap.org/weather-conditions
   * Mapping to local WeatherCondition enum.
   */
  private mapCondition(code?: number, main?: string): WeatherCondition {
    if (!code) {
      switch ((main || '').toLowerCase()) {
        case 'rain':
        case 'drizzle':
          return WeatherCondition.RAIN;
        case 'thunderstorm':
          return WeatherCondition.STORM;
        case 'clear':
          return WeatherCondition.SUNNY;
        case 'clouds':
          return WeatherCondition.CLOUDY;
        default:
          return WeatherCondition.CLOUDY;
      }
    }
    if (code >= 200 && code < 300) return WeatherCondition.STORM;
    if (code >= 300 && code < 500) return WeatherCondition.RAIN; // drizzle
    if (code >= 500 && code < 600) {
      // 502+ heavy rain
      return code >= 502 ? WeatherCondition.HEAVY_RAIN : WeatherCondition.RAIN;
    }
    if (code >= 600 && code < 700) return WeatherCondition.RAIN; // snow → mapped to rain (no snow enum)
    if (code === 800) return WeatherCondition.SUNNY;
    if (code > 800) return WeatherCondition.CLOUDY;
    return WeatherCondition.CLOUDY;
  }

  private estimateRainChance(rain?: { '1h'?: number; '3h'?: number }): number {
    const mm = rain?.['1h'] ?? rain?.['3h'] ?? 0;
    if (mm <= 0) return 0;
    if (mm < 0.5) return 30;
    if (mm < 2.5) return 60;
    return 90;
  }
}
