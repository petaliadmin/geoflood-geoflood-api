import { Test, TestingModule } from '@nestjs/testing';
import { SyncService } from './sync.service';
import { ZonesService } from '../zones/zones.service';
import { AlertsService } from '../alerts/alerts.service';
import { PredictionsService } from '../predictions/predictions.service';
import { ReportsService } from '../reports/reports.service';
import { WeatherService } from '../weather/weather.service';
import { UsersService } from '../users/users.service';
import { AuthUser } from '@/common/dtos';

describe('SyncService', () => {
  let service: SyncService;
  let zones: { findAll: jest.Mock };
  let alerts: { getAlertsForUser: jest.Mock; getUnreadCount: jest.Mock };
  let predictions: { getPredictionForZone: jest.Mock };
  let reports: { findReports: jest.Mock };
  let weather: { getWeather: jest.Mock; getForecast: jest.Mock };
  let users: { findById: jest.Mock };

  const authUser: AuthUser = { id: 'u1', email: 'u1@test.io', role: 'citizen' };

  beforeEach(async () => {
    zones = { findAll: jest.fn() };
    alerts = { getAlertsForUser: jest.fn(), getUnreadCount: jest.fn() };
    predictions = { getPredictionForZone: jest.fn() };
    reports = { findReports: jest.fn() };
    weather = { getWeather: jest.fn(), getForecast: jest.fn() };
    users = { findById: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SyncService,
        { provide: ZonesService, useValue: zones },
        { provide: AlertsService, useValue: alerts },
        { provide: PredictionsService, useValue: predictions },
        { provide: ReportsService, useValue: reports },
        { provide: WeatherService, useValue: weather },
        { provide: UsersService, useValue: users },
      ],
    }).compile();

    service = module.get<SyncService>(SyncService);
  });

  it('returns a consolidated snapshot with all sections', async () => {
    users.findById.mockResolvedValue({ city: 'Dakar' });
    zones.findAll.mockResolvedValue([{ id: 'z1' }, { id: 'z2' }]);
    alerts.getAlertsForUser.mockResolvedValue({ alerts: [{ id: 'a1' }], total: 1 });
    alerts.getUnreadCount.mockResolvedValue(3);
    predictions.getPredictionForZone.mockImplementation((zoneId: string) =>
      Promise.resolve({ id: 'p-' + zoneId, zoneId }),
    );
    reports.findReports.mockResolvedValue({ reports: [{ id: 'r1' }], total: 1 });
    weather.getWeather.mockResolvedValue({ city: 'Dakar', tempC: 28 });
    weather.getForecast.mockResolvedValue([{ city: 'Dakar', tempC: 30 }]);

    const snapshot = await service.getSnapshot(authUser);

    expect(snapshot.version).toBe('1.0');
    expect(snapshot.syncedAt).toMatch(/\d{4}-\d{2}-\d{2}T/);
    expect(snapshot.user).toEqual({
      id: 'u1',
      email: 'u1@test.io',
      role: 'citizen',
      city: 'Dakar',
    });
    expect(snapshot.zones).toHaveLength(2);
    expect(snapshot.floodedAreas).toEqual([]);
    expect(snapshot.alerts).toEqual({ items: [{ id: 'a1' }], unreadCount: 3 });
    expect(snapshot.predictions).toHaveLength(2);
    expect(snapshot.reports).toEqual([{ id: 'r1' }]);
    expect(snapshot.weather.current).toEqual({ city: 'Dakar', tempC: 28 });
    expect(snapshot.weather.forecast).toEqual([{ city: 'Dakar', tempC: 30 }]);
  });

  it('uses query city when provided, ignoring user profile city', async () => {
    users.findById.mockResolvedValue({ city: 'Dakar' });
    zones.findAll.mockResolvedValue([]);
    alerts.getAlertsForUser.mockResolvedValue({ alerts: [], total: 0 });
    alerts.getUnreadCount.mockResolvedValue(0);
    reports.findReports.mockResolvedValue({ reports: [], total: 0 });
    weather.getWeather.mockResolvedValue({ city: 'Thies' });
    weather.getForecast.mockResolvedValue([]);

    const snapshot = await service.getSnapshot(authUser, { city: 'Thies' });

    expect(zones.findAll).toHaveBeenCalledWith({ city: 'Thies' });
    expect(weather.getWeather).toHaveBeenCalledWith('Thies');
    expect(snapshot.user.city).toBe('Thies');
  });

  it('filters reports by current user', async () => {
    users.findById.mockResolvedValue({ city: 'Dakar' });
    zones.findAll.mockResolvedValue([]);
    alerts.getAlertsForUser.mockResolvedValue({ alerts: [], total: 0 });
    alerts.getUnreadCount.mockResolvedValue(0);
    reports.findReports.mockResolvedValue({ reports: [], total: 0 });
    weather.getWeather.mockResolvedValue({ city: 'Dakar' });
    weather.getForecast.mockResolvedValue([]);

    await service.getSnapshot(authUser);

    expect(reports.findReports).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u1' }),
    );
  });

  it('survives a failing dependency by using fallbacks', async () => {
    users.findById.mockResolvedValue({ city: 'Dakar' });
    zones.findAll.mockResolvedValue([]);
    alerts.getAlertsForUser.mockResolvedValue({ alerts: [], total: 0 });
    alerts.getUnreadCount.mockResolvedValue(0);
    reports.findReports.mockResolvedValue({ reports: [], total: 0 });
    weather.getWeather.mockRejectedValue(new Error('weather provider down'));
    weather.getForecast.mockRejectedValue(new Error('weather provider down'));

    const snapshot = await service.getSnapshot(authUser);

    expect(snapshot.weather.current.city).toBe('Dakar');
    expect(snapshot.weather.forecast).toEqual([]);
  });

  it('drops failed predictions but keeps successful ones', async () => {
    users.findById.mockResolvedValue({ city: 'Dakar' });
    zones.findAll.mockResolvedValue([{ id: 'z1' }, { id: 'z2' }, { id: 'z3' }]);
    alerts.getAlertsForUser.mockResolvedValue({ alerts: [], total: 0 });
    alerts.getUnreadCount.mockResolvedValue(0);
    reports.findReports.mockResolvedValue({ reports: [], total: 0 });
    weather.getWeather.mockResolvedValue({ city: 'Dakar' });
    weather.getForecast.mockResolvedValue([]);
    predictions.getPredictionForZone
      .mockResolvedValueOnce({ id: 'p1', zoneId: 'z1' })
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ id: 'p3', zoneId: 'z3' });

    const snapshot = await service.getSnapshot(authUser);

    expect(snapshot.predictions).toHaveLength(2);
    expect(snapshot.predictions.map(p => p.id)).toEqual(['p1', 'p3']);
  });
});
