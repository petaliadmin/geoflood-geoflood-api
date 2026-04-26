import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { UserEntity } from '../users/entities/user.entity';

jest.mock('bcrypt');

const mockUser: Partial<UserEntity> = {
  id: 'user-1',
  email: 'test@example.com',
  phone: '+221770001122',
  fullName: 'Test User',
  passwordHash: 'hashed-password',
  role: 'citizen',
  avatarUrl: null,
  city: 'Dakar',
  locale: 'fr',
  pushAlertsEnabled: true,
  locationAlertsEnabled: true,
  themeMode: 'system',
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
};

describe('AuthService', () => {
  let service: AuthService;
  let usersRepository: Record<string, jest.Mock>;
  let jwtService: Record<string, jest.Mock>;

  beforeEach(async () => {
    usersRepository = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
    };

    jwtService = {
      sign: jest.fn().mockReturnValue('jwt-token'),
      verify: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getRepositoryToken(UserEntity), useValue: usersRepository },
        { provide: JwtService, useValue: jwtService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  describe('register', () => {
    it('should register a new user', async () => {
      usersRepository.findOne.mockResolvedValue(null);
      (bcrypt.genSalt as jest.Mock).mockResolvedValue('salt');
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed');
      usersRepository.create.mockReturnValue(mockUser);
      usersRepository.save.mockResolvedValue(mockUser);

      const result = await service.register({
        email: 'test@example.com',
        phone: '+221770001122',
        password: 'password123',
        fullName: 'Test User',
      });

      expect(result.accessToken).toBe('jwt-token');
      expect(result.user.email).toBe('test@example.com');
    });

    it('should throw if user already exists', async () => {
      usersRepository.findOne.mockResolvedValue(mockUser);

      await expect(
        service.register({
          email: 'test@example.com',
          phone: '+221770001122',
          password: 'password123',
          fullName: 'Test User',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('validateCredentials', () => {
    it('should return user for valid credentials', async () => {
      usersRepository.findOne.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.validateCredentials('test@example.com', 'password123');
      expect(result.id).toBe('user-1');
    });

    it('should throw for invalid password', async () => {
      usersRepository.findOne.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(service.validateCredentials('test@example.com', 'wrong')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw for non-existent user', async () => {
      usersRepository.findOne.mockResolvedValue(null);

      await expect(service.validateCredentials('none@example.com', 'pass')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('validateUser', () => {
    it('should return user by id', async () => {
      usersRepository.findOne.mockResolvedValue(mockUser);
      const result = await service.validateUser('user-1');
      expect(result.email).toBe('test@example.com');
    });

    it('should throw if user not found', async () => {
      usersRepository.findOne.mockResolvedValue(null);
      await expect(service.validateUser('unknown')).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('generateTokens', () => {
    it('should return tokens and user data', async () => {
      const result = await service.generateTokens(mockUser as UserEntity);
      expect(result.accessToken).toBe('jwt-token');
      expect(result.refreshToken).toBe('jwt-token');
      expect(result.user.id).toBe('user-1');
    });
  });

  describe('refreshToken', () => {
    it('should generate new tokens for valid refresh token', async () => {
      jwtService.verify.mockReturnValue({ id: 'user-1' });
      usersRepository.findOne.mockResolvedValue(mockUser);

      const result = await service.refreshToken('valid-refresh');
      expect(result.accessToken).toBe('jwt-token');
    });

    it('should throw for invalid refresh token', async () => {
      jwtService.verify.mockImplementation(() => {
        throw new Error('invalid');
      });

      await expect(service.refreshToken('bad-token')).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('sendOtp', () => {
    it('should send OTP for existing user', async () => {
      usersRepository.findOne.mockResolvedValue(mockUser);
      usersRepository.update.mockResolvedValue({});

      const result = await service.sendOtp('+221770001122');
      expect(result.message).toBe('OTP sent successfully');
    });

    it('should throw for non-existent phone', async () => {
      usersRepository.findOne.mockResolvedValue(null);
      await expect(service.sendOtp('+221999999999')).rejects.toThrow(BadRequestException);
    });
  });

  describe('forgotPassword', () => {
    it('should return message even if user not found', async () => {
      usersRepository.findOne.mockResolvedValue(null);
      const result = await service.forgotPassword('none@example.com');
      expect(result.message).toContain('If email exists');
    });
  });
});
