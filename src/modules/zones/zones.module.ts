import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ZonesService } from './zones.service';
import { ZonesController } from './zones.controller';
import { FloodZoneEntity } from './entities/zone.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([FloodZoneEntity]),
  ],
  providers: [ZonesService],
  controllers: [ZonesController],
  exports: [ZonesService],
})
export class ZonesModule {}
