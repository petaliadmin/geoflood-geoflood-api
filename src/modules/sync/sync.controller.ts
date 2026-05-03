import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { SyncService } from './sync.service';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { AuthUser } from '@/common/dtos';
import { SyncSnapshotDto } from './dto/sync-snapshot.dto';

@ApiTags('Sync')
@Controller('v1/sync')
export class SyncController {
  constructor(private readonly syncService: SyncService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Snapshot consolidé pour mode offline',
    description:
      "Retourne un agrégat des zones, alertes, prédictions, reports utilisateur et météo. Le client cache cette réponse localement et s'en sert tant qu'il est hors ligne.",
  })
  @ApiQuery({ name: 'city', required: false })
  @ApiQuery({ name: 'alertsLimit', required: false, type: Number })
  @ApiQuery({ name: 'reportsLimit', required: false, type: Number })
  @ApiQuery({ name: 'forecastDays', required: false, type: Number })
  async getSnapshot(
    @CurrentUser() user: AuthUser,
    @Query('city') city?: string,
    @Query('alertsLimit') alertsLimit?: number,
    @Query('reportsLimit') reportsLimit?: number,
    @Query('forecastDays') forecastDays?: number,
  ): Promise<SyncSnapshotDto> {
    return this.syncService.getSnapshot(user, {
      city,
      alertsLimit: alertsLimit ? Number(alertsLimit) : undefined,
      reportsLimit: reportsLimit ? Number(reportsLimit) : undefined,
      forecastDays: forecastDays ? Number(forecastDays) : undefined,
    });
  }
}
