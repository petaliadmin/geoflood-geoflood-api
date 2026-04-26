import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotificationTokenEntity } from '../zones/entities/zone.entity';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(NotificationTokenEntity)
    private tokenRepository: Repository<NotificationTokenEntity>,
  ) {}

  async registerToken(data: { userId: string; fcmToken: string; platform: 'android' | 'ios' }) {
    // Check if token already exists
    const existing = await this.tokenRepository.findOne({
      where: { fcmToken: data.fcmToken },
    });

    if (existing) {
      if (existing.userId === data.userId) {
        // Update token for same user
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
    const tokens = await this.tokenRepository.find({
      where: { userId },
    });

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
}
