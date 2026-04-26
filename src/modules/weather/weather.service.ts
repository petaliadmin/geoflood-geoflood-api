import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RedisService } from '@/common/redis/redis.service';
import { WeatherSnapshotEntity } from '../zones/entities/zone.entity';
import { WeatherDto, WeatherCondition } from '@/common/dtos';

@Injectable()
export class WeatherService {
  private readonly CACHE_TTL = 300; // 5 minutes

  constructor(
    @InjectRepository(WeatherSnapshotEntity)
    private weatherRepository: Repository<WeatherSnapshotEntity>,
    private redisService: RedisService,
  ) {}

  async getWeather(city: string = 'Dakar'): Promise<WeatherDto> {
    const cacheKey = `weather:${city}`;

    // Try cache first
    const cached = await this.redisService.getJson<WeatherDto>(cacheKey);
    if (cached) {
      return cached;
    }

    const latest = await this.weatherRepository.findOne({
      where: { city },
      order: { createdAt: 'DESC' },
    });

    const result: WeatherDto = latest
      ? {
          city: latest.city,
          tempC: latest.tempC,
          condition: latest.condition as unknown as WeatherCondition,
          rainChance: latest.rainChance,
          humidity: latest.humidity,
          windKmh: latest.windKmh,
          timestamp: latest.createdAt,
        }
      : this.mockWeather(city);

    // Cache result
    await this.redisService.setJson(cacheKey, this.CACHE_TTL, result);

    return result;
  }

  async getForecast(city: string = 'Dakar', days: number = 5) {
    const cacheKey = `forecast:${city}:${days}`;

    const cached = await this.redisService.getJson<WeatherDto[]>(cacheKey);
    if (cached) {
      return cached;
    }

    const forecasts = await this.weatherRepository.find({
      where: { city },
      order: { forecastDate: 'DESC' },
      take: days,
    });

    const result = forecasts.map(f => ({
      city: f.city,
      tempC: f.tempC,
      condition: f.condition,
      rainChance: f.rainChance,
      humidity: f.humidity,
      windKmh: f.windKmh,
      timestamp: f.forecastDate || f.createdAt,
    }));

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

    // Invalidate cache
    await this.redisService.del(`weather:${data.city}`);
    await this.redisService.del(`forecast:${data.city}`);

    return saved;
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
