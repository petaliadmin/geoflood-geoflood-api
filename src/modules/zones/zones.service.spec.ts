import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { ZonesService } from './zones.service';
import { FloodZoneEntity } from './entities/zone.entity';

const mockZone: Partial<FloodZoneEntity> = {
  id: 'zone-1',
  name: 'Medina',
  level: 'high',
  polygon: { type: 'Polygon', coordinates: [[[- 17.44, 14.69], [-17.43, 14.69], [-17.43, 14.70], [-17.44, 14.69]]] },
  centerLat: 14.695,
  centerLng: -17.435,
  city: 'Dakar',
  score: 75,
  createdAt: new Date('2024-01-01'),
};

describe('ZonesService', () => {
  let service: ZonesService;
  let repository: Record<string, jest.Mock>;

  beforeEach(async () => {
    repository = {
      createQueryBuilder: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([mockZone]),
      }),
      findOne: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ZonesService,
        { provide: getRepositoryToken(FloodZoneEntity), useValue: repository },
      ],
    }).compile();

    service = module.get<ZonesService>(ZonesService);
  });

  describe('findAll', () => {
    it('should return zones', async () => {
      const result = await service.findAll();
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Medina');
    });

    it('should filter by city', async () => {
      await service.findAll({ city: 'Dakar' });
      const qb = repository.createQueryBuilder();
      expect(qb.where).toHaveBeenCalled();
    });
  });

  describe('findById', () => {
    it('should return zone by id', async () => {
      repository.findOne.mockResolvedValue(mockZone);
      const result = await service.findById('zone-1');
      expect(result.id).toBe('zone-1');
    });

    it('should throw NotFoundException', async () => {
      repository.findOne.mockResolvedValue(null);
      await expect(service.findById('unknown')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getNearby', () => {
    it('should call findAll with coordinates', async () => {
      const result = await service.getNearby(14.69, -17.44);
      expect(result).toHaveLength(1);
    });
  });

  describe('getRiskMap', () => {
    it('should return zones for city', async () => {
      const result = await service.getRiskMap({ city: 'Dakar' });
      expect(result).toHaveLength(1);
    });
  });
});
