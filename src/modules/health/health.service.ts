import { Injectable } from '@nestjs/common';

@Injectable()
export class HealthService {
  check() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  }

  readiness() {
    return {
      status: 'ready',
      timestamp: new Date().toISOString(),
    };
  }

  liveness() {
    return {
      status: 'alive',
      timestamp: new Date().toISOString(),
    };
  }
}
