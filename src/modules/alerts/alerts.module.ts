import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AlertsService } from './alerts.service';
import { AlertsController } from './alerts.controller';
import { AlertsGateway } from './alerts.gateway';
import { AlertEntity, AlertReadEntity } from '../zones/entities/zone.entity';

@Module({
  imports: [TypeOrmModule.forFeature([AlertEntity, AlertReadEntity])],
  providers: [AlertsService, AlertsGateway],
  controllers: [AlertsController],
  exports: [AlertsService, AlertsGateway],
})
export class AlertsModule {}
