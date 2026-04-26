import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { WeatherService } from './weather.service';
import { WeatherSnapshotEntity } from '../zones/entities/zone.entity';
import { RedisService } from '@/common/redis/redis.service';

const mockSnapshot: Partial<WeatherSnapshotEntity> = {
  id: 'ws-1',
  city: 'Dakar',
  tempC: 28,
  condition: 'cloudy',
  rainChance: 40,
  humidity: 70,
  windKmh: 15,
  createdAt: new Date('2024-01-01'),
};

describe('WeatherService', () => {
  let service: WeatherService;
  let repository: Record<string, jest.Mock>;
  let redisService: Record<string, jest.Mock>;

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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WeatherService,
        { provide: getRepositoryToken(WeatherSnapshotEntity), useValue: repository },
        { provide: RedisService, useValue: redisService },
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
      expect(repository.findOne).not.toHaveBeenCalled();
    });

    it('should query DB if no cache', async () => {
      repository.findOne.mockResolvedValue(mockSnapshot);

      const result = await service.getWeather('Dakar');
      expect(result.city).toBe('Dakar');
      expect(result.tempC).toBe(28);
      expect(redisService.setJson).toHaveBeenCalled();
    });

    it('should return mock weather if no data', async () => {
      repository.findOne.mockResolvedValue(null);

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

    it('should query DB if no cache', async () => {
      repository.find.mockResolvedValue([mockSnapshot]);

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
    });
  });
});
