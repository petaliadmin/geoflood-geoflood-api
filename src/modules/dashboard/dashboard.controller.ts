import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { DashboardDataDto, AuthUser } from '@/common/dtos';

@ApiTags('Dashboard')
@Controller('v1/dashboard')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('access-token')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get()
  @ApiOperation({ summary: 'Get dashboard data for current user' })
  @ApiQuery({ name: 'city', required: false })
  @ApiQuery({ name: 'lat', required: false, type: Number })
  @ApiQuery({ name: 'lng', required: false, type: Number })
  async getDashboard(
    @Query() query: { city?: string; lat?: number; lng?: number },
    @CurrentUser() user: AuthUser,
  ): Promise<DashboardDataDto> {
    return this.dashboardService.getDashboardData(user.id, query);
  }
}
