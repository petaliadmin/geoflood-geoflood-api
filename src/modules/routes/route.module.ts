import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RouteService } from './route.service';
import { RouteController } from './route.controller';
import { FloodZoneEntity } from '../zones/entities/zone.entity';

@Module({
  imports: [TypeOrmModule.forFeature([FloodZoneEntity])],
  providers: [RouteService],
  controllers: [RouteController],
  exports: [RouteService],
})
export class RouteModule {}
