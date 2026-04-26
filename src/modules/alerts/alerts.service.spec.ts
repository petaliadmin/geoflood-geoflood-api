import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AlertsService } from './alerts.service';
import { AlertEntity, AlertReadEntity } from '../zones/entities/zone.entity';

const mockAlert: Partial<AlertEntity> = {
  id: 'alert-1',
  title: 'Flood warning',
  message: 'Heavy rain expected',
  category: 'flood',
  level: 'high',
  area: 'Dakar',
  createdAt: new Date('2024-01-01'),
};

describe('AlertsService', () => {
  let service: AlertsService;
  let alertsRepo: Record<string, jest.Mock>;
  let alertReadsRepo: Record<string, jest.Mock>;
  let eventEmitter: Record<string, jest.Mock>;

  beforeEach(async () => {
    alertsRepo = {
      createQueryBuilder: jest.fn().mockReturnValue({
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[mockAlert], 1]),
      }),
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn().mockReturnValue(mockAlert),
      save: jest.fn().mockResolvedValue(mockAlert),
      count: jest.fn(),
    };

    alertReadsRepo = {
      createQueryBuilder: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
      }),
      findOne: jest.fn(),
      create: jest.fn().mockReturnValue({}),
      save: jest.fn().mockResolvedValue({}),
      count: jest.fn(),
    };

    eventEmitter = {
      emit: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AlertsService,
        { provide: getRepositoryToken(AlertEntity), useValue: alertsRepo },
        { provide: getRepositoryToken(AlertReadEntity), useValue: alertReadsRepo },
        { provide: EventEmitter2, useValue: eventEmitter },
      ],
    }).compile();

    service = module.get<AlertsService>(AlertsService);
  });

  describe('findAll', () => {
    it('should return alerts with total', async () => {
      const result = await service.findAll({ limit: 10, offset: 0 });
      expect(result.alerts).toHaveLength(1);
      expect(result.total).toBe(1);
    });
  });

  describe('findById', () => {
    it('should return alert by id', async () => {
      alertsRepo.findOne.mockResolvedValue(mockAlert);
      const result = await service.findById('alert-1');
      expect(result.id).toBe('alert-1');
    });

    it('should throw NotFoundException', async () => {
      alertsRepo.findOne.mockResolvedValue(null);
      await expect(service.findById('unknown')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('should create alert and emit event', async () => {
      const result = await service.create({
        title: 'Flood warning',
        message: 'Heavy rain',
        category: 'flood',
        level: 'high',
        area: 'Dakar',
      });
      expect(result.id).toBe('alert-1');
      expect(eventEmitter.emit).toHaveBeenCalledWith('alert.created', expect.anything());
    });
  });

  describe('markAsRead', () => {
    it('should create read record', async () => {
      alertReadsRepo.findOne.mockResolvedValue(null);
      const result = await service.markAsRead('user-1', 'alert-1');
      expect(result.success).toBe(true);
    });

    it('should skip if already read', async () => {
      alertReadsRepo.findOne.mockResolvedValue({ id: 'read-1' });
      const result = await service.markAsRead('user-1', 'alert-1');
      expect(result.success).toBe(true);
      expect(alertReadsRepo.create).not.toHaveBeenCalled();
    });
  });

  describe('getUnreadCount', () => {
    it('should return unread count', async () => {
      alertsRepo.count.mockResolvedValue(10);
      alertReadsRepo.count.mockResolvedValue(3);
      const result = await service.getUnreadCount('user-1');
      expect(result).toBe(7);
    });

    it('should return 0 when all read', async () => {
      alertsRepo.count.mockResolvedValue(5);
      alertReadsRepo.count.mockResolvedValue(5);
      const result = await service.getUnreadCount('user-1');
      expect(result).toBe(0);
    });
  });
});
