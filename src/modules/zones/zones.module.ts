import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ZonesService } from './zones.service';
import { ZonesController } from './zones.controller';
import { FloodZoneEntity, AlertEntity } from './entities/zone.entity';
import { RedisModule } from '@/common/redis/redis.module';
import { AdminBoundariesModule } from '@/modules/admin-boundaries/admin-boundaries.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([FloodZoneEntity, AlertEntity]),
    RedisModule,
    AdminBoundariesModule,
  ],
  providers: [ZonesService],
  controllers: [ZonesController],
  exports: [ZonesService],
})
export class ZonesModule {}
