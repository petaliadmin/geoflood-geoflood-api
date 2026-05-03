import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WeatherSnapshotEntity } from '../../zones/entities/zone.entity';
import { WeatherCondition } from '@/common/dtos';
import { IWeatherProvider, WeatherProviderQuery, WeatherSnapshotData } from '../weather.provider';

@Injectable()
export class LocalDbWeatherProvider implements IWeatherProvider {
  readonly name = 'local-db';

  constructor(
    @InjectRepository(WeatherSnapshotEntity)
    private repo: Repository<WeatherSnapshotEntity>,
  ) {}

  isAvailable(): boolean {
    return true;
  }

  async getCurrent(query: WeatherProviderQuery): Promise<WeatherSnapshotData | null> {
    const city = query.city || 'Dakar';
    const latest = await this.repo.findOne({
      where: { city },
      order: { createdAt: 'DESC' },
    });
    if (!latest) return null;
    return {
      city: latest.city,
      tempC: latest.tempC,
      condition: latest.condition as unknown as WeatherCondition,
      rainChance: latest.rainChance,
      humidity: latest.humidity,
      windKmh: latest.windKmh,
      timestamp: latest.createdAt,
    };
  }

  async getForecast(query: WeatherProviderQuery, hours: number): Promise<WeatherSnapshotData[]> {
    const city = query.city || 'Dakar';
    const days = Math.max(1, Math.ceil(hours / 24));
    const forecasts = await this.repo.find({
      where: { city },
      order: { forecastDate: 'DESC' },
      take: days,
    });
    return forecasts.map(f => ({
      city: f.city,
      tempC: f.tempC,
      condition: f.condition as unknown as WeatherCondition,
      rainChance: f.rainChance,
      humidity: f.humidity,
      windKmh: f.windKmh,
      timestamp: f.forecastDate || f.createdAt,
    }));
  }
}
