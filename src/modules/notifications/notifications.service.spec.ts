import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { NotificationTokenEntity } from '../zones/entities/zone.entity';

const mockToken: Partial<NotificationTokenEntity> = {
  id: 'token-1',
  userId: 'user-1',
  fcmToken: 'fcm-abc-123',
  platform: 'android',
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('NotificationsService', () => {
  let service: NotificationsService;
  let repository: Record<string, jest.Mock>;

  beforeEach(async () => {
    repository = {
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn().mockReturnValue(mockToken),
      save: jest.fn().mockResolvedValue(mockToken),
      remove: jest.fn().mockResolvedValue({}),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: getRepositoryToken(NotificationTokenEntity), useValue: repository },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
  });

  describe('registerToken', () => {
    it('should register a new token', async () => {
      repository.findOne.mockResolvedValue(null);
      const result = await service.registerToken({
        userId: 'user-1',
        fcmToken: 'fcm-abc-123',
        platform: 'android',
      });
      expect(repository.create).toHaveBeenCalled();
      expect(result.fcmToken).toBe('fcm-abc-123');
    });

    it('should update existing token for same user', async () => {
      repository.findOne.mockResolvedValue({ ...mockToken });
      const result = await service.registerToken({
        userId: 'user-1',
        fcmToken: 'fcm-abc-123',
        platform: 'ios',
      });
      expect(repository.save).toHaveBeenCalled();
    });

    it('should throw ConflictException for different user', async () => {
      repository.findOne.mockResolvedValue({ ...mockToken, userId: 'other-user' });
      await expect(
        service.registerToken({ userId: 'user-1', fcmToken: 'fcm-abc-123', platform: 'android' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('unregisterToken', () => {
    it('should remove token', async () => {
      repository.findOne.mockResolvedValue(mockToken);
      const result = await service.unregisterToken('user-1', 'fcm-abc-123');
      expect(result.success).toBe(true);
    });

    it('should throw NotFoundException', async () => {
      repository.findOne.mockResolvedValue(null);
      await expect(service.unregisterToken('user-1', 'unknown')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getUserTokens', () => {
    it('should return user token strings', async () => {
      repository.find.mockResolvedValue([mockToken]);
      const result = await service.getUserTokens('user-1');
      expect(result).toEqual(['fcm-abc-123']);
    });
  });
});
