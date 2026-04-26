import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { CurrentUser } from '@/common/decorators/current-user.decorator';

@ApiTags('Dashboard')
@Controller('v1/dashboard')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('access-token')
export class DashboardController {
  @Get()
  @ApiOperation({ summary: 'Get user dashboard' })
  async getDashboard(@CurrentUser() _user: any) {
    return {
      weather: {
        city: 'Dakar',
        tempC: 28,
        condition: 'cloudy',
        rainChance: 20,
        humidity: 65,
        windKmh: 12,
      },
      neighborhoodRisk: 'medium',
      activeAlerts: 3,
      riskScore: 45,
    };
  }

  @Get('zones-at-risk')
  @ApiOperation({ summary: 'Get zones at risk' })
  async getZonesAtRisk() {
    return {
      zones: [] as any[],
      total: 0,
    };
  }
}
