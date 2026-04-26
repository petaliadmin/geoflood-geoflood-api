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
import { CreateAlertDto } from '@/common/dtos';

@ApiTags('Alerts')
@Controller('v1/alerts')
export class AlertsController {
  constructor(private readonly alertsService: AlertsService) {}

  @Get()
  @HttpCode(200)
  @ApiOperation({ summary: 'Get all alerts with pagination' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  @ApiQuery({ name: 'category', required: false, enum: ['rain', 'flood', 'evacuation', 'roadBlocked', 'info'] })
  @ApiQuery({ name: 'level', required: false, enum: ['high', 'medium', 'low'] })
  async getAlerts(
    @Query() query: {
      limit?: number;
      offset?: number;
      category?: string;
      level?: string;
    },
    @CurrentUser() user?: any,
  ) {
    const result = await this.alertsService.findAll({
      ...query,
      userId: user?.id,
    });

    return {
      alerts: result.alerts,
      total: result.total,
    };
  }

  @Get('unread-count')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get unread alerts count' })
  async getUnreadCount(@CurrentUser() user: any) {
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
    @CurrentUser() user: any,
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
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'authority')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Create alert (admin/authority only)' })
  async createAlert(@Body() dto: CreateAlertDto, @CurrentUser() _user: any) {
    const alert = await this.alertsService.create({
      title: dto.title,
      message: dto.message,
      category: dto.category,
      level: dto.level,
      area: dto.area,
      targetZoneId: dto.targetZoneId,
    });

    // Broadcast alert via WebSocket
    // The AlertsGateway will be injected and called from an event listener

    return alert;
  }

  @Patch(':id/read')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Mark alert as read' })
  async markAsRead(
    @Param('id') alertId: string,
    @CurrentUser() user: any,
  ) {
    const success = await this.alertsService.markAsRead(user.id, alertId);
    return { success };
  }

  @Post('mark-all-read')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Mark all alerts as read' })
  async markAllAsRead(@CurrentUser() user: any) {
    const result = await this.alertsService.markAllAsRead(user.id);
    return { success: true, markedRead: result.markedRead };
  }

}
