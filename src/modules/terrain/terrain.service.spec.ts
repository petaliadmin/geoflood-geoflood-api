import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { TerrainService } from './terrain.service';
import { TerrainCheckEntity } from '../zones/entities/zone.entity';

const mockCheck: Partial<TerrainCheckEntity> = {
  id: 'check-1',
  userId: 'user-1',
  address: '123 Rue de Dakar',
  lat: 14.69,
  lng: -17.44,
  riskScore: 45,
  altitudeMeters: 12,
  drainageScore: 60,
  historicalFloods: 3,
  recommendation: 'Moderate flood risk.',
  createdAt: new Date('2024-01-01'),
};

describe('TerrainService', () => {
  let service: TerrainService;
  let repository: Record<string, jest.Mock>;

  beforeEach(async () => {
    repository = {
      create: jest.fn().mockReturnValue(mockCheck),
      save: jest.fn().mockResolvedValue(mockCheck),
      findOne: jest.fn(),
      findAndCount: jest.fn().mockResolvedValue([[mockCheck], 1]),
      find: jest.fn().mockResolvedValue([mockCheck]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TerrainService,
        { provide: getRepositoryToken(TerrainCheckEntity), useValue: repository },
      ],
    }).compile();

    service = module.get<TerrainService>(TerrainService);
  });

  describe('checkTerrain', () => {
    it('should create terrain check', async () => {
      const result = await service.checkTerrain('user-1', '123 Rue de Dakar', 14.69, -17.44);
      expect(result.id).toBe('check-1');
      expect(result.address).toBe('123 Rue de Dakar');
    });
  });

  describe('getUserChecks', () => {
    it('should return paginated checks', async () => {
      const result = await service.getUserChecks('user-1');
      expect(result.checks).toHaveLength(1);
      expect(result.total).toBe(1);
    });
  });

  describe('findById', () => {
    it('should return check', async () => {
      repository.findOne.mockResolvedValue(mockCheck);
      const result = await service.findById('check-1');
      expect(result.id).toBe('check-1');
    });

    it('should throw NotFoundException', async () => {
      repository.findOne.mockResolvedValue(null);
      await expect(service.findById('unknown')).rejects.toThrow(NotFoundException);
    });
  });
});
