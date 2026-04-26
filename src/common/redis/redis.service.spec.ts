import { RedisService } from './redis.service';
import { ConfigService } from '@nestjs/config';

jest.mock('ioredis', () => {
  return {
    Redis: jest.fn().mockImplementation(() => ({
      connect: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn().mockResolvedValue(undefined),
      get: jest.fn().mockResolvedValue(null),
      setex: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
      incr: jest.fn().mockResolvedValue(1),
      expire: jest.fn().mockResolvedValue(1),
    })),
  };
});

describe('RedisService', () => {
  let service: RedisService;

  beforeEach(() => {
    const configService = {
      get: jest.fn().mockReturnValue(undefined),
    } as unknown as ConfigService;

    service = new RedisService(configService);
  });

  it('should get value', async () => {
    const result = await service.get('key');
    expect(result).toBeNull();
  });

  it('should setex value', async () => {
    const result = await service.setex('key', 300, 'value');
    expect(result).toBe('OK');
  });

  it('should delete key', async () => {
    const result = await service.del('key');
    expect(result).toBe(1);
  });

  it('should increment key', async () => {
    const result = await service.incr('key');
    expect(result).toBe(1);
  });

  it('should set json', async () => {
    const result = await service.setJson('key', 300, { foo: 'bar' });
    expect(result).toBe('OK');
  });

  it('should get json returning null', async () => {
    const result = await service.getJson('key');
    expect(result).toBeNull();
  });
});
