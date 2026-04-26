import { Controller, Get, Post, Body, UseGuards, HttpCode, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { Roles } from '@/common/decorators/roles.decorator';

@ApiTags('Admin')
@Controller('v1/admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@ApiBearerAuth('access-token')
export class AdminController {
  @Get('dashboard')
  @HttpCode(200)
  @ApiOperation({ summary: 'Get admin dashboard data' })
  async getDashboard() {
    return {
      criticalZones: 5,
      reports24h: 42,
      evacuationsActive: 2,
      closedRoads: 3,
      recentReports: [] as Record<string, unknown>[],
      zonesWithRisk: [] as Record<string, unknown>[],
    };
  }

  @Get('statistics')
  @HttpCode(200)
  @ApiOperation({ summary: 'Get statistics' })
  async getStatistics(@Query() _query: Record<string, string>) {
    return {
      reportsByHour: [] as Record<string, unknown>[],
      reportsByZone: [] as Record<string, unknown>[],
    };
  }

  @Post('export')
  @HttpCode(200)
  @ApiOperation({ summary: 'Export data' })
  async export(@Body() _body: { format: 'csv' | 'json' }) {
    return { message: 'Export started' };
  }
}
