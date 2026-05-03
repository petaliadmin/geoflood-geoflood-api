import { Test, TestingModule } from '@nestjs/testing';
import { RouteService } from './route.service';
import { OsrmClient, OsrmResponse } from './osrm.client';
import {
  FloodRiskEvaluator,
  RouteEvaluation,
  ZoneAlongRoute,
} from './flood-risk-evaluator.service';

const linestring = (offset = 0) => ({
  type: 'LineString' as const,
  coordinates: [
    [-17.44, 14.69 + offset],
    [-17.40, 14.75 + offset],
  ] as Array<[number, number]>,
});

function osrmRouteFixture(opts: { distance?: number; duration?: number; offset?: number } = {}) {
  return {
    distance: opts.distance ?? 8000,
    duration: opts.duration ?? 600,
    geometry: linestring(opts.offset ?? 0),
    legs: [{ distance: opts.distance ?? 8000, duration: opts.duration ?? 600 }],
    weight: 600,
  };
}

function osrmResponse(routes: ReturnType<typeof osrmRouteFixture>[]): OsrmResponse {
  return {
    code: 'Ok',
    routes,
    waypoints: [],
  };
}

const safeEvaluation = (): RouteEvaluation => ({
  zonesAlongRoute: [],
  hasConfirmedFlooding: false,
  hasFloodProneWithRain: false,
  confirmedZoneIds: [],
});

const proneRainEvaluation = (): RouteEvaluation => ({
  zonesAlongRoute: [
    {
      zoneId: 'zR',
      zoneName: 'Pikine',
      zoneLevel: 'high',
      city: 'Dakar',
      classification: 'flood_prone_with_rain',
      reason: 'rain expected',
    } as ZoneAlongRoute,
  ],
  hasConfirmedFlooding: false,
  hasFloodProneWithRain: true,
  confirmedZoneIds: [],
});

const confirmedEvaluation = (zoneId = 'zC'): RouteEvaluation => ({
  zonesAlongRoute: [
    {
      zoneId,
      zoneName: 'Yoff',
      zoneLevel: 'high',
      city: 'Dakar',
      classification: 'confirmed_flooded',
      reason: 'active validated flood alert',
    } as ZoneAlongRoute,
  ],
  hasConfirmedFlooding: true,
  hasFloodProneWithRain: false,
  confirmedZoneIds: [zoneId],
});

describe('RouteService', () => {
  let service: RouteService;
  let osrm: { route: jest.Mock; isAvailable: jest.Mock };
  let evaluator: { evaluateRoute: jest.Mock };

  async function build() {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RouteService,
        { provide: OsrmClient, useValue: osrm },
        { provide: FloodRiskEvaluator, useValue: evaluator },
      ],
    }).compile();
    service = module.get(RouteService);
  }

  beforeEach(() => {
    osrm = {
      route: jest.fn(),
      isAvailable: jest.fn().mockReturnValue(true),
    };
    evaluator = { evaluateRoute: jest.fn() };
  });

  describe('calculateSafeRoute', () => {
    it('uses fallback geometry when OSRM is unavailable', async () => {
      osrm.route.mockResolvedValue(null);
      evaluator.evaluateRoute.mockResolvedValue(safeEvaluation());
      await build();

      const result = await service.calculateSafeRoute({
        fromLat: 14.69, fromLng: -17.44, toLat: 14.75, toLng: -17.40,
      });

      expect(result.primary.source).toBe('fallback');
      expect(result.primary.distance).toBeGreaterThan(0);
      expect(result.primary.duration).toBeGreaterThan(0);
      expect(result.avoidedZones).toEqual([]);
      expect(result.reroutedDueToFlood).toBe(false);
    });

    it('keeps primary OSRM route when it is safe and emits no warnings', async () => {
      osrm.route.mockResolvedValue(osrmResponse([osrmRouteFixture()]));
      evaluator.evaluateRoute.mockResolvedValue(safeEvaluation());
      await build();

      const result = await service.calculateSafeRoute({
        fromLat: 14.69, fromLng: -17.44, toLat: 14.75, toLng: -17.40,
      });

      expect(result.primary.source).toBe('osrm');
      expect(result.primary.selected).toBe(true);
      expect(result.primary.warnings).toEqual([]);
      expect(result.reroutedDueToFlood).toBe(false);
      expect(result.avoidedZones).toEqual([]);
    });

    it('keeps primary route but emits warnings for flood_prone_with_rain', async () => {
      osrm.route.mockResolvedValue(osrmResponse([osrmRouteFixture()]));
      evaluator.evaluateRoute.mockResolvedValue(proneRainEvaluation());
      await build();

      const result = await service.calculateSafeRoute({
        fromLat: 14.69, fromLng: -17.44, toLat: 14.75, toLng: -17.40,
      });

      expect(result.primary.warnings).toHaveLength(1);
      expect(result.primary.warnings[0].level).toBe('warning');
      expect(result.primary.warnings[0].classification).toBe('flood_prone_with_rain');
      expect(result.avoidedZones).toEqual([]);
    });

    it('selects safe alternative when primary is confirmed flooded', async () => {
      osrm.route.mockResolvedValue(
        osrmResponse([osrmRouteFixture({ offset: 0 }), osrmRouteFixture({ offset: 0.01 })]),
      );
      evaluator.evaluateRoute
        .mockResolvedValueOnce(confirmedEvaluation('zX'))
        .mockResolvedValueOnce(safeEvaluation());
      await build();

      const result = await service.calculateSafeRoute({
        fromLat: 14.69, fromLng: -17.44, toLat: 14.75, toLng: -17.40,
      });

      expect(result.reroutedDueToFlood).toBe(true);
      expect(result.primary.evaluation.hasConfirmedFlooding).toBe(false);
      expect(result.alternatives).toHaveLength(1);
      expect(result.alternatives[0].evaluation.hasConfirmedFlooding).toBe(true);
      expect(result.avoidedZones).toEqual([]);
    });

    it('retries OSRM with detour waypoints when all initial routes are flooded', async () => {
      osrm.route
        // first call: main + alternatives, all flooded
        .mockResolvedValueOnce(osrmResponse([osrmRouteFixture()]))
        // detour attempt #1: still flooded
        .mockResolvedValueOnce(osrmResponse([osrmRouteFixture({ offset: 0.02 })]))
        // detour attempt #2: clean
        .mockResolvedValueOnce(osrmResponse([osrmRouteFixture({ offset: -0.02 })]));

      evaluator.evaluateRoute
        .mockResolvedValueOnce(confirmedEvaluation('zA')) // main
        .mockResolvedValueOnce(confirmedEvaluation('zA')) // detour 1
        .mockResolvedValueOnce(safeEvaluation());        // detour 2

      await build();

      const result = await service.calculateSafeRoute({
        fromLat: 14.69, fromLng: -17.44, toLat: 14.75, toLng: -17.40,
      });

      expect(result.reroutedDueToFlood).toBe(true);
      expect(result.primary.evaluation.hasConfirmedFlooding).toBe(false);
      expect(osrm.route).toHaveBeenCalledTimes(3);
    });

    it('falls back to least-flooded route when no detour is found', async () => {
      osrm.route.mockImplementation(async (coords: Array<[number, number]>) => {
        // initial 1 candidate, all detours also confirmed
        return osrmResponse([osrmRouteFixture()]);
      });
      evaluator.evaluateRoute.mockResolvedValue(confirmedEvaluation('zZ'));

      await build();

      const result = await service.calculateSafeRoute({
        fromLat: 14.69, fromLng: -17.44, toLat: 14.75, toLng: -17.40,
      });

      // primary still has confirmed flooding -> warnings critical, avoidedZones populated
      expect(result.primary.evaluation.hasConfirmedFlooding).toBe(true);
      expect(result.avoidedZones).toEqual(['zZ']);
      expect(result.primary.warnings[0].level).toBe('critical');
    });
  });

  describe('evaluateExistingRoute', () => {
    it('delegates to evaluator and returns warnings', async () => {
      evaluator.evaluateRoute.mockResolvedValue(proneRainEvaluation());
      await build();

      const result = await service.evaluateExistingRoute({
        coordinates: [
          [-17.44, 14.69],
          [-17.40, 14.75],
        ],
      });

      expect(evaluator.evaluateRoute).toHaveBeenCalledWith({
        coords: [
          [-17.44, 14.69],
          [-17.40, 14.75],
        ],
      });
      expect(result.warnings).toHaveLength(1);
      expect(result.evaluation.hasFloodProneWithRain).toBe(true);
    });
  });
});
