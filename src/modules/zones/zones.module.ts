import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ZonesService } from './zones.service';
import { ZonesController } from './zones.controller';
import { FloodZoneEntity } from './entities/zone.entity';
import { RedisModule } from '@/common/redis/redis.module';

@Module({
  imports: [TypeOrmModule.forFeature([FloodZoneEntity]), RedisModule],
  providers: [ZonesService],
  controllers: [ZonesController],
  exports: [ZonesService],
})
export class ZonesModule {}
