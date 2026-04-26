import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { RouteService } from './route.service';
import { FloodZoneEntity } from '../zones/entities/zone.entity';

describe('RouteService', () => {
  let service: RouteService;
  let repository: Record<string, jest.Mock>;

  beforeEach(async () => {
    repository = {
      createQueryBuilder: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RouteService,
        { provide: getRepositoryToken(FloodZoneEntity), useValue: repository },
      ],
    }).compile();

    service = module.get<RouteService>(RouteService);
  });

  describe('calculateSafeRoute', () => {
    it('should return route result', async () => {
      const result = await service.calculateSafeRoute({
        fromLat: 14.69,
        fromLng: -17.44,
        toLat: 14.75,
        toLng: -17.40,
      });

      expect(result.distance).toBeGreaterThan(0);
      expect(result.duration).toBeGreaterThan(0);
      expect(result.geometry).toBeDefined();
      expect(result.avoidedZones).toEqual([]);
    });

    it('should include avoided zones', async () => {
      repository.createQueryBuilder.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([{ id: 'zone-1' }]),
      });

      const result = await service.calculateSafeRoute({
        fromLat: 14.69,
        fromLng: -17.44,
        toLat: 14.75,
        toLng: -17.40,
      });

      expect(result.avoidedZones).toContain('zone-1');
    });
  });
});
