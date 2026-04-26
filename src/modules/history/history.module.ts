import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HistoryService } from './history.service';
import { HistoryController } from './history.controller';
import { ReportEntity } from '../zones/entities/zone.entity';
import { FloodZoneEntity } from '../zones/entities/zone.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ReportEntity, FloodZoneEntity])],
  providers: [HistoryService],
  controllers: [HistoryController],
  exports: [HistoryService],
})
export class HistoryModule {}
