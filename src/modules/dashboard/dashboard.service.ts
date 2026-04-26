import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual } from 'typeorm';
import { UserEntity } from '../users/entities/user.entity';
import { FloodZoneEntity } from '../zones/entities/zone.entity';
import { AlertEntity } from '../zones/entities/zone.entity';
import { WeatherSnapshotEntity } from '../zones/entities/zone.entity';
import { DashboardDataDto, RiskLevel } from '@/common/dtos';

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(UserEntity)
    private usersRepository: Repository<UserEntity>,
    @InjectRepository(FloodZoneEntity)
    private zonesRepository: Repository<FloodZoneEntity>,
    @InjectRepository(AlertEntity)
    private alertsRepository: Repository<AlertEntity>,
    @InjectRepository(WeatherSnapshotEntity)
    private weatherRepository: Repository<WeatherSnapshotEntity>,
  ) {}

  async getDashboardData(
    userId: string,
    query?: { city?: string; lat?: number; lng?: number },
  ): Promise<DashboardDataDto> {
    // Get user
    const user = await this.usersRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Determine city: use query param or user's city
    const city = query?.city || user.city || 'Dakar';

    // Get latest weather for city
    const weather = await this.weatherRepository.findOne({
      where: { city },
      order: { createdAt: 'DESC' },
    });

    // Calculate neighborhood risk based on nearby zones
    let neighborhoodRisk: RiskLevel = RiskLevel.LOW;
    if (query?.lat && query?.lng) {
      const nearbyZones = await this.getNearbyZonesRisk(query.lat, query.lng, 5);
      if (nearbyZones.length > 0) {
        const riskLevels = nearbyZones.map(z => z.level);
        if (riskLevels.includes('high')) {
          neighborhoodRisk = RiskLevel.HIGH;
        } else if (riskLevels.includes('medium')) {
          neighborhoodRisk = RiskLevel.MEDIUM;
        }
      }
    } else {
      const cityZones = await this.zonesRepository.find({
        where: { city },
      });
      if (cityZones.length > 0) {
        const avgScore = cityZones.reduce((acc, z) => acc + z.score, 0) / cityZones.length;
        if (avgScore >= 70) neighborhoodRisk = RiskLevel.HIGH;
        else if (avgScore >= 40) neighborhoodRisk = RiskLevel.MEDIUM;
        else neighborhoodRisk = RiskLevel.LOW;
      }
    }

    // Count active alerts (last 24 hours)
    const activeAlerts = await this.alertsRepository.count({
      where: {
        createdAt: MoreThanOrEqual(new Date(Date.now() - 24 * 60 * 60 * 1000)),
      },
    });

    // Calculate risk score for user's location
    const riskScore = await this.calculateRiskScore(userId, query?.lat, query?.lng, city);

    return {
      weather: weather
        ? {
            city: weather.city,
            tempC: weather.tempC,
            condition: weather.condition,
            rainChance: weather.rainChance,
            humidity: weather.humidity,
            windKmh: weather.windKmh,
            timestamp: weather.createdAt,
          }
        : this.mockWeather(city),
      neighborhoodRisk,
      activeAlerts,
      riskScore,
    };
  }

  private async getNearbyZonesRisk(lat: number, lng: number, radius: number = 5) {
    return await this.zonesRepository
      .createQueryBuilder('zone')
      .where(
        `ST_DWithin(
          ST_MakePoint(:lng, :lat)::geography,
          ST_MakePoint(zone."centerLng", zone."centerLat")::geography,
          :radiusMeters
        )`,
        {
          lat,
          lng,
          radiusMeters: radius * 1000,
        },
      )
      .getMany();
  }

  private async calculateRiskScore(
    _userId: string,
    lat?: number,
    lng?: number,
    _city?: string,
  ): Promise<number> {
    // Simple risk score calculation based on:
    // - Zone risk level where user is located
    // - Recent alerts count
    // - Historical reports in area

    let zoneScore = 0;
    let alertWeight = 0;
    let reportWeight = 0;

    // Factor 1: Zone risk
    if (lat && lng) {
      const zones = await this.getNearbyZonesRisk(lat, lng, 5);
      if (zones.length > 0) {
        const zoneLevels = zones.map(z => z.level);
        if (zoneLevels.includes('high')) zoneScore += 50;
        else if (zoneLevels.includes('medium')) zoneScore += 30;
        else zoneScore += 10;
      }
    }

    // Factor 2: Recent alerts (last 24h)
    const recentAlerts = await this.alertsRepository.count({
      where: {
        createdAt: MoreThanOrEqual(new Date(Date.now() - 24 * 60 * 60 * 1000)),
      },
    });
    alertWeight = Math.min(recentAlerts * 5, 30); // Max 30 points

    // Factor 3: Recent reports in area
    // This would require Report entity query - simplified here
    reportWeight = 0;

    return Math.min(Math.floor(zoneScore + alertWeight + reportWeight), 100);
  }

  private mockWeather(city: string) {
    return {
      city,
      tempC: 28,
      condition: 'cloudy' as any,
      rainChance: 20,
      humidity: 65,
      windKmh: 12,
      timestamp: new Date(),
    };
  }
}
