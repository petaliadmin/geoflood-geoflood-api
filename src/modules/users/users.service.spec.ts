import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { UsersService } from './users.service';
import { UserEntity } from './entities/user.entity';

const mockUser: Partial<UserEntity> = {
  id: 'user-1',
  fullName: 'Test User',
  email: 'test@example.com',
  phone: '+221770001122',
  role: 'citizen',
  avatarUrl: null,
  city: 'Dakar',
  locale: 'fr',
  pushAlertsEnabled: true,
  locationAlertsEnabled: true,
  themeMode: 'system',
  createdAt: new Date('2024-01-01'),
};

describe('UsersService', () => {
  let service: UsersService;
  let repository: Record<string, jest.Mock>;

  beforeEach(async () => {
    repository = {
      findOne: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getRepositoryToken(UserEntity), useValue: repository },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  describe('findById', () => {
    it('should return formatted user', async () => {
      repository.findOne.mockResolvedValue(mockUser);
      const result = await service.findById('user-1');
      expect(result.id).toBe('user-1');
      expect(result.email).toBe('test@example.com');
    });

    it('should throw NotFoundException', async () => {
      repository.findOne.mockResolvedValue(null);
      await expect(service.findById('unknown')).rejects.toThrow(NotFoundException);
    });
  });

  describe('findByEmail', () => {
    it('should return user by email', async () => {
      repository.findOne.mockResolvedValue(mockUser);
      const result = await service.findByEmail('test@example.com');
      expect(result.fullName).toBe('Test User');
    });

    it('should throw NotFoundException', async () => {
      repository.findOne.mockResolvedValue(null);
      await expect(service.findByEmail('none@example.com')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should update and return user', async () => {
      repository.update.mockResolvedValue({});
      repository.findOne.mockResolvedValue({ ...mockUser, city: 'Thies' });

      const result = await service.update('user-1', { city: 'Thies' } as Partial<UserEntity>);
      expect(result.city).toBe('Thies');
    });
  });

  describe('delete', () => {
    it('should delete user', async () => {
      repository.delete.mockResolvedValue({});
      const result = await service.delete('user-1');
      expect(result.message).toBe('User deleted successfully');
    });
  });
});
