import { AdminController } from './admin.controller';

describe('AdminController', () => {
  let controller: AdminController;

  beforeEach(() => {
    controller = new AdminController();
  });

  describe('getDashboard', () => {
    it('should return admin dashboard data', async () => {
      const result = await controller.getDashboard();
      expect(result.criticalZones).toBe(5);
      expect(result.reports24h).toBe(42);
      expect(result.evacuationsActive).toBe(2);
      expect(result.closedRoads).toBe(3);
      expect(result.recentReports).toEqual([]);
      expect(result.zonesWithRisk).toEqual([]);
    });
  });

  describe('getStatistics', () => {
    it('should return statistics', async () => {
      const result = await controller.getStatistics({});
      expect(result.reportsByHour).toEqual([]);
      expect(result.reportsByZone).toEqual([]);
    });
  });

  describe('export', () => {
    it('should return export started message', async () => {
      const result = await controller.export({ format: 'csv' });
      expect(result.message).toBe('Export started');
    });
  });
});
