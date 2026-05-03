import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { HistoryService } from './history.service';
import { ReportEntity, FloodZoneEntity } from '../zones/entities/zone.entity';

describe('HistoryService', () => {
  let service: HistoryService;
  let reportsRepo: Record<string, jest.Mock>;
  let zonesRepo: Record<string, jest.Mock>;
  let reportsQB: Record<string, jest.Mock>;
  let zonesQB: Record<string, jest.Mock>;

  beforeEach(async () => {
    reportsQB = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };
    reportsRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(reportsQB),
    };

    zonesQB = {
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      leftJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([]),
    };
    zonesRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(zonesQB),
      findOne: jest.fn().mockResolvedValue(null),
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
    it('returns empty history when no reports', async () => {
      const result = await service.getFloodHistory();
      expect(result.byYear).toEqual([]);
    });

    it('groups reports by year (UTC)', async () => {
      reportsQB.getMany.mockResolvedValue([
        { createdAt: new Date('2023-06-15T00:00:00Z') },
        { createdAt: new Date('2023-08-20T00:00:00Z') },
        { createdAt: new Date('2024-07-10T00:00:00Z') },
      ]);

      const result = await service.getFloodHistory();
      expect(result.byYear).toEqual([
        { year: 2023, count: 2 },
        { year: 2024, count: 1 },
      ]);
    });

    it('rejects startYear > endYear', async () => {
      await expect(
        service.getFloodHistory({ startYear: 2025, endYear: 2020 }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects invalid year', async () => {
      await expect(
        service.getFloodHistory({ startYear: 1800 } as never),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('passes city filter to query builder', async () => {
      await service.getFloodHistory({ city: 'Dakar' });
      expect(reportsQB.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('flood_zones'),
        { city: 'Dakar' },
      );
    });
  });

  describe('getTopZones', () => {
    it('returns empty list when no zones', async () => {
      expect(await service.getTopZones()).toEqual([]);
    });

    it('clamps limit between 1 and 50', async () => {
      await service.getTopZones({ limit: 999 });
      expect(zonesQB.limit).toHaveBeenCalledWith(50);

      await service.getTopZones({ limit: 0 });
      expect(zonesQB.limit).toHaveBeenLastCalledWith(1);
    });

    it('maps raw rows to TopZone shape', async () => {
      zonesQB.getRawMany.mockResolvedValue([
        { zone_id: 'z1', zone_name: 'Pikine', reportCount: '12' },
        { zone_id: 'z2', zone_name: 'Guediawaye', reportCount: '5' },
      ]);

      const result = await service.getTopZones();
      expect(result).toEqual([
        { zoneId: 'z1', zoneName: 'Pikine', episodeCount: 12 },
        { zoneId: 'z2', zoneName: 'Guediawaye', episodeCount: 5 },
      ]);
    });
  });

  describe('getZoneHistory', () => {
    const zoneId = '11111111-1111-1111-1111-111111111111';

    it('throws NotFoundException when zone does not exist', async () => {
      zonesRepo.findOne.mockResolvedValue(null);
      await expect(service.getZoneHistory(zoneId)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns aggregated history for an existing zone', async () => {
      zonesRepo.findOne.mockResolvedValue({
        id: zoneId,
        name: 'Pikine',
        city: 'Dakar',
        level: 'high',
      });
      reportsQB.getMany.mockResolvedValue([
        { id: 'r1', createdAt: new Date('2024-08-10T00:00:00Z') },
        { id: 'r2', createdAt: new Date('2024-08-22T00:00:00Z') },
        { id: 'r3', createdAt: new Date('2025-01-05T00:00:00Z') },
      ]);

      const result = await service.getZoneHistory(zoneId, 5);

      expect(result.zone).toEqual({ id: zoneId, name: 'Pikine', city: 'Dakar', level: 'high' });
      expect(result.totalReports).toBe(3);
      expect(result.range.years).toBe(5);
      expect(result.byMonth).toEqual([
        { month: '2024-08', count: 2 },
        { month: '2025-01', count: 1 },
      ]);
      expect(result.byYear).toEqual([
        { year: 2024, count: 2 },
        { year: 2025, count: 1 },
      ]);
    });

    it('clamps years to [1, 50]', async () => {
      zonesRepo.findOne.mockResolvedValue({ id: zoneId, name: 'X', city: 'Y', level: 'low' });
      reportsQB.getMany.mockResolvedValue([]);

      const big = await service.getZoneHistory(zoneId, 9999 as never);
      expect(big.range.years).toBe(50);

      const small = await service.getZoneHistory(zoneId, 0 as never);
      expect(small.range.years).toBe(1);
    });
  });
});
