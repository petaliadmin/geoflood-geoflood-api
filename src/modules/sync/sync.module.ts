import { Module } from '@nestjs/common';
import { SyncController } from './sync.controller';
import { SyncService } from './sync.service';
import { ZonesModule } from '../zones/zones.module';
import { AlertsModule } from '../alerts/alerts.module';
import { PredictionsModule } from '../predictions/predictions.module';
import { ReportsModule } from '../reports/reports.module';
import { WeatherModule } from '../weather/weather.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    ZonesModule,
    AlertsModule,
    PredictionsModule,
    ReportsModule,
    WeatherModule,
    UsersModule,
  ],
  controllers: [SyncController],
  providers: [SyncService],
})
export class SyncModule {}
