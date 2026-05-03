import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AlertEntity, AlertReadEntity } from '../zones/entities/zone.entity';

type UserRole = 'citizen' | 'authority' | 'admin';

interface ActorUser {
  id: string;
  role: UserRole;
}

// Event payloads
interface AlertData {
  id: string;
  title: string;
  message: string;
  category: string;
  level: string;
  area: string;
  status: 'pending' | 'validated' | 'rejected';
  createdAt: Date;
  validatedAt?: Date | null;
}

export class AlertCreatedEvent {
  constructor(
    public alert: AlertData,
    public targetZoneId?: string,
    public targetCity?: string,
  ) {}
}

export class AlertValidatedEvent {
  constructor(
    public alert: AlertData,
    public targetZoneId?: string,
    public targetCity?: string,
  ) {}
}

export class AlertPendingEvent {
  constructor(public alert: AlertData) {}
}

@Injectable()
export class AlertsService {
  constructor(
    @InjectRepository(AlertEntity)
    private alertsRepository: Repository<AlertEntity>,
    @InjectRepository(AlertReadEntity)
    private alertReadsRepository: Repository<AlertReadEntity>,
    private eventEmitter: EventEmitter2,
  ) {}

  async findAll(query?: {
    limit?: number;
    offset?: number;
    category?: string;
    level?: string;
    status?: 'pending' | 'validated' | 'rejected' | 'all';
    userId?: string;
    viewerRole?: UserRole;
  }) {
    const limit = query?.limit || 20;
    const offset = query?.offset || 0;

    let qb = this.alertsRepository
      .createQueryBuilder('alert')
      .leftJoinAndSelect('alert.reads', 'read')
      .orderBy('alert.createdAt', 'DESC')
      .take(limit)
      .skip(offset);

    // Status filter:
    // - admin can see anything; default = all
    // - others only see validated unless explicitly otherwise (and they have right)
    const status = query?.status;
    if (status && status !== 'all') {
      qb = qb.andWhere('alert.status = :status', { status });
    } else if (!status) {
      if (query?.viewerRole !== 'admin') {
        qb = qb.andWhere('alert.status = :defaultStatus', { defaultStatus: 'validated' });
      }
    }

    if (query?.category) {
      qb = qb.andWhere('alert.category = :category', { category: query.category });
    }

    if (query?.level) {
      qb = qb.andWhere('alert.level = :level', { level: query.level });
    }

    const [alerts, total] = await qb.getManyAndCount();

    if (query?.userId) {
      const readAlertIds = await this.alertReadsRepository
        .createQueryBuilder('read')
        .select('read.alertId')
        .where('read.userId = :userId', { userId: query.userId })
        .getRawMany();

      const readIds = readAlertIds.map(r => r.read_alertId);

      return {
        alerts: alerts.map(alert => ({
          ...this.formatAlertResponse(alert),
          read: readIds.includes(alert.id),
        })),
        total,
      };
    }

    return {
      alerts: alerts.map(a => this.formatAlertResponse(a)),
      total,
    };
  }

  async findPending() {
    const alerts = await this.alertsRepository.find({
      where: { status: 'pending' },
      order: { createdAt: 'DESC' },
    });
    return {
      alerts: alerts.map(a => this.formatAlertResponse(a)),
      total: alerts.length,
    };
  }

  async findById(id: string) {
    const alert = await this.alertsRepository.findOne({
      where: { id },
      relations: ['reads'],
    });

    if (!alert) {
      throw new NotFoundException('Alert not found');
    }

    return this.formatAlertResponse(alert);
  }

  async create(
    createData: {
      title: string;
      message: string;
      category: 'rain' | 'flood' | 'evacuation' | 'roadBlocked' | 'info';
      level: 'high' | 'medium' | 'low';
      area: string;
      targetZoneId?: string;
    },
    user: ActorUser,
  ) {
    const autoValidated = user.role === 'authority' || user.role === 'admin';

    const alert = this.alertsRepository.create({
      title: createData.title,
      message: createData.message,
      category: createData.category,
      level: createData.level,
      area: createData.area,
      targetZoneId: createData.targetZoneId,
      createdBy: user.id,
      status: autoValidated ? 'validated' : 'pending',
      validatedBy: autoValidated ? user.id : null,
      validatedAt: autoValidated ? new Date() : null,
    });

    const saved = await this.alertsRepository.save(alert);
    const formatted = this.formatAlertResponse(saved);

    if (autoValidated) {
      this.eventEmitter.emit(
        'alert.validated',
        new AlertValidatedEvent(formatted, createData.targetZoneId, createData.area),
      );
    } else {
      this.eventEmitter.emit('alert.pending', new AlertPendingEvent(formatted));
    }

    return formatted;
  }

  async validate(alertId: string, admin: ActorUser) {
    if (admin.role !== 'admin') {
      throw new ForbiddenException('Only admin can validate alerts');
    }

    const alert = await this.alertsRepository.findOne({ where: { id: alertId } });
    if (!alert) {
      throw new NotFoundException('Alert not found');
    }
    if (alert.status === 'validated') {
      throw new BadRequestException('Alert already validated');
    }
    if (alert.status === 'rejected') {
      throw new BadRequestException('Cannot validate a rejected alert');
    }

    alert.status = 'validated';
    alert.validatedBy = admin.id;
    alert.validatedAt = new Date();
    alert.rejectionReason = null;

    const saved = await this.alertsRepository.save(alert);
    const formatted = this.formatAlertResponse(saved);

    this.eventEmitter.emit(
      'alert.validated',
      new AlertValidatedEvent(formatted, saved.targetZoneId, saved.area),
    );

    return formatted;
  }

  async reject(alertId: string, admin: ActorUser, reason?: string) {
    if (admin.role !== 'admin') {
      throw new ForbiddenException('Only admin can reject alerts');
    }

    const alert = await this.alertsRepository.findOne({ where: { id: alertId } });
    if (!alert) {
      throw new NotFoundException('Alert not found');
    }
    if (alert.status === 'validated') {
      throw new BadRequestException('Cannot reject an already validated alert');
    }
    if (alert.status === 'rejected') {
      throw new BadRequestException('Alert already rejected');
    }

    alert.status = 'rejected';
    alert.validatedBy = admin.id;
    alert.validatedAt = new Date();
    alert.rejectionReason = reason || null;

    const saved = await this.alertsRepository.save(alert);
    return this.formatAlertResponse(saved);
  }

  async markAsRead(userId: string, alertId: string) {
    const existing = await this.alertReadsRepository.findOne({
      where: { userId, alertId },
    });

    if (existing) {
      return { success: true };
    }

    const read = this.alertReadsRepository.create({
      userId,
      alertId,
      readAt: new Date(),
    });

    await this.alertReadsRepository.save(read);
    return { success: true };
  }

  async markAllAsRead(userId: string) {
    // Only count validated alerts when bulk-marking
    const alerts = await this.alertsRepository.find({
      where: { status: 'validated' },
      select: ['id'],
    });

    const existingReads = await this.alertReadsRepository
      .createQueryBuilder('read')
      .select('read.alertId')
      .where('read.userId = :userId', { userId })
      .getRawMany();

    const existingAlertIds = new Set(existingReads.map(r => r.read_alertId));

    const readsToCreate = alerts
      .filter(alert => !existingAlertIds.has(alert.id))
      .map(alert =>
        this.alertReadsRepository.create({
          userId,
          alertId: alert.id,
          readAt: new Date(),
        }),
      );

    if (readsToCreate.length > 0) {
      await this.alertReadsRepository.save(readsToCreate);
    }

    return { success: true, markedRead: readsToCreate.length };
  }

  async getUnreadCount(userId: string) {
    const totalAlerts = await this.alertsRepository.count({ where: { status: 'validated' } });
    const readCount = await this.alertReadsRepository.count({
      where: { userId },
    });

    return Math.max(0, totalAlerts - readCount);
  }

  async getAlertsForUser(userId: string, limit = 20, offset = 0) {
    const alerts = await this.findAll({ limit, offset, userId });

    const sorted = alerts.alerts.sort(
      (a: { read?: boolean; createdAt: Date }, b: { read?: boolean; createdAt: Date }) => {
        if (a.read === b.read) {
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        }
        return a.read ? 1 : -1;
      },
    );

    return { ...alerts, alerts: sorted };
  }

  private formatAlertResponse(alert: AlertEntity) {
    return {
      id: alert.id,
      title: alert.title,
      message: alert.message,
      category: alert.category,
      level: alert.level,
      area: alert.area,
      targetZoneId: alert.targetZoneId,
      status: alert.status,
      createdBy: alert.createdBy,
      validatedBy: alert.validatedBy,
      validatedAt: alert.validatedAt,
      rejectionReason: alert.rejectionReason,
      createdAt: alert.createdAt,
    };
  }
}
