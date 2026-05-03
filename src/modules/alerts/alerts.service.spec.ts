import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AlertsService } from './alerts.service';
import { AlertEntity, AlertReadEntity } from '../zones/entities/zone.entity';

const baseAlert: Partial<AlertEntity> = {
  id: 'alert-1',
  title: 'Flood warning',
  message: 'Heavy rain expected',
  category: 'flood',
  level: 'high',
  area: 'Dakar',
  targetZoneId: 'zone-1',
  status: 'pending',
  createdBy: 'user-citizen',
  validatedBy: null,
  validatedAt: null,
  rejectionReason: null,
  createdAt: new Date('2026-04-01'),
};

describe('AlertsService', () => {
  let service: AlertsService;
  let alertsRepo: Record<string, jest.Mock>;
  let alertReadsRepo: Record<string, jest.Mock>;
  let eventEmitter: { emit: jest.Mock };

  beforeEach(async () => {
    alertsRepo = {
      createQueryBuilder: jest.fn().mockReturnValue({
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[baseAlert], 1]),
      }),
      findOne: jest.fn(),
      find: jest.fn().mockResolvedValue([baseAlert]),
      create: jest.fn().mockImplementation(input => ({ ...baseAlert, ...input })),
      save: jest.fn().mockImplementation(async input => ({ ...baseAlert, ...input })),
      count: jest.fn(),
    };

    alertReadsRepo = {
      createQueryBuilder: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
      }),
      findOne: jest.fn(),
      create: jest.fn().mockImplementation(input => input),
      save: jest.fn().mockImplementation(async input => input),
      count: jest.fn(),
    };

    eventEmitter = { emit: jest.fn() };

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

  describe('create', () => {
    const dto = {
      title: 'Flood warning',
      message: 'Heavy rain',
      category: 'flood' as const,
      level: 'high' as const,
      area: 'Dakar',
      targetZoneId: 'zone-1',
    };

    it('citizen → status pending and emits alert.pending', async () => {
      const result = await service.create(dto, { id: 'user-citizen', role: 'citizen' });

      expect(result.status).toBe('pending');
      expect(result.validatedBy).toBeNull();
      expect(result.validatedAt).toBeNull();
      expect(eventEmitter.emit).toHaveBeenCalledTimes(1);
      expect(eventEmitter.emit).toHaveBeenCalledWith('alert.pending', expect.anything());
    });

    it('authority → status validated and emits alert.validated', async () => {
      const result = await service.create(dto, { id: 'user-authority', role: 'authority' });

      expect(result.status).toBe('validated');
      expect(result.validatedBy).toBe('user-authority');
      expect(result.validatedAt).toBeInstanceOf(Date);
      expect(eventEmitter.emit).toHaveBeenCalledWith('alert.validated', expect.anything());
    });

    it('admin → status validated and emits alert.validated', async () => {
      const result = await service.create(dto, { id: 'user-admin', role: 'admin' });

      expect(result.status).toBe('validated');
      expect(result.validatedBy).toBe('user-admin');
      expect(eventEmitter.emit).toHaveBeenCalledWith('alert.validated', expect.anything());
    });
  });

  describe('validate', () => {
    it('admin transitions pending → validated and emits event', async () => {
      alertsRepo.findOne.mockResolvedValue({ ...baseAlert, status: 'pending' });

      const result = await service.validate('alert-1', { id: 'admin-1', role: 'admin' });

      expect(result.status).toBe('validated');
      expect(result.validatedBy).toBe('admin-1');
      expect(eventEmitter.emit).toHaveBeenCalledWith('alert.validated', expect.anything());
    });

    it('non-admin cannot validate', async () => {
      await expect(
        service.validate('alert-1', { id: 'u', role: 'citizen' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws when alert is missing', async () => {
      alertsRepo.findOne.mockResolvedValue(null);
      await expect(
        service.validate('missing', { id: 'admin-1', role: 'admin' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects double-validation', async () => {
      alertsRepo.findOne.mockResolvedValue({ ...baseAlert, status: 'validated' });
      await expect(
        service.validate('alert-1', { id: 'admin-1', role: 'admin' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('cannot validate a rejected alert', async () => {
      alertsRepo.findOne.mockResolvedValue({ ...baseAlert, status: 'rejected' });
      await expect(
        service.validate('alert-1', { id: 'admin-1', role: 'admin' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('reject', () => {
    it('admin rejects pending alert with reason', async () => {
      alertsRepo.findOne.mockResolvedValue({ ...baseAlert, status: 'pending' });

      const result = await service.reject('alert-1', { id: 'admin-1', role: 'admin' }, 'duplicate');

      expect(result.status).toBe('rejected');
      expect(result.rejectionReason).toBe('duplicate');
      // rejection should not emit a public broadcast
      expect(eventEmitter.emit).not.toHaveBeenCalledWith(
        'alert.validated',
        expect.anything(),
      );
    });

    it('non-admin cannot reject', async () => {
      await expect(
        service.reject('alert-1', { id: 'u', role: 'authority' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('cannot reject already validated alert', async () => {
      alertsRepo.findOne.mockResolvedValue({ ...baseAlert, status: 'validated' });
      await expect(
        service.reject('alert-1', { id: 'admin-1', role: 'admin' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('findAll', () => {
    it('non-admin viewer is forced to status=validated', async () => {
      const qb = alertsRepo.createQueryBuilder();
      await service.findAll({ viewerRole: 'citizen' });

      expect(qb.andWhere).toHaveBeenCalledWith(
        'alert.status = :defaultStatus',
        { defaultStatus: 'validated' },
      );
    });

    it('admin viewer sees all statuses by default', async () => {
      const qb = alertsRepo.createQueryBuilder();
      await service.findAll({ viewerRole: 'admin' });

      expect(qb.andWhere).not.toHaveBeenCalledWith(
        'alert.status = :defaultStatus',
        expect.anything(),
      );
    });

    it('explicit status filter is honored', async () => {
      const qb = alertsRepo.createQueryBuilder();
      await service.findAll({ viewerRole: 'admin', status: 'pending' });

      expect(qb.andWhere).toHaveBeenCalledWith(
        'alert.status = :status',
        { status: 'pending' },
      );
    });
  });

  describe('findPending', () => {
    it('returns pending alerts', async () => {
      const result = await service.findPending();
      expect(alertsRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: { status: 'pending' } }),
      );
      expect(result.total).toBe(1);
    });
  });

  describe('findById', () => {
    it('returns alert by id', async () => {
      alertsRepo.findOne.mockResolvedValue(baseAlert);
      const result = await service.findById('alert-1');
      expect(result.id).toBe('alert-1');
    });

    it('throws NotFoundException when missing', async () => {
      alertsRepo.findOne.mockResolvedValue(null);
      await expect(service.findById('unknown')).rejects.toThrow(NotFoundException);
    });
  });

  describe('markAsRead', () => {
    it('creates a read record when none exists', async () => {
      alertReadsRepo.findOne.mockResolvedValue(null);
      const result = await service.markAsRead('user-1', 'alert-1');
      expect(result.success).toBe(true);
      expect(alertReadsRepo.create).toHaveBeenCalled();
    });

    it('skips creation when already read', async () => {
      alertReadsRepo.findOne.mockResolvedValue({ id: 'read-1' });
      const result = await service.markAsRead('user-1', 'alert-1');
      expect(result.success).toBe(true);
      expect(alertReadsRepo.create).not.toHaveBeenCalled();
    });
  });

  describe('getUnreadCount', () => {
    it('returns total validated alerts minus reads', async () => {
      alertsRepo.count.mockResolvedValue(10);
      alertReadsRepo.count.mockResolvedValue(3);
      const result = await service.getUnreadCount('user-1');
      expect(alertsRepo.count).toHaveBeenCalledWith({ where: { status: 'validated' } });
      expect(result).toBe(7);
    });

    it('returns 0 when reads exceed alerts', async () => {
      alertsRepo.count.mockResolvedValue(2);
      alertReadsRepo.count.mockResolvedValue(5);
      const result = await service.getUnreadCount('user-1');
      expect(result).toBe(0);
    });
  });
});
