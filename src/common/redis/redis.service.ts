import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly redis: Redis;

  constructor(private configService: ConfigService) {
    this.redis = new Redis({
      host: this.configService.get('REDIS_HOST', 'localhost'),
      port: parseInt(this.configService.get('REDIS_PORT', '6379'), 10),
      password: this.configService.get('REDIS_PASSWORD'),
      db: parseInt(this.configService.get('REDIS_DB', '0'), 10),
    });
  }

  async onModuleInit() {
    await this.redis.connect();
    console.log('✅ Redis connected');
  }

  async onModuleDestroy() {
    await this.redis.disconnect();
  }

  async get(key: string): Promise<string | null> {
    return this.redis.get(key);
  }

  async setex(key: string, ttl: number, value: string): Promise<'OK'> {
    return this.redis.setex(key, ttl, value);
  }

  async del(key: string): Promise<number> {
    return this.redis.del(key);
  }

  async incr(key: string): Promise<number> {
    return this.redis.incr(key);
  }

  async expire(key: string, seconds: number): Promise<number> {
    return this.redis.expire(key, seconds);
  }

  // Serialization helpers
  async getJson<T>(key: string): Promise<T | null> {
    const value = await this.get(key);
    return value ? JSON.parse(value) : null;
  }

  async setJson(key: string, ttl: number, value: any): Promise<'OK'> {
    return this.setex(key, ttl, JSON.stringify(value));
  }
}
