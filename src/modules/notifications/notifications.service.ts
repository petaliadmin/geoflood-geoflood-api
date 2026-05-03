import { Injectable, Logger, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { NotificationTokenEntity } from '../zones/entities/zone.entity';
import { UserEntity } from '../users/entities/user.entity';

export interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
}

export interface PushResult {
  attempted: number;
  delivered: number;
  failed: number;
  skipped: boolean;
  reason?: string;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private firebaseAdmin: any = null;
  private initialized = false;

  constructor(
    @InjectRepository(NotificationTokenEntity)
    private tokenRepository: Repository<NotificationTokenEntity>,
    @InjectRepository(UserEntity)
    private userRepository: Repository<UserEntity>,
    private configService: ConfigService,
  ) {
    void this.initFirebase();
  }

  // -------- Token management --------

  async registerToken(data: { userId: string; fcmToken: string; platform: 'android' | 'ios' }) {
    const existing = await this.tokenRepository.findOne({
      where: { fcmToken: data.fcmToken },
    });

    if (existing) {
      if (existing.userId === data.userId) {
        existing.platform = data.platform;
        existing.updatedAt = new Date();
        return this.tokenRepository.save(existing);
      } else {
        throw new ConflictException('Token already registered to another user');
      }
    }

    const token = this.tokenRepository.create({
      userId: data.userId,
      fcmToken: data.fcmToken,
      platform: data.platform,
    });

    return this.tokenRepository.save(token);
  }

  async unregisterToken(userId: string, fcmToken: string) {
    const token = await this.tokenRepository.findOne({
      where: { userId, fcmToken },
    });

    if (!token) {
      throw new NotFoundException('Token not found');
    }

    await this.tokenRepository.remove(token);
    return { success: true };
  }

  async getUserTokens(userId: string): Promise<string[]> {
    const tokens = await this.tokenRepository.find({ where: { userId } });
    return tokens.map(t => t.fcmToken);
  }

  async updateToken(userId: string, oldToken: string, newToken: string) {
    const existing = await this.tokenRepository.findOne({
      where: { fcmToken: oldToken, userId },
    });

    if (!existing) {
      throw new NotFoundException('Old token not found');
    }

    existing.fcmToken = newToken;
    existing.updatedAt = new Date();
    return this.tokenRepository.save(existing);
  }

  // -------- Push delivery --------

  async sendToUsers(userIds: string[], payload: PushPayload): Promise<PushResult> {
    if (userIds.length === 0) {
      return { attempted: 0, delivered: 0, failed: 0, skipped: true, reason: 'no_users' };
    }
    const tokens = await this.tokenRepository.find({ where: { userId: In(userIds) } });
    return this.sendToTokens(tokens.map(t => t.fcmToken), payload);
  }

  async sendToCity(city: string, payload: PushPayload): Promise<PushResult> {
    const users = await this.userRepository.find({
      where: { city, pushAlertsEnabled: true },
      select: ['id'],
    });
    if (users.length === 0) {
      return { attempted: 0, delivered: 0, failed: 0, skipped: true, reason: 'no_users_in_city' };
    }
    return this.sendToUsers(users.map(u => u.id), payload);
  }

  async sendToRole(role: 'citizen' | 'authority' | 'admin', payload: PushPayload): Promise<PushResult> {
    const users = await this.userRepository.find({
      where: { role, pushAlertsEnabled: true },
      select: ['id'],
    });
    if (users.length === 0) {
      return { attempted: 0, delivered: 0, failed: 0, skipped: true, reason: 'no_users_with_role' };
    }
    return this.sendToUsers(users.map(u => u.id), payload);
  }

  async sendToZone(_zoneId: string, payload: PushPayload, fallbackCity?: string): Promise<PushResult> {
    // Per-zone subscription is not modeled at user level today. Fallback to city.
    if (fallbackCity) {
      return this.sendToCity(fallbackCity, payload);
    }
    return { attempted: 0, delivered: 0, failed: 0, skipped: true, reason: 'no_zone_subscription_model' };
  }

  private async sendToTokens(tokens: string[], payload: PushPayload): Promise<PushResult> {
    if (tokens.length === 0) {
      return { attempted: 0, delivered: 0, failed: 0, skipped: true, reason: 'no_tokens' };
    }

    if (!this.initialized || !this.firebaseAdmin) {
      this.logger.warn(
        `FCM not configured; would have pushed to ${tokens.length} token(s): "${payload.title}"`,
      );
      return {
        attempted: tokens.length,
        delivered: 0,
        failed: 0,
        skipped: true,
        reason: 'firebase_not_configured',
      };
    }

    try {
      const message = {
        notification: { title: payload.title, body: payload.body },
        data: payload.data || {},
        tokens,
      };
      const response = await this.firebaseAdmin.messaging().sendEachForMulticast(message);

      // Cleanup invalid tokens
      const invalidTokens: string[] = [];
      response.responses.forEach((r: any, idx: number) => {
        if (!r.success) {
          const code = r.error?.code as string;
          if (
            code === 'messaging/registration-token-not-registered' ||
            code === 'messaging/invalid-registration-token'
          ) {
            invalidTokens.push(tokens[idx]);
          }
        }
      });
      if (invalidTokens.length > 0) {
        await this.tokenRepository.delete({ fcmToken: In(invalidTokens) });
      }

      return {
        attempted: tokens.length,
        delivered: response.successCount,
        failed: response.failureCount,
        skipped: false,
      };
    } catch (err: any) {
      this.logger.error(`FCM send failed: ${err.message}`);
      return {
        attempted: tokens.length,
        delivered: 0,
        failed: tokens.length,
        skipped: false,
        reason: err.message,
      };
    }
  }

  private async initFirebase() {
    try {
      const projectId = this.configService.get<string>('FIREBASE_PROJECT_ID');
      const clientEmail = this.configService.get<string>('FIREBASE_CLIENT_EMAIL');
      const privateKey = this.configService.get<string>('FIREBASE_PRIVATE_KEY');

      if (!projectId || !clientEmail || !privateKey) {
        this.logger.warn(
          'Firebase credentials not set (FIREBASE_PROJECT_ID/CLIENT_EMAIL/PRIVATE_KEY). FCM disabled.',
        );
        return;
      }

      // Lazy import so the dependency is optional at install time
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let admin: any = null;
      try {
        admin = await import('firebase-admin' as any);
      } catch {
        admin = null;
      }
      if (!admin) {
        this.logger.warn('firebase-admin package not installed. FCM disabled.');
        return;
      }

      // firebase-admin exports may be either default or namespace depending on version
      const adminApi = admin.default ?? admin;

      if (adminApi.apps.length === 0) {
        adminApi.initializeApp({
          credential: adminApi.credential.cert({
            projectId,
            clientEmail,
            privateKey: privateKey.replace(/\\n/g, '\n'),
          }),
        });
      }

      this.firebaseAdmin = adminApi;
      this.initialized = true;
      this.logger.log('Firebase Admin initialized for FCM');
    } catch (err: any) {
      this.logger.error(`Failed to initialize Firebase Admin: ${err.message}`);
    }
  }
}
