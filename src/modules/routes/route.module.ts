import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { RouteService } from './route.service';
import { RouteController } from './route.controller';
import { FloodRiskEvaluator } from './flood-risk-evaluator.service';
import { OsrmClient } from './osrm.client';
import { AlertEntity, FloodZoneEntity, PredictionEntity } from '../zones/entities/zone.entity';
import { WeatherModule } from '../weather/weather.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([FloodZoneEntity, AlertEntity, PredictionEntity]),
    HttpModule.register({ timeout: 8000 }),
    WeatherModule,
  ],
  providers: [RouteService, FloodRiskEvaluator, OsrmClient],
  controllers: [RouteController],
  exports: [RouteService, FloodRiskEvaluator],
})
export class RouteModule {}
