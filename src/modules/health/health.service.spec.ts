import { HealthService } from './health.service';

describe('HealthService', () => {
  let service: HealthService;

  beforeEach(() => {
    service = new HealthService();
  });

  describe('check', () => {
    it('should return ok status', () => {
      const result = service.check();
      expect(result.status).toBe('ok');
      expect(result.timestamp).toBeDefined();
      expect(result.uptime).toBeGreaterThanOrEqual(0);
    });
  });

  describe('readiness', () => {
    it('should return ready status', () => {
      const result = service.readiness();
      expect(result.status).toBe('ready');
      expect(result.timestamp).toBeDefined();
    });
  });

  describe('liveness', () => {
    it('should return alive status', () => {
      const result = service.liveness();
      expect(result.status).toBe('alive');
      expect(result.timestamp).toBeDefined();
    });
  });
});
