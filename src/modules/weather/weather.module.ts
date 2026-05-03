import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { WeatherService } from './weather.service';
import { WeatherController } from './weather.controller';
import { WeatherSnapshotEntity } from '../zones/entities/zone.entity';
import { RedisModule } from '@/common/redis/redis.module';
import { LocalDbWeatherProvider } from './providers/local-db.provider';
import { OpenWeatherMapProvider } from './providers/openweathermap.provider';

@Module({
  imports: [
    TypeOrmModule.forFeature([WeatherSnapshotEntity]),
    RedisModule,
    HttpModule.register({ timeout: 5000 }),
  ],
  providers: [WeatherService, LocalDbWeatherProvider, OpenWeatherMapProvider],
  controllers: [WeatherController],
  exports: [WeatherService],
})
export class WeatherModule {}
