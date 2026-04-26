import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Redis } from 'ioredis';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class RateLimitGuard implements CanActivate {
  private redis: Redis;

  constructor(private configService: ConfigService) {
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      password: process.env.REDIS_PASSWORD,
    });
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();
    const { method, url, ip, user } = request;

    // Identify user by ID if authenticated, otherwise by IP
    const identifier = user?.id ? `user:${user.id}` : `ip:${ip}`;

    // Different limits for auth vs other endpoints
    const isAuthRoute = url.startsWith('/v1/auth') || url.startsWith('/auth');
    const limit = isAuthRoute ? 5 : 60; // 5 per minute for auth, 60 for API
    const windowSeconds = 60;

    const key = `rate-limit:${identifier}:${method}:${url}`;

    try {
      const count = await this.redis.incr(key);

      if (count === 1) {
        // Set expiry on first request
        await this.redis.expire(key, windowSeconds);
      }

      // Set rate limit headers
      response.setHeader('X-RateLimit-Limit', limit.toString());
      response.setHeader('X-RateLimit-Remaining', Math.max(0, limit - count).toString());
      response.setHeader('X-RateLimit-Reset', Math.floor(Date.now() / 1000) + windowSeconds);

      if (count > limit) {
        throw new HttpException(
          'Too many requests - rate limit exceeded',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      return true;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      // On Redis error, allow request (fail open)
      this.redis.disconnect();
      return true;
    }
  }
}
