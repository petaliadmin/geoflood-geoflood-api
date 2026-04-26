import { UsersController } from './users.controller';
import { UsersService } from './users.service';

const mockUsersService = {
  findById: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
};

const mockUser = { id: 'user-1', email: 'test@test.com', role: 'citizen' as const };

describe('UsersController', () => {
  let controller: UsersController;

  beforeEach(() => {
    controller = new UsersController(mockUsersService as unknown as UsersService);
    jest.clearAllMocks();
  });

  it('should get profile', async () => {
    mockUsersService.findById.mockResolvedValue({ id: 'user-1', fullName: 'Test' });
    const result = await controller.getProfile(mockUser);
    expect(mockUsersService.findById).toHaveBeenCalledWith('user-1');
    expect(result.id).toBe('user-1');
  });

  it('should update profile', async () => {
    mockUsersService.update.mockResolvedValue({ id: 'user-1', city: 'Thies' });
    const result = await controller.updateProfile(mockUser, { city: 'Thies' });
    expect(result.city).toBe('Thies');
  });

  it('should update settings', async () => {
    mockUsersService.update.mockResolvedValue({ id: 'user-1', locale: 'en' });
    const result = await controller.updateSettings(mockUser, { locale: 'en' });
    expect(result.locale).toBe('en');
  });

  it('should delete account', async () => {
    mockUsersService.delete.mockResolvedValue({ message: 'User deleted successfully' });
    const result = await controller.deleteAccount(mockUser);
    expect(result.message).toBe('User deleted successfully');
  });
});
