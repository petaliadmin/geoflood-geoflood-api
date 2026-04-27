import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ZonesService } from '../zones.service';
import { FloodZoneEntity } from '../entities/zone.entity';
import { RedisService } from '@/common/redis/redis.service';

const mockZone: Partial<FloodZoneEntity> = {
  id: 'test-uuid-001',
  name: 'Zone Pikine',
  level: 'high',
  polygon: {
    type: 'Polygon',
    coordinates: [
      [
        [-17.3908, 14.7567],
        [-17.39, 14.757],
        [-17.3895, 14.7565],
        [-17.3908, 14.7567],
      ],
    ],
  },
  centerLat: 14.7567,
  centerLng: -17.3901,
  city: 'Dakar',
  score: 85,
  altitude: 3.5,
  elevation: 4.0,
  nature: 'zone humide',
  zoneType: 'permanent',
  typeBord: 'naturel',
  designation: 'Zone inondable classée',
  shapeArea: 25000.5,
  shapeLeng: 800.2,
  source: 'shapefile_zone_inondable_humide',
  createdAt: new Date('2026-04-01'),
  updatedAt: new Date('2026-04-01'),
};

const mockQueryBuilder = {
  where: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  addOrderBy: jest.fn().mockReturnThis(),
  getMany: jest.fn().mockResolvedValue([mockZone]),
  select: jest.fn().mockReturnThis(),
  addSelect: jest.fn().mockReturnThis(),
  setParameter: jest.fn().mockReturnThis(),
  getRawMany: jest.fn().mockResolvedValue([]),
};

const mockRepository = {
  createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
  findOne: jest.fn(),
  count: jest.fn(),
};

const mockRedisService = {
  get: jest.fn().mockResolvedValue(null),
  getJson: jest.fn().mockResolvedValue(null),
  setex: jest.fn().mockResolvedValue('OK'),
  setJson: jest.fn().mockResolvedValue('OK'),
  del: jest.fn(),
};

describe('ZonesService', () => {
  let service: ZonesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ZonesService,
        { provide: getRepositoryToken(FloodZoneEntity), useValue: mockRepository },
        { provide: RedisService, useValue: mockRedisService },
      ],
    }).compile();

    service = module.get<ZonesService>(ZonesService);
    jest.clearAllMocks();
    mockQueryBuilder.getMany.mockResolvedValue([mockZone]);
  });

  describe('findAll', () => {
    it('should return formatted zones', async () => {
      const result = await service.findAll();

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('test-uuid-001');
      expect(result[0].name).toBe('Zone Pikine');
      expect(result[0].level).toBe('high');
    });

    it('should return polygon as {lat, lng} objects for Flutter', async () => {
      const result = await service.findAll();
      const zone = result[0];

      expect(zone.polygon).toBeDefined();
      expect(zone.polygon.length).toBeGreaterThan(0);
      expect(zone.polygon[0]).toHaveProperty('lat');
      expect(zone.polygon[0]).toHaveProperty('lng');
      expect(typeof zone.polygon[0].lat).toBe('number');
      expect(typeof zone.polygon[0].lng).toBe('number');
    });

    it('should return center as {lat, lng} for Flutter', async () => {
      const result = await service.findAll();
      const zone = result[0];

      expect(zone.center).toEqual({ lat: 14.7567, lng: -17.3901 });
    });

    it('should include shapefile metadata fields', async () => {
      const result = await service.findAll();
      const zone = result[0];

      expect(zone.altitude).toBe(3.5);
      expect(zone.elevation).toBe(4.0);
      expect(zone.nature).toBe('zone humide');
      expect(zone.zoneType).toBe('permanent');
      expect(zone.designation).toBe('Zone inondable classée');
      expect(zone.shapeArea).toBe(25000.5);
      expect(zone.source).toBe('shapefile_zone_inondable_humide');
    });

    it('should filter by source', async () => {
      await service.findAll({ source: 'shapefile_zone_inondable_humide' });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'zone.source = :source',
        { source: 'shapefile_zone_inondable_humide' },
      );
    });

    it('should filter by nature', async () => {
      await service.findAll({ nature: 'zone humide' });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'zone.nature = :nature',
        { nature: 'zone humide' },
      );
    });

    it('should filter by city', async () => {
      await service.findAll({ city: 'Dakar' });

      expect(mockQueryBuilder.where).toHaveBeenCalledWith(
        'zone.city = :city',
        { city: 'Dakar' },
      );
    });

    it('should filter by level', async () => {
      await service.findAll({ level: 'high' });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'zone.level = :level',
        { level: 'high' },
      );
    });
  });

  describe('findById', () => {
    it('should return a zone by id', async () => {
      mockRepository.findOne.mockResolvedValue(mockZone);

      const result = await service.findById('test-uuid-001');
      expect(result.id).toBe('test-uuid-001');
      expect(result.polygon[0]).toHaveProperty('lat');
    });

    it('should throw NotFoundException for unknown id', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      await expect(service.findById('unknown')).rejects.toThrow('Flood zone not found');
    });
  });

  describe('getRiskMapOptimized', () => {
    it('should return cached data when available', async () => {
      const cachedZones = [{ id: 'cached', name: 'Cached Zone' }];
      mockRedisService.getJson.mockResolvedValue(cachedZones);

      const result = await service.getRiskMapOptimized({ zoom: 12 });

      expect(result).toEqual(cachedZones);
      expect(mockRepository.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('should use ST_Simplify for low zoom levels', async () => {
      mockRedisService.getJson.mockResolvedValue(null);
      mockQueryBuilder.getRawMany.mockResolvedValue([]);

      await service.getRiskMapOptimized({ zoom: 9 });

      expect(mockQueryBuilder.addSelect).toHaveBeenCalledWith(
        expect.stringContaining('ST_Simplify'),
        'simplified_polygon',
      );
      expect(mockQueryBuilder.setParameter).toHaveBeenCalledWith(
        'tolerance',
        0.005,
      );
    });

    it('should use moderate simplification for medium zoom', async () => {
      mockRedisService.getJson.mockResolvedValue(null);
      mockQueryBuilder.getRawMany.mockResolvedValue([]);

      await service.getRiskMapOptimized({ zoom: 12 });

      expect(mockQueryBuilder.setParameter).toHaveBeenCalledWith(
        'tolerance',
        0.001,
      );
    });

    it('should return full geometry for high zoom', async () => {
      mockRedisService.getJson.mockResolvedValue(null);
      mockQueryBuilder.getMany.mockResolvedValue([mockZone]);

      const result = await service.getRiskMapOptimized({ zoom: 16 });

      expect(result).toHaveLength(1);
      expect(result[0].polygon.length).toBeGreaterThan(0);
    });

    it('should cache the result with 5 min TTL', async () => {
      mockRedisService.getJson.mockResolvedValue(null);
      mockQueryBuilder.getMany.mockResolvedValue([mockZone]);

      await service.getRiskMapOptimized({ zoom: 16 });

      expect(mockRedisService.setJson).toHaveBeenCalledWith(
        'risk-map:all:16',
        300,
        expect.any(Array),
      );
    });
  });

  describe('formatZoneResponse - Flutter contract', () => {
    it('should convert GeoJSON [lng, lat] to Flutter {lat, lng}', async () => {
      const result = await service.findAll();
      const zone = result[0];

      expect(zone.polygon[0].lat).toBe(14.7567);
      expect(zone.polygon[0].lng).toBe(-17.3908);
    });

    it('should handle zone with null optional fields', async () => {
      const zoneWithNulls = {
        ...mockZone,
        altitude: null as number | null,
        nature: null as string | null,
        source: null as string | null,
      };
      mockQueryBuilder.getMany.mockResolvedValue([zoneWithNulls]);

      const result = await service.findAll();
      const zone = result[0];

      expect(zone.altitude).toBeNull();
      expect(zone.nature).toBeNull();
      expect(zone.id).toBe('test-uuid-001');
    });

    it('should handle zone with empty polygon', async () => {
      const emptyPolygonZone = {
        ...mockZone,
        polygon: { type: 'Polygon' as const, coordinates: [] as number[][][] },
      };
      mockQueryBuilder.getMany.mockResolvedValue([emptyPolygonZone]);

      const result = await service.findAll();
      expect(result[0].polygon).toEqual([]);
    });
  });
});
