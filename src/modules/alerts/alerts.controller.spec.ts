import { AlertsController } from './alerts.controller';
import { AlertsService } from './alerts.service';
import { AuthUser } from '@/common/dtos';

const mockAlertsService = {
  findAll: jest.fn(),
  findById: jest.fn(),
  create: jest.fn(),
  markAsRead: jest.fn(),
  markAllAsRead: jest.fn(),
  getUnreadCount: jest.fn(),
  getAlertsForUser: jest.fn(),
};

const mockUser: AuthUser = { id: 'user-1', email: 'test@test.com', role: 'citizen' };

describe('AlertsController', () => {
  let controller: AlertsController;

  beforeEach(() => {
    controller = new AlertsController(mockAlertsService as unknown as AlertsService);
    jest.clearAllMocks();
  });

  it('should get alerts', async () => {
    mockAlertsService.findAll.mockResolvedValue({ alerts: [], total: 0 });
    const result = await controller.getAlerts({});
    expect(result.total).toBe(0);
  });

  it('should get unread count', async () => {
    mockAlertsService.getUnreadCount.mockResolvedValue(5);
    const result = await controller.getUnreadCount(mockUser);
    expect(result.count).toBe(5);
  });

  it('should get alert by id', async () => {
    mockAlertsService.findById.mockResolvedValue({ id: 'alert-1' });
    const result = await controller.getAlert('alert-1');
    expect(result.id).toBe('alert-1');
  });

  it('should mark alert as read', async () => {
    mockAlertsService.markAsRead.mockResolvedValue({ success: true });
    const result = await controller.markAsRead('alert-1', mockUser);
    expect(result.success).toEqual({ success: true });
  });

  it('should mark all alerts as read', async () => {
    mockAlertsService.markAllAsRead.mockResolvedValue({ success: true, markedRead: 3 });
    const result = await controller.markAllAsRead(mockUser);
    expect(result.markedRead).toBe(3);
  });
});
