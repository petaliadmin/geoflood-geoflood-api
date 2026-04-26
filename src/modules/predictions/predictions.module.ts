import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { PredictionsService } from './predictions.service';
import { PredictionsController } from './predictions.controller';
import { PredictionEntity } from '../zones/entities/zone.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([PredictionEntity]),
    HttpModule,
  ],
  providers: [PredictionsService],
  controllers: [PredictionsController],
  exports: [PredictionsService],
})
export class PredictionsModule {}
