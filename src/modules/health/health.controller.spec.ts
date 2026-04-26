import { HealthController } from './health.controller';
import { HealthService } from './health.service';

describe('HealthController', () => {
  let controller: HealthController;
  let service: HealthService;

  beforeEach(() => {
    service = new HealthService();
    controller = new HealthController(service);
  });

  it('should return health check', () => {
    const result = controller.checkHealth();
    expect(result.status).toBe('ok');
  });

  it('should return readiness', () => {
    const result = controller.readiness();
    expect(result.status).toBe('ready');
  });

  it('should return liveness', () => {
    const result = controller.liveness();
    expect(result.status).toBe('alive');
  });
});
