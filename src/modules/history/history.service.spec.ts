import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { HistoryService } from './history.service';
import { ReportEntity, FloodZoneEntity } from '../zones/entities/zone.entity';

describe('HistoryService', () => {
  let service: HistoryService;
  let reportsRepo: Record<string, jest.Mock>;
  let zonesRepo: Record<string, jest.Mock>;

  beforeEach(async () => {
    reportsRepo = {
      createQueryBuilder: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      }),
    };

    zonesRepo = {
      createQueryBuilder: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        leftJoin: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HistoryService,
        { provide: getRepositoryToken(ReportEntity), useValue: reportsRepo },
        { provide: getRepositoryToken(FloodZoneEntity), useValue: zonesRepo },
      ],
    }).compile();

    service = module.get<HistoryService>(HistoryService);
  });

  describe('getFloodHistory', () => {
    it('should return empty history', async () => {
      const result = await service.getFloodHistory();
      expect(result.byYear).toEqual([]);
    });

    it('should group reports by year', async () => {
      const reports = [
        { createdAt: new Date('2023-06-15') },
        { createdAt: new Date('2023-08-20') },
        { createdAt: new Date('2024-07-10') },
      ];
      reportsRepo.createQueryBuilder.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(reports),
      });

      const result = await service.getFloodHistory();
      expect(result.byYear).toHaveLength(2);
      expect(result.byYear[0].year).toBe(2023);
      expect(result.byYear[0].count).toBe(2);
    });
  });

  describe('getTopZones', () => {
    it('should return top zones', async () => {
      const result = await service.getTopZones();
      expect(result).toEqual([]);
    });
  });
});
