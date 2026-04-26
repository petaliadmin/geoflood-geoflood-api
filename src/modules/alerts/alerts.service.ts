import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AlertEntity, AlertReadEntity } from '../zones/entities/zone.entity';

// Event payloads
export class AlertCreatedEvent {
  constructor(
    public alert: any,
    public targetZoneId?: string,
    public targetCity?: string,
  ) {}
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
    userId?: string;
  }) {
    const limit = query?.limit || 20;
    const offset = query?.offset || 0;

    let qb = this.alertsRepository
      .createQueryBuilder('alert')
      .leftJoinAndSelect('alert.reads', 'read')
      .orderBy('alert.createdAt', 'DESC')
      .take(limit)
      .skip(offset);

    if (query?.category) {
      qb = qb.andWhere('alert.category = :category', { category: query.category });
    }

    if (query?.level) {
      qb = qb.andWhere('alert.level = :level', { level: query.level });
    }

    const [alerts, total] = await qb.getManyAndCount();

    // Add read status for specific user if userId provided
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

  async create(createData: {
    title: string;
    message: string;
    category: 'rain' | 'flood' | 'evacuation' | 'roadBlocked' | 'info';
    level: 'high' | 'medium' | 'low';
    area: string;
    targetZoneId?: string;
  }) {
    const alert = this.alertsRepository.create({
      title: createData.title,
      message: createData.message,
      category: createData.category,
      level: createData.level,
      area: createData.area,
    });

    const saved = await this.alertsRepository.save(alert);

    // Emit event for WebSocket broadcast
    this.eventEmitter.emit(
      'alert.created',
      new AlertCreatedEvent(
        this.formatAlertResponse(saved),
        createData.targetZoneId,
        createData.area,
      ),
    );

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
    // Get all unread alert IDs
    const alerts = await this.alertsRepository.find({
      select: ['id'],
    });

    const existingReads = await this.alertReadsRepository
      .createQueryBuilder('read')
      .select('read.alertId')
      .where('read.userId = :userId', { userId })
      .getRawMany();

    const existingAlertIds = new Set(existingReads.map(r => r.read_alertId));

    // Create read records for unread alerts
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
    const totalAlerts = await this.alertsRepository.count();
    const readCount = await this.alertReadsRepository.count({
      where: { userId },
    });

    return Math.max(0, totalAlerts - readCount);
  }

  async getAlertsForUser(userId: string, limit = 20, offset = 0) {
    // Get all alerts with read status for user
    const alerts = await this.findAll({ limit, offset, userId });

    // Sort unread first, then by date
    const sorted = alerts.alerts.sort((a: any, b: any) => {
      if (a.read === b.read) {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
      return a.read ? 1 : -1;
    });

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
      createdAt: alert.createdAt,
    };
  }
}
