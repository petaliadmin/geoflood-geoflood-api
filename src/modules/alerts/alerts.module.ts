import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AlertsService } from './alerts.service';
import { AlertsController } from './alerts.controller';
import { AlertsGateway } from './alerts.gateway';
import { AlertsNotificationListener } from './alerts.listener';
import { AlertEntity, AlertReadEntity } from '../zones/entities/zone.entity';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([AlertEntity, AlertReadEntity]),
    NotificationsModule,
  ],
  providers: [AlertsService, AlertsGateway, AlertsNotificationListener],
  controllers: [AlertsController],
  exports: [AlertsService, AlertsGateway],
})
export class AlertsModule {}
