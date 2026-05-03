import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { BullModule } from '@nestjs/bull';
import { EventEmitterModule } from '@nestjs/event-emitter';
import * as Joi from 'joi';

// Modules
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { ZonesModule } from './modules/zones/zones.module';
import { AlertsModule } from './modules/alerts/alerts.module';
import { ReportsModule } from './modules/reports/reports.module';
import { WeatherModule } from './modules/weather/weather.module';
import { TerrainModule } from './modules/terrain/terrain.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { AdminModule } from './modules/admin/admin.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { HealthModule } from './modules/health/health.module';
import { HistoryModule } from './modules/history/history.module';
import { RouteModule } from './modules/routes/route.module';
import { PredictionsModule } from './modules/predictions/predictions.module';
import { SyncModule } from './modules/sync/sync.module';
import { AdminBoundariesModule } from './modules/admin-boundaries/admin-boundaries.module';
import { RedisModule } from './common/redis/redis.module';

// Common
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      validationSchema: Joi.object({
        NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
        PORT: Joi.number().default(3000),
        DATABASE_URL: Joi.string().required(),
        REDIS_URL: Joi.string().required(),
        JWT_SECRET: Joi.string().required(),
        JWT_EXPIRATION: Joi.string().default('24h'),
        FIREBASE_PROJECT_ID: Joi.string(),
        FIREBASE_PRIVATE_KEY: Joi.string(),
        FIREBASE_CLIENT_EMAIL: Joi.string(),
        WEATHER_API_KEY: Joi.string(),
        WEATHER_API_URL: Joi.string(),
        WEATHER_PROVIDER: Joi.string().valid('openweathermap', 'local').default('local'),
        OPENWEATHER_API_KEY: Joi.string(),
        OSRM_BASE_URL: Joi.string().uri(),
        FLOOD_PROBABILITY_THRESHOLD: Joi.number().min(0).max(1).default(0.7),
        ALERT_FRESHNESS_HOURS: Joi.number().integer().min(1).default(12),
        GOOGLE_CLIENT_ID: Joi.string(),
        GOOGLE_CLIENT_SECRET: Joi.string(),
        AWS_REGION: Joi.string(),
        AWS_ACCESS_KEY_ID: Joi.string(),
        AWS_SECRET_ACCESS_KEY: Joi.string(),
        AWS_S3_BUCKET: Joi.string(),
        AI_SERVICE_URL: Joi.string(),
        CORS_ORIGIN: Joi.string().default('http://localhost:3000'),
      }),
      validationOptions: {
        allowUnknown: true,
        abortEarly: false,
      },
    }),

    // Global JWT (so JwtAuthGuard works in any module)
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get('JWT_SECRET'),
        signOptions: {
          expiresIn: configService.get('JWT_EXPIRATION', '24h'),
        },
      }),
      global: true,
    }),

    // Database
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        url: configService.get('DATABASE_URL'),
        autoLoadEntities: true,
        migrations: ['dist/database/migrations/*.js'],
        migrationsRun: false,
        synchronize: configService.get('NODE_ENV') === 'development',
        logging: configService.get('NODE_ENV') === 'development',
        logger: 'file',
        extra: {
          // Enable PostGIS
          drivers: [{ module: 'pg', package: 'pg' }],
        },
      }),
    }),

    // Redis / Bull queues
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        redis: configService.get('REDIS_URL'),
      }),
    }),

    // Event emitter for inter-module communication
    EventEmitterModule.forRoot({
      wildcard: false,
      delimiter: '.',
      newListener: false,
      removeListener: false,
      maxListeners: 10,
      verboseMemoryLeak: true,
    }),

    // Redis cache
    RedisModule,

    // Feature modules
    AuthModule,
    UsersModule,
    ZonesModule,
    AlertsModule,
    ReportsModule,
    WeatherModule,
    TerrainModule,
    DashboardModule,
    AdminModule,
    NotificationsModule,
    HealthModule,
    HistoryModule,
    RouteModule,
    PredictionsModule,
    SyncModule,
    AdminBoundariesModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
