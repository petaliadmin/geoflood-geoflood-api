import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { FloodRiskEvaluator } from './flood-risk-evaluator.service';
import {
  AlertEntity,
  FloodZoneEntity,
  PredictionEntity,
} from '../zones/entities/zone.entity';
import { WeatherService } from '../weather/weather.service';

const lineString = {
  type: 'LineString' as const,
  coordinates: [
    [-17.44, 14.69],
    [-17.40, 14.75],
  ] as Array<[number, number]>,
};

function makeZone(overrides: Partial<FloodZoneEntity> = {}): FloodZoneEntity {
  return {
    id: 'zone-1',
    name: 'Pikine',
    level: 'high',
    centerLat: 14.75,
    centerLng: -17.40,
    city: 'Dakar',
    ...overrides,
  } as FloodZoneEntity;
}

describe('FloodRiskEvaluator', () => {
  let service: FloodRiskEvaluator;
  let zoneRepo: { createQueryBuilder: jest.Mock };
  let alertRepo: { createQueryBuilder: jest.Mock };
  let predictionRepo: { createQueryBuilder: jest.Mock };
  let weather: { isRainExpected: jest.Mock };

  const mockZoneQB = (zones: FloodZoneEntity[]) => ({
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    setParameters: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue(zones),
  });

  const mockAlertQB = (alerts: Array<Partial<AlertEntity>>) => ({
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue(alerts),
  });

  const mockPredictionQB = (preds: Array<Partial<PredictionEntity>>) => ({
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue(preds),
  });

  async function buildService(opts: {
    zones: FloodZoneEntity[];
    alerts?: Array<Partial<AlertEntity>>;
    predictions?: Array<Partial<PredictionEntity>>;
    rainExpected?: boolean;
    rainThrows?: boolean;
  }) {
    zoneRepo = { createQueryBuilder: jest.fn().mockReturnValue(mockZoneQB(opts.zones)) };
    alertRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(mockAlertQB(opts.alerts || [])),
    };
    predictionRepo = {
      createQueryBuilder: jest
        .fn()
        .mockReturnValue(mockPredictionQB(opts.predictions || [])),
    };

    weather = {
      isRainExpected: jest.fn().mockImplementation(async () => {
        if (opts.rainThrows) throw new Error('weather provider down');
        return {
          rainExpected: !!opts.rainExpected,
          peakChance: opts.rainExpected ? 80 : 10,
        };
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FloodRiskEvaluator,
        { provide: getRepositoryToken(FloodZoneEntity), useValue: zoneRepo },
        { provide: getRepositoryToken(AlertEntity), useValue: alertRepo },
        { provide: getRepositoryToken(PredictionEntity), useValue: predictionRepo },
        { provide: WeatherService, useValue: weather },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockImplementation((key: string) => {
              if (key === 'FLOOD_PROBABILITY_THRESHOLD') return 0.7;
              if (key === 'ALERT_FRESHNESS_HOURS') return 12;
              return undefined;
            }),
          },
        },
      ],
    }).compile();

    service = module.get(FloodRiskEvaluator);
  }

  describe('evaluateRoute', () => {
    it('returns empty result when no zones intersect', async () => {
      await buildService({ zones: [] });
      const result = await service.evaluateRoute({ lineStringGeoJson: lineString });

      expect(result.zonesAlongRoute).toHaveLength(0);
      expect(result.hasConfirmedFlooding).toBe(false);
      expect(result.confirmedZoneIds).toEqual([]);
    });

    it('returns empty result when input geometry is degenerate', async () => {
      await buildService({ zones: [] });
      const result = await service.evaluateRoute({ coords: [] });
      expect(result.zonesAlongRoute).toHaveLength(0);
    });

    it('classifies zone with active validated alert as confirmed_flooded', async () => {
      await buildService({
        zones: [makeZone({ id: 'z1' })],
        alerts: [{ targetZoneId: 'z1', category: 'flood', status: 'validated' }],
      });

      const result = await service.evaluateRoute({ lineStringGeoJson: lineString });

      expect(result.hasConfirmedFlooding).toBe(true);
      expect(result.confirmedZoneIds).toEqual(['z1']);
      expect(result.zonesAlongRoute[0].classification).toBe('confirmed_flooded');
      expect(result.zonesAlongRoute[0].reason).toContain('active validated flood alert');
    });

    it('classifies zone with high-probability prediction as confirmed_flooded', async () => {
      await buildService({
        zones: [makeZone({ id: 'z2' })],
        predictions: [{ zoneId: 'z2', floodProbability: 0.85 }],
      });

      const result = await service.evaluateRoute({ lineStringGeoJson: lineString });

      expect(result.hasConfirmedFlooding).toBe(true);
      expect(result.zonesAlongRoute[0].classification).toBe('confirmed_flooded');
      expect(result.zonesAlongRoute[0].reason).toContain('AI flood probability');
    });

    it('classifies high-level zone with rain forecast as flood_prone_with_rain', async () => {
      await buildService({
        zones: [makeZone({ id: 'z3', level: 'high' })],
        rainExpected: true,
      });

      const result = await service.evaluateRoute({ lineStringGeoJson: lineString });

      expect(result.hasConfirmedFlooding).toBe(false);
      expect(result.hasFloodProneWithRain).toBe(true);
      expect(result.zonesAlongRoute[0].classification).toBe('flood_prone_with_rain');
      expect(weather.isRainExpected).toHaveBeenCalledWith(
        { lat: 14.75, lng: -17.40, city: 'Dakar' },
        6,
      );
    });

    it('classifies medium zone without rain as flood_prone', async () => {
      await buildService({
        zones: [makeZone({ id: 'z4', level: 'medium' })],
        rainExpected: false,
      });

      const result = await service.evaluateRoute({ lineStringGeoJson: lineString });

      expect(result.zonesAlongRoute[0].classification).toBe('flood_prone');
      expect(result.hasFloodProneWithRain).toBe(false);
      expect(result.hasConfirmedFlooding).toBe(false);
    });

    it('falls back to flood_prone when weather provider throws', async () => {
      await buildService({
        zones: [makeZone({ id: 'z5', level: 'high' })],
        rainThrows: true,
      });

      const result = await service.evaluateRoute({ lineStringGeoJson: lineString });

      expect(result.zonesAlongRoute[0].classification).toBe('flood_prone');
      expect(result.hasFloodProneWithRain).toBe(false);
    });

    it('classifies low-level zone as safe without weather lookup', async () => {
      await buildService({
        zones: [makeZone({ id: 'z6', level: 'low' })],
      });

      const result = await service.evaluateRoute({ lineStringGeoJson: lineString });

      expect(result.zonesAlongRoute[0].classification).toBe('safe');
      expect(weather.isRainExpected).not.toHaveBeenCalled();
    });

    it('confirmed alert takes precedence over weather check (no rain lookup)', async () => {
      await buildService({
        zones: [makeZone({ id: 'z7', level: 'high' })],
        alerts: [{ targetZoneId: 'z7', category: 'flood', status: 'validated' }],
        rainExpected: true,
      });

      await service.evaluateRoute({ lineStringGeoJson: lineString });

      expect(weather.isRainExpected).not.toHaveBeenCalled();
    });

    it('mixes classifications across multiple zones', async () => {
      await buildService({
        zones: [
          makeZone({ id: 'a', level: 'high' }),
          makeZone({ id: 'b', level: 'medium' }),
          makeZone({ id: 'c', level: 'low' }),
        ],
        alerts: [{ targetZoneId: 'a', category: 'flood', status: 'validated' }],
        rainExpected: true,
      });

      const result = await service.evaluateRoute({ lineStringGeoJson: lineString });

      const byId = Object.fromEntries(result.zonesAlongRoute.map(z => [z.zoneId, z]));
      expect(byId.a.classification).toBe('confirmed_flooded');
      expect(byId.b.classification).toBe('flood_prone_with_rain');
      expect(byId.c.classification).toBe('safe');
      expect(result.confirmedZoneIds).toEqual(['a']);
    });
  });
});
