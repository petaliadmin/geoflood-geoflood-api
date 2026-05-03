import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RedisService } from '@/common/redis/redis.service';
import { WeatherSnapshotEntity } from '../zones/entities/zone.entity';
import { WeatherDto, WeatherCondition } from '@/common/dtos';
import { LocalDbWeatherProvider } from './providers/local-db.provider';
import { OpenWeatherMapProvider } from './providers/openweathermap.provider';
import {
  IWeatherProvider,
  WeatherProviderQuery,
  WeatherSnapshotData,
} from './weather.provider';

const RAINY_CONDITIONS: WeatherCondition[] = [
  WeatherCondition.RAIN,
  WeatherCondition.HEAVY_RAIN,
  WeatherCondition.STORM,
];

@Injectable()
export class WeatherService {
  private readonly CACHE_TTL = 300; // 5 minutes
  private readonly logger = new Logger(WeatherService.name);
  private readonly providers: IWeatherProvider[];

  constructor(
    @InjectRepository(WeatherSnapshotEntity)
    private weatherRepository: Repository<WeatherSnapshotEntity>,
    private redisService: RedisService,
    private config: ConfigService,
    private localProvider: LocalDbWeatherProvider,
    @Optional() private owmProvider?: OpenWeatherMapProvider,
  ) {
    const preferred = (this.config.get<string>('WEATHER_PROVIDER') || 'local').toLowerCase();
    const ordered: IWeatherProvider[] = [];

    if (preferred === 'openweathermap' && this.owmProvider?.isAvailable()) {
      ordered.push(this.owmProvider);
    }
    ordered.push(this.localProvider);

    this.providers = ordered;
    this.logger.log(`Weather providers (priority): ${ordered.map(p => p.name).join(' -> ')}`);
  }

  // -------- Public API (existing surface kept compatible) --------

  async getWeather(city: string = 'Dakar'): Promise<WeatherDto> {
    const cacheKey = `weather:${city}`;
    const cached = await this.redisService.getJson<WeatherDto>(cacheKey);
    if (cached) return cached;

    const snapshot = await this.fetchCurrent({ city });
    const result = snapshot ? this.toDto(snapshot, city) : this.mockWeather(city);

    await this.redisService.setJson(cacheKey, this.CACHE_TTL, result);
    return result;
  }

  async getForecast(city: string = 'Dakar', days: number = 5): Promise<WeatherDto[]> {
    const cacheKey = `forecast:${city}:${days}`;
    const cached = await this.redisService.getJson<WeatherDto[]>(cacheKey);
    if (cached) return cached;

    const snapshots = await this.fetchForecast({ city }, days * 24);
    const result = snapshots.map(s => this.toDto(s, city));

    await this.redisService.setJson(cacheKey, this.CACHE_TTL, result);
    return result;
  }

  async saveWeatherSnapshot(data: {
    city: string;
    tempC: number;
    condition: string;
    rainChance: number;
    humidity: number;
    windKmh: number;
    forecastDate?: Date;
  }) {
    const snapshot = this.weatherRepository.create({
      city: data.city,
      tempC: data.tempC,
      condition: data.condition as WeatherSnapshotEntity['condition'],
      rainChance: data.rainChance,
      humidity: data.humidity,
      windKmh: data.windKmh,
      forecastDate: data.forecastDate,
    });

    const saved = await this.weatherRepository.save(snapshot);
    await this.redisService.del(`weather:${data.city}`);
    await this.redisService.del(`forecast:${data.city}`);
    return saved;
  }

  // -------- Helpers used by routing/risk evaluation --------

  /**
   * Returns true if rain (or stronger) is observed now or forecast within `hours`
   * for the given coordinates or city.
   */
  async isRainExpected(
    query: WeatherProviderQuery,
    hours: number = 6,
  ): Promise<{ rainExpected: boolean; current?: WeatherSnapshotData; peakChance: number }> {
    const current = await this.fetchCurrent(query);
    const forecast = await this.fetchForecast(query, hours);

    let peakChance = 0;
    let rainExpected = false;

    if (current) {
      if (RAINY_CONDITIONS.includes(current.condition)) rainExpected = true;
      peakChance = Math.max(peakChance, current.rainChance);
    }
    for (const snap of forecast) {
      if (RAINY_CONDITIONS.includes(snap.condition)) rainExpected = true;
      peakChance = Math.max(peakChance, snap.rainChance);
    }
    if (peakChance >= 60) rainExpected = true;

    return { rainExpected, current: current || undefined, peakChance };
  }

  // -------- Provider chain --------

  private async fetchCurrent(query: WeatherProviderQuery): Promise<WeatherSnapshotData | null> {
    for (const provider of this.providers) {
      try {
        const result = await provider.getCurrent(query);
        if (result) return result;
      } catch (err: any) {
        this.logger.warn(`Provider ${provider.name} getCurrent failed: ${err.message}`);
      }
    }
    return null;
  }

  private async fetchForecast(
    query: WeatherProviderQuery,
    hours: number,
  ): Promise<WeatherSnapshotData[]> {
    for (const provider of this.providers) {
      try {
        const result = await provider.getForecast(query, hours);
        if (result.length > 0) return result;
      } catch (err: any) {
        this.logger.warn(`Provider ${provider.name} getForecast failed: ${err.message}`);
      }
    }
    return [];
  }

  private toDto(s: WeatherSnapshotData, fallbackCity: string): WeatherDto {
    return {
      city: s.city || fallbackCity,
      tempC: s.tempC,
      condition: s.condition,
      rainChance: s.rainChance,
      humidity: s.humidity,
      windKmh: s.windKmh,
      timestamp: s.timestamp,
    };
  }

  private mockWeather(city: string): WeatherDto {
    return {
      city,
      tempC: 28,
      condition: WeatherCondition.CLOUDY,
      rainChance: 20,
      humidity: 65,
      windKmh: 12,
      timestamp: new Date(),
    };
  }
}
