import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let controller: AppController;
  let service: AppService;

  beforeEach(() => {
    service = new AppService();
    controller = new AppController(service);
  });

  it('should return welcome message', () => {
    expect(controller.getHello()).toBe('Welcome to GeoFlood Backend API 🌊');
  });
});
