import { Controller, Get, HttpCode } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { HealthService } from './health.service';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @HttpCode(200)
  @ApiOperation({ summary: 'Health check' })
  @ApiResponse({ status: 200, description: 'Service is healthy' })
  checkHealth() {
    return this.healthService.check();
  }

  @Get('ready')
  @ApiOperation({ summary: 'Readiness probe' })
  readiness() {
    return this.healthService.readiness();
  }

  @Get('live')
  @ApiOperation({ summary: 'Liveness probe' })
  liveness() {
    return this.healthService.liveness();
  }
}
