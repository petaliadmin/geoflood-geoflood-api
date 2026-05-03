import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { WeatherService } from './weather.service';
import { WeatherSnapshotEntity } from '../zones/entities/zone.entity';
import { RedisService } from '@/common/redis/redis.service';
import { LocalDbWeatherProvider } from './providers/local-db.provider';
import { WeatherCondition } from '@/common/dtos';

const mockSnapshot = {
  city: 'Dakar',
  tempC: 28,
  condition: WeatherCondition.CLOUDY,
  rainChance: 40,
  humidity: 70,
  windKmh: 15,
  timestamp: new Date('2024-01-01'),
};

describe('WeatherService', () => {
  let service: WeatherService;
  let repository: Record<string, jest.Mock>;
  let redisService: Record<string, jest.Mock>;
  let localProvider: {
    name: string;
    isAvailable: jest.Mock;
    getCurrent: jest.Mock;
    getForecast: jest.Mock;
  };

  beforeEach(async () => {
    repository = {
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn().mockReturnValue(mockSnapshot),
      save: jest.fn().mockResolvedValue(mockSnapshot),
    };

    redisService = {
      getJson: jest.fn().mockResolvedValue(null),
      setJson: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
    };

    localProvider = {
      name: 'local-db',
      isAvailable: jest.fn().mockReturnValue(true),
      getCurrent: jest.fn().mockResolvedValue(null),
      getForecast: jest.fn().mockResolvedValue([]),
    };

    const configService = {
      get: jest.fn().mockReturnValue('local'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WeatherService,
        { provide: getRepositoryToken(WeatherSnapshotEntity), useValue: repository },
        { provide: RedisService, useValue: redisService },
        { provide: ConfigService, useValue: configService },
        { provide: LocalDbWeatherProvider, useValue: localProvider },
      ],
    }).compile();

    service = module.get<WeatherService>(WeatherService);
  });

  describe('getWeather', () => {
    it('should return cached weather if available', async () => {
      const cached = { city: 'Dakar', tempC: 30 };
      redisService.getJson.mockResolvedValue(cached);

      const result = await service.getWeather('Dakar');
      expect(result).toEqual(cached);
      expect(localProvider.getCurrent).not.toHaveBeenCalled();
    });

    it('should query provider if no cache', async () => {
      localProvider.getCurrent.mockResolvedValue(mockSnapshot);

      const result = await service.getWeather('Dakar');
      expect(result.city).toBe('Dakar');
      expect(result.tempC).toBe(28);
      expect(redisService.setJson).toHaveBeenCalled();
    });

    it('should return mock weather if no data', async () => {
      localProvider.getCurrent.mockResolvedValue(null);

      const result = await service.getWeather('Thies');
      expect(result.city).toBe('Thies');
      expect(result.tempC).toBeDefined();
    });
  });

  describe('getForecast', () => {
    it('should return cached forecast', async () => {
      const cached = [{ city: 'Dakar', tempC: 30 }];
      redisService.getJson.mockResolvedValue(cached);

      const result = await service.getForecast('Dakar', 5);
      expect(result).toEqual(cached);
    });

    it('should query provider if no cache', async () => {
      localProvider.getForecast.mockResolvedValue([mockSnapshot]);

      const result = await service.getForecast('Dakar', 5);
      expect(result).toHaveLength(1);
    });
  });

  describe('saveWeatherSnapshot', () => {
    it('should save and invalidate cache', async () => {
      const result = await service.saveWeatherSnapshot({
        city: 'Dakar',
        tempC: 28,
        condition: 'cloudy',
        rainChance: 40,
        humidity: 70,
        windKmh: 15,
      });

      expect(repository.save).toHaveBeenCalled();
      expect(redisService.del).toHaveBeenCalledTimes(2);
      expect(result).toBeDefined();
    });
  });
});
