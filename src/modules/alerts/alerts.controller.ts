import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Query,
  Param,
  UseGuards,
  HttpCode,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { AlertsService } from './alerts.service';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { Roles } from '@/common/decorators/roles.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { CreateAlertDto, AuthUser } from '@/common/dtos';

@ApiTags('Alerts')
@Controller('v1/alerts')
export class AlertsController {
  constructor(private readonly alertsService: AlertsService) {}

  @Get()
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Get alerts with pagination. Public sees only validated; admins can pass status=pending|all',
  })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  @ApiQuery({
    name: 'category',
    required: false,
    enum: ['rain', 'flood', 'evacuation', 'roadBlocked', 'info'],
  })
  @ApiQuery({ name: 'level', required: false, enum: ['high', 'medium', 'low'] })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['pending', 'validated', 'rejected', 'all'],
  })
  async getAlerts(
    @Query()
    query: {
      limit?: number;
      offset?: number;
      category?: string;
      level?: string;
      status?: 'pending' | 'validated' | 'rejected' | 'all';
    },
    @CurrentUser() user?: AuthUser,
  ) {
    const result = await this.alertsService.findAll({
      ...query,
      userId: user?.id,
      viewerRole: user?.role,
    });

    return {
      alerts: result.alerts,
      total: result.total,
    };
  }

  @Get('pending')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get pending alerts awaiting admin validation' })
  async getPending() {
    return this.alertsService.findPending();
  }

  @Get('unread-count')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get unread alerts count' })
  async getUnreadCount(@CurrentUser() user: AuthUser) {
    const count = await this.alertsService.getUnreadCount(user.id);
    return { count };
  }

  @Get('my-alerts')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get alerts for current user (unread first)' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  async getMyAlerts(
    @CurrentUser() user: AuthUser,
    @Query() query: { limit?: number; offset?: number },
  ) {
    return this.alertsService.getAlertsForUser(user.id, query.limit, query.offset);
  }

  @Get(':id')
  @HttpCode(200)
  @ApiOperation({ summary: 'Get alert by ID' })
  async getAlert(@Param('id') id: string) {
    return this.alertsService.findById(id);
  }

  @Post()
  @HttpCode(201)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary:
      'Create alert. Citizens create as pending; authority/admin auto-validated.',
  })
  async createAlert(@Body() dto: CreateAlertDto, @CurrentUser() user: AuthUser) {
    return this.alertsService.create(
      {
        title: dto.title,
        message: dto.message,
        category: dto.category,
        level: dto.level,
        area: dto.area,
        targetZoneId: dto.targetZoneId,
      },
      { id: user.id, role: user.role },
    );
  }

  @Post(':id/validate')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Validate a pending alert (admin only)' })
  async validateAlert(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.alertsService.validate(id, { id: user.id, role: user.role });
  }

  @Post(':id/reject')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Reject a pending alert (admin only)' })
  async rejectAlert(
    @Param('id') id: string,
    @Body() body: { reason?: string },
    @CurrentUser() user: AuthUser,
  ) {
    return this.alertsService.reject(id, { id: user.id, role: user.role }, body?.reason);
  }

  @Patch(':id/read')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Mark alert as read' })
  async markAsRead(@Param('id') alertId: string, @CurrentUser() user: AuthUser) {
    const success = await this.alertsService.markAsRead(user.id, alertId);
    return { success };
  }

  @Post('mark-all-read')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Mark all alerts as read' })
  async markAllAsRead(@CurrentUser() user: AuthUser) {
    const result = await this.alertsService.markAllAsRead(user.id);
    return { success: true, markedRead: result.markedRead };
  }
}
