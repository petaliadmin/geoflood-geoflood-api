import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DashboardService } from './dashboard.service';
import { DashboardController } from './dashboard.controller';
import { UserEntity } from '../users/entities/user.entity';
import { FloodZoneEntity } from '../zones/entities/zone.entity';
import { AlertEntity } from '../zones/entities/zone.entity';
import { WeatherSnapshotEntity } from '../zones/entities/zone.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([UserEntity, FloodZoneEntity, AlertEntity, WeatherSnapshotEntity]),
  ],
  providers: [DashboardService],
  controllers: [DashboardController],
  exports: [DashboardService],
})
export class DashboardModule {}
