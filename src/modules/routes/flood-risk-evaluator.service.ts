import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  AlertEntity,
  FloodZoneEntity,
  PredictionEntity,
} from '../zones/entities/zone.entity';
import { WeatherService } from '../weather/weather.service';

export type ZoneClassification = 'confirmed_flooded' | 'flood_prone_with_rain' | 'flood_prone' | 'safe';

export interface ZoneAlongRoute {
  zoneId: string;
  zoneName: string;
  zoneLevel: 'high' | 'medium' | 'low';
  city: string;
  classification: ZoneClassification;
  reason: string;
}

export interface RouteEvaluation {
  zonesAlongRoute: ZoneAlongRoute[];
  hasConfirmedFlooding: boolean;
  hasFloodProneWithRain: boolean;
  confirmedZoneIds: string[];
}

@Injectable()
export class FloodRiskEvaluator {
  private readonly logger = new Logger(FloodRiskEvaluator.name);
  private readonly probabilityThreshold: number;
  private readonly alertFreshnessHours: number;

  constructor(
    @InjectRepository(FloodZoneEntity)
    private zoneRepo: Repository<FloodZoneEntity>,
    @InjectRepository(AlertEntity)
    private alertRepo: Repository<AlertEntity>,
    @InjectRepository(PredictionEntity)
    private predictionRepo: Repository<PredictionEntity>,
    private readonly weather: WeatherService,
    private readonly config: ConfigService,
  ) {
    this.probabilityThreshold = Number(
      this.config.get<number>('FLOOD_PROBABILITY_THRESHOLD') ?? 0.7,
    );
    this.alertFreshnessHours = Number(
      this.config.get<number>('ALERT_FRESHNESS_HOURS') ?? 12,
    );
  }

  /**
   * Evaluate a route geometry (GeoJSON LineString or array of [lng,lat] coords) against flood zones.
   * Pass either `lineStringGeoJson` or `coords`.
   */
  async evaluateRoute(input: {
    coords?: Array<[number, number]>; // [lng, lat]
    lineStringGeoJson?: { type: 'LineString'; coordinates: Array<[number, number]> };
  }): Promise<RouteEvaluation> {
    const lineString =
      input.lineStringGeoJson ??
      (input.coords ? { type: 'LineString' as const, coordinates: input.coords } : null);
    if (!lineString || lineString.coordinates.length < 2) {
      return {
        zonesAlongRoute: [],
        hasConfirmedFlooding: false,
        hasFloodProneWithRain: false,
        confirmedZoneIds: [],
      };
    }

    const lineGeoJson = JSON.stringify(lineString);

    // 1. Find flood zones intersected by the route geometry
    const intersectedZones = await this.zoneRepo
      .createQueryBuilder('zone')
      .where(
        'ST_Intersects(zone.polygon, ST_SetSRID(ST_GeomFromGeoJSON(:line), 4326))',
        { line: lineGeoJson },
      )
      .getMany();

    if (intersectedZones.length === 0) {
      return {
        zonesAlongRoute: [],
        hasConfirmedFlooding: false,
        hasFloodProneWithRain: false,
        confirmedZoneIds: [],
      };
    }

    const zoneIds = intersectedZones.map(z => z.id);

    // 2. Active validated alerts on these zones
    const cutoff = new Date(Date.now() - this.alertFreshnessHours * 3600 * 1000);
    const activeAlerts = await this.alertRepo
      .createQueryBuilder('a')
      .where('a."targetZoneId" IN (:...zoneIds)', { zoneIds })
      .andWhere('a.status = :status', { status: 'validated' })
      .andWhere('a."validatedAt" >= :cutoff', { cutoff })
      .andWhere('a.category IN (:...cats)', {
        cats: ['flood', 'roadBlocked', 'evacuation'],
      })
      .getMany();
    const alertedZoneIds = new Set(activeAlerts.map(a => a.targetZoneId).filter(Boolean));

    // 3. Latest predictions per zone above threshold
    const predictionsRaw = await this.predictionRepo
      .createQueryBuilder('p')
      .where('p.zoneId IN (:...zoneIds)', { zoneIds })
      .andWhere('p.floodProbability >= :threshold', {
        threshold: this.probabilityThreshold,
      })
      .orderBy('p.zoneId')
      .addOrderBy('p.createdAt', 'DESC')
      .getMany();
    const highRiskPredictionZoneIds = new Set<string>();
    const seen = new Set<string>();
    for (const p of predictionsRaw) {
      if (seen.has(p.zoneId)) continue;
      seen.add(p.zoneId);
      highRiskPredictionZoneIds.add(p.zoneId);
    }

    // 4. Classify each zone
    const result: ZoneAlongRoute[] = [];
    let hasConfirmedFlooding = false;
    let hasFloodProneWithRain = false;
    const confirmedZoneIds: string[] = [];

    for (const zone of intersectedZones) {
      const isAlerted = alertedZoneIds.has(zone.id);
      const isHighRiskPredicted = highRiskPredictionZoneIds.has(zone.id);

      if (isAlerted || isHighRiskPredicted) {
        const reasons: string[] = [];
        if (isAlerted) reasons.push('active validated flood alert');
        if (isHighRiskPredicted) reasons.push(`AI flood probability >= ${this.probabilityThreshold}`);
        result.push({
          zoneId: zone.id,
          zoneName: zone.name,
          zoneLevel: zone.level,
          city: zone.city,
          classification: 'confirmed_flooded',
          reason: reasons.join(' + '),
        });
        hasConfirmedFlooding = true;
        confirmedZoneIds.push(zone.id);
        continue;
      }

      // Flood-prone path: check rain at zone centroid
      if (zone.level === 'high' || zone.level === 'medium') {
        try {
          const rain = await this.weather.isRainExpected(
            { lat: zone.centerLat, lng: zone.centerLng, city: zone.city },
            6,
          );
          if (rain.rainExpected) {
            result.push({
              zoneId: zone.id,
              zoneName: zone.name,
              zoneLevel: zone.level,
              city: zone.city,
              classification: 'flood_prone_with_rain',
              reason: `flood-prone zone with rain expected (peak chance ${rain.peakChance}%)`,
            });
            hasFloodProneWithRain = true;
            continue;
          }
        } catch (err: any) {
          this.logger.warn(`Weather check failed for zone ${zone.id}: ${err.message}`);
        }

        result.push({
          zoneId: zone.id,
          zoneName: zone.name,
          zoneLevel: zone.level,
          city: zone.city,
          classification: 'flood_prone',
          reason: 'flood-prone zone, no rain expected',
        });
      } else {
        result.push({
          zoneId: zone.id,
          zoneName: zone.name,
          zoneLevel: zone.level,
          city: zone.city,
          classification: 'safe',
          reason: 'low-risk zone',
        });
      }
    }

    return {
      zonesAlongRoute: result,
      hasConfirmedFlooding,
      hasFloodProneWithRain,
      confirmedZoneIds,
    };
  }

  /**
   * Returns confirmed-flooded zones in a bounding box.
   * Used to build OSRM `exclude` polygons / bbox detours.
   */
  async getConfirmedFloodedZonesInBBox(bbox: {
    minLng: number;
    minLat: number;
    maxLng: number;
    maxLat: number;
  }): Promise<FloodZoneEntity[]> {
    const cutoff = new Date(Date.now() - this.alertFreshnessHours * 3600 * 1000);

    return this.zoneRepo
      .createQueryBuilder('zone')
      .where(
        'ST_Intersects(zone.polygon, ST_MakeEnvelope(:minLng, :minLat, :maxLng, :maxLat, 4326))',
        bbox,
      )
      .andWhere(qb => {
        const sub1 = qb
          .subQuery()
          .select('1')
          .from(AlertEntity, 'a')
          .where('a."targetZoneId" = zone.id')
          .andWhere('a.status = :status', { status: 'validated' })
          .andWhere('a."validatedAt" >= :cutoff', { cutoff })
          .andWhere('a.category IN (:...cats)', { cats: ['flood', 'roadBlocked', 'evacuation'] })
          .getQuery();
        const sub2 = qb
          .subQuery()
          .select('1')
          .from(PredictionEntity, 'p')
          .where('p.zoneId = zone.id')
          .andWhere('p.floodProbability >= :threshold', {
            threshold: this.probabilityThreshold,
          })
          .getQuery();
        return `EXISTS ${sub1} OR EXISTS ${sub2}`;
      })
      .setParameters({
        status: 'validated',
        cutoff,
        cats: ['flood', 'roadBlocked', 'evacuation'],
        threshold: this.probabilityThreshold,
      })
      .getMany();
  }
}
