import { Injectable, Logger } from '@nestjs/common';
import { AlertsService } from '../alerts/alerts.service';
import { PredictionsService } from '../predictions/predictions.service';
import { ReportsService } from '../reports/reports.service';
import { UsersService } from '../users/users.service';
import { WeatherService } from '../weather/weather.service';
import { ZonesService } from '../zones/zones.service';
import {
  AlertDto,
  AuthUser,
  FloodReportDto,
  FloodZoneDto,
  PredictionDto,
  WeatherDto,
} from '@/common/dtos';
import { SyncSnapshotDto } from './dto/sync-snapshot.dto';

interface SyncOptions {
  city?: string;
  alertsLimit?: number;
  reportsLimit?: number;
  forecastDays?: number;
}

const SYNC_VERSION = '1.0';
const DEFAULT_ALERTS_LIMIT = 50;
const DEFAULT_REPORTS_LIMIT = 100;
const DEFAULT_FORECAST_DAYS = 5;

@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);

  constructor(
    private readonly zonesService: ZonesService,
    private readonly alertsService: AlertsService,
    private readonly predictionsService: PredictionsService,
    private readonly reportsService: ReportsService,
    private readonly weatherService: WeatherService,
    private readonly usersService: UsersService,
  ) {}

  async getSnapshot(user: AuthUser, options: SyncOptions = {}): Promise<SyncSnapshotDto> {
    const alertsLimit = options.alertsLimit ?? DEFAULT_ALERTS_LIMIT;
    const reportsLimit = options.reportsLimit ?? DEFAULT_REPORTS_LIMIT;
    const forecastDays = options.forecastDays ?? DEFAULT_FORECAST_DAYS;

    const userProfile = await this.safe(
      () => this.usersService.findById(user.id),
      'usersService.findById',
      null,
    );
    const city = options.city || userProfile?.city || 'Dakar';

    const [zones, alertsResult, userReports, currentWeather, forecast] = await Promise.all([
      this.safe<FloodZoneDto[]>(
        () => this.zonesService.findAll({ city }),
        'zonesService.findAll',
        [],
      ),
      this.safe<{ alerts: AlertDto[]; total: number }>(
        () =>
          this.alertsService.getAlertsForUser(user.id, alertsLimit, 0) as unknown as Promise<{
            alerts: AlertDto[];
            total: number;
          }>,
        'alertsService.getAlertsForUser',
        { alerts: [], total: 0 },
      ),
      this.safe<{ reports: unknown[]; total: number }>(
        () => this.reportsService.findReports({ userId: user.id, limit: reportsLimit }),
        'reportsService.findReports',
        { reports: [], total: 0 },
      ),
      this.safe<WeatherDto | null>(
        () => this.weatherService.getWeather(city),
        'weatherService.getWeather',
        null,
      ),
      this.safe<WeatherDto[]>(
        () => this.weatherService.getForecast(city, forecastDays) as Promise<WeatherDto[]>,
        'weatherService.getForecast',
        [],
      ),
    ]);

    const unreadCount = await this.safe(
      () => this.alertsService.getUnreadCount(user.id),
      'alertsService.getUnreadCount',
      0,
    );

    const predictions = await this.fetchPredictions(zones);

    return {
      syncedAt: new Date().toISOString(),
      version: SYNC_VERSION,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        city,
      },
      zones,
      floodedAreas: [],
      alerts: {
        items: alertsResult.alerts,
        unreadCount,
      },
      predictions,
      reports: userReports.reports as unknown as FloodReportDto[],
      weather: {
        current: currentWeather ?? this.fallbackWeather(city),
        forecast,
      },
    };
  }

  private async fetchPredictions(zones: FloodZoneDto[]): Promise<PredictionDto[]> {
    if (!zones.length) return [];

    const results = await Promise.allSettled(
      zones.map(z => this.predictionsService.getPredictionForZone(z.id)),
    );

    return results
      .filter((r): r is PromiseFulfilledResult<PredictionDto> => r.status === 'fulfilled')
      .map(r => r.value);
  }

  private async safe<T>(fn: () => Promise<T>, label: string, fallback: T): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      this.logger.warn(`Sync: ${label} failed — using fallback. ${(err as Error).message}`);
      return fallback;
    }
  }

  private fallbackWeather(city: string): WeatherDto {
    return {
      city,
      tempC: 0,
      condition: 'cloudy' as WeatherDto['condition'],
      rainChance: 0,
      humidity: 0,
      windKmh: 0,
      timestamp: new Date(),
    };
  }
}
