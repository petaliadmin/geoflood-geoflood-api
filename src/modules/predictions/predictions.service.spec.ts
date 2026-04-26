import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { PredictionsService } from './predictions.service';
import { PredictionEntity } from '../zones/entities/zone.entity';

const mockPrediction: Partial<PredictionEntity> = {
  id: 'pred-1',
  zoneId: 'zone-1',
  floodProbability: 0.75,
  severity: 'high',
  confidence: 0.85,
  createdAt: new Date('2024-01-01'),
};

describe('PredictionsService', () => {
  let service: PredictionsService;
  let repository: Record<string, jest.Mock>;

  beforeEach(async () => {
    repository = {
      findOne: jest.fn(),
      create: jest.fn().mockReturnValue(mockPrediction),
      save: jest.fn().mockResolvedValue(mockPrediction),
      createQueryBuilder: jest.fn().mockReturnValue({
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PredictionsService,
        { provide: getRepositoryToken(PredictionEntity), useValue: repository },
        { provide: HttpService, useValue: { post: jest.fn() } },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue(null) } },
      ],
    }).compile();

    service = module.get<PredictionsService>(PredictionsService);
  });

  describe('getPredictionForZone', () => {
    it('should return existing prediction', async () => {
      repository.findOne.mockResolvedValue(mockPrediction);
      const result = await service.getPredictionForZone('zone-1');
      expect(result.zoneId).toBe('zone-1');
      expect(result.floodProbability).toBe(0.75);
    });

    it('should return mock prediction when none exists', async () => {
      repository.findOne.mockResolvedValue(null);
      const result = await service.getPredictionForZone('zone-1');
      expect(result.zoneId).toBe('zone-1');
      expect(result.floodProbability).toBeDefined();
    });
  });

  describe('getPredictionsForCity', () => {
    it('should return empty array', async () => {
      const result = await service.getPredictionsForCity('Dakar');
      expect(result).toEqual([]);
    });
  });

  describe('getPredictionForLocation', () => {
    it('should return mock when no nearby zone', async () => {
      const result = await service.getPredictionForLocation(14.69, -17.44);
      expect(result.zoneId).toBe('unknown');
    });
  });

  describe('createOrUpdatePrediction', () => {
    it('should create new prediction', async () => {
      repository.findOne.mockResolvedValue(null);
      await service.createOrUpdatePrediction({
        zoneId: 'zone-1',
        floodProbability: 0.5,
        severity: 'medium',
        confidence: 0.8,
      });
      expect(repository.create).toHaveBeenCalled();
      expect(repository.save).toHaveBeenCalled();
    });

    it('should update existing prediction', async () => {
      repository.findOne.mockResolvedValue({ ...mockPrediction });
      repository.save.mockResolvedValue({ ...mockPrediction, floodProbability: 0.5 });

      await service.createOrUpdatePrediction({
        zoneId: 'zone-1',
        floodProbability: 0.5,
        severity: 'medium',
        confidence: 0.8,
      });
      expect(repository.save).toHaveBeenCalled();
    });
  });
});
