import { UnauthorizedException } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

const mockAuthService = {
  register: jest.fn(),
  login: jest.fn(),
  refreshToken: jest.fn(),
  sendOtp: jest.fn(),
  verifyOtp: jest.fn(),
  forgotPassword: jest.fn(),
  resetPassword: jest.fn(),
  generateTokens: jest.fn(),
};

describe('AuthController', () => {
  let controller: AuthController;

  beforeEach(() => {
    controller = new AuthController(mockAuthService as unknown as AuthService);
    jest.clearAllMocks();
  });

  it('should register a user', async () => {
    mockAuthService.register.mockResolvedValue({ accessToken: 'token' });
    const result = await controller.register({
      email: 'test@test.com',
      phone: '+221770001122',
      password: 'pass123',
      fullName: 'Test',
    });
    expect(result.accessToken).toBe('token');
  });

  it('should login a user', async () => {
    mockAuthService.login.mockResolvedValue({ accessToken: 'token' });
    const result = await controller.login({ email: 'test@test.com', password: 'pass123' });
    expect(result.accessToken).toBe('token');
  });

  it('should refresh token', async () => {
    mockAuthService.refreshToken.mockResolvedValue({ accessToken: 'new-token' });
    const result = await controller.refresh({ refreshToken: 'old-token' });
    expect(result.accessToken).toBe('new-token');
  });

  it('should logout', async () => {
    const result = await controller.logout({ id: 'user-1', email: 'test@test.com', role: 'citizen' });
    expect(result.message).toBe('Logged out successfully');
  });

  it('should throw on google callback without user', async () => {
    const req = { user: undefined } as never;
    await expect(controller.googleAuthCallback(req)).rejects.toThrow(UnauthorizedException);
  });
});
