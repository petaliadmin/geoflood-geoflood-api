import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { ReportEntity } from '../zones/entities/zone.entity';

const mockReport: Partial<ReportEntity> = {
  id: 'report-1',
  userId: 'user-1',
  lat: 14.69,
  lng: -17.44,
  waterLevel: 'knee',
  roadBlocked: false,
  comment: 'Water rising',
  photoPaths: [],
  status: 'pending',
  createdAt: new Date('2024-01-01'),
};

describe('ReportsService', () => {
  let service: ReportsService;
  let repository: Record<string, jest.Mock>;

  beforeEach(async () => {
    repository = {
      create: jest.fn().mockReturnValue(mockReport),
      save: jest.fn().mockResolvedValue(mockReport),
      findOne: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[mockReport], 1]),
        getMany: jest.fn().mockResolvedValue([mockReport]),
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportsService,
        { provide: getRepositoryToken(ReportEntity), useValue: repository },
      ],
    }).compile();

    service = module.get<ReportsService>(ReportsService);
  });

  describe('createReport', () => {
    it('should create and return report', async () => {
      const result = await service.createReport('user-1', {
        lat: 14.69,
        lng: -17.44,
        waterLevel: 'knee',
        roadBlocked: false,
      });
      expect(result.id).toBe('report-1');
      expect(result.status).toBe('pending');
    });
  });

  describe('findReports', () => {
    it('should return paginated reports', async () => {
      const result = await service.findReports({ limit: 10, offset: 0 });
      expect(result.reports).toHaveLength(1);
      expect(result.total).toBe(1);
    });
  });

  describe('findById', () => {
    it('should return report', async () => {
      repository.findOne.mockResolvedValue(mockReport);
      const result = await service.findById('report-1');
      expect(result.id).toBe('report-1');
    });

    it('should throw NotFoundException', async () => {
      repository.findOne.mockResolvedValue(null);
      await expect(service.findById('unknown')).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateStatus', () => {
    it('should update report status', async () => {
      repository.findOne.mockResolvedValue({ ...mockReport });
      repository.save.mockResolvedValue({ ...mockReport, status: 'verified' });
      const result = await service.updateStatus('report-1', 'verified');
      expect(result.status).toBe('verified');
    });

    it('should throw NotFoundException', async () => {
      repository.findOne.mockResolvedValue(null);
      await expect(service.updateStatus('unknown', 'verified')).rejects.toThrow(NotFoundException);
    });
  });
});
