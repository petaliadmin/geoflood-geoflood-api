import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { UserEntity } from '../users/entities/user.entity';
import { FloodZoneEntity, AlertEntity, WeatherSnapshotEntity } from '../zones/entities/zone.entity';

const mockUser: Partial<UserEntity> = {
  id: 'user-1',
  city: 'Dakar',
};

const mockWeather: Partial<WeatherSnapshotEntity> = {
  city: 'Dakar',
  tempC: 28,
  condition: 'cloudy',
  rainChance: 40,
  humidity: 70,
  windKmh: 15,
  createdAt: new Date(),
};

describe('DashboardService', () => {
  let service: DashboardService;
  let usersRepo: Record<string, jest.Mock>;
  let zonesRepo: Record<string, jest.Mock>;
  let alertsRepo: Record<string, jest.Mock>;
  let weatherRepo: Record<string, jest.Mock>;

  beforeEach(async () => {
    usersRepo = { findOne: jest.fn() };
    zonesRepo = {
      find: jest.fn().mockResolvedValue([]),
      createQueryBuilder: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      }),
    };
    alertsRepo = { count: jest.fn().mockResolvedValue(0) };
    weatherRepo = { findOne: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardService,
        { provide: getRepositoryToken(UserEntity), useValue: usersRepo },
        { provide: getRepositoryToken(FloodZoneEntity), useValue: zonesRepo },
        { provide: getRepositoryToken(AlertEntity), useValue: alertsRepo },
        { provide: getRepositoryToken(WeatherSnapshotEntity), useValue: weatherRepo },
      ],
    }).compile();

    service = module.get<DashboardService>(DashboardService);
  });

  describe('getDashboardData', () => {
    it('should return dashboard data', async () => {
      usersRepo.findOne.mockResolvedValue(mockUser);
      weatherRepo.findOne.mockResolvedValue(mockWeather);

      const result = await service.getDashboardData('user-1');
      expect(result.weather.city).toBe('Dakar');
      expect(result.activeAlerts).toBe(0);
      expect(result.riskScore).toBeDefined();
    });

    it('should throw NotFoundException for unknown user', async () => {
      usersRepo.findOne.mockResolvedValue(null);
      await expect(service.getDashboardData('unknown')).rejects.toThrow(NotFoundException);
    });

    it('should use mock weather when no data', async () => {
      usersRepo.findOne.mockResolvedValue(mockUser);
      weatherRepo.findOne.mockResolvedValue(null);

      const result = await service.getDashboardData('user-1');
      expect(result.weather).toBeDefined();
      expect(result.weather.city).toBe('Dakar');
    });
  });
});
