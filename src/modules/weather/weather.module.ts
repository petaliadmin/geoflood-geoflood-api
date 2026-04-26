import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WeatherService } from './weather.service';
import { WeatherController } from './weather.controller';
import { WeatherSnapshotEntity } from '../zones/entities/zone.entity';
import { RedisModule } from '@/common/redis/redis.module';

@Module({
  imports: [TypeOrmModule.forFeature([WeatherSnapshotEntity]), RedisModule],
  providers: [WeatherService],
  controllers: [WeatherController],
  exports: [WeatherService],
})
export class WeatherModule {}
