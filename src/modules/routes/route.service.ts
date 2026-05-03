import { Injectable, Logger } from '@nestjs/common';
import { OsrmClient, OsrmRoute } from './osrm.client';
import {
  FloodRiskEvaluator,
  RouteEvaluation,
  ZoneAlongRoute,
} from './flood-risk-evaluator.service';

export interface RouteWarning {
  level: 'info' | 'warning' | 'critical';
  zoneId: string;
  zoneName: string;
  classification: ZoneAlongRoute['classification'];
  message: string;
}

export interface RouteCandidate {
  distance: number; // km
  duration: number; // minutes
  geometry: { type: 'LineString'; coordinates: Array<[number, number]> };
  evaluation: RouteEvaluation;
  warnings: RouteWarning[];
  selected: boolean;
  source: 'osrm' | 'fallback';
}

export interface RouteResult {
  primary: RouteCandidate;
  alternatives: RouteCandidate[];
  avoidedZones: string[];
  reroutedDueToFlood: boolean;
}

@Injectable()
export class RouteService {
  private readonly logger = new Logger(RouteService.name);

  constructor(
    private readonly osrm: OsrmClient,
    private readonly evaluator: FloodRiskEvaluator,
  ) {}

  async calculateSafeRoute(params: {
    fromLat: number;
    fromLng: number;
    toLat: number;
    toLng: number;
  }): Promise<RouteResult> {
    const start: [number, number] = [params.fromLng, params.fromLat];
    const end: [number, number] = [params.toLng, params.toLat];

    const osrmResp = await this.osrm.route([start, end], { alternatives: 2 });

    let candidates: RouteCandidate[] = [];

    if (osrmResp && osrmResp.routes.length > 0) {
      candidates = await Promise.all(osrmResp.routes.map(r => this.toCandidate(r, 'osrm')));
    } else {
      candidates = [await this.buildFallbackCandidate(start, end)];
    }

    // Initial selection: prefer first route without confirmed flooding
    let primaryIdx = candidates.findIndex(c => !c.evaluation.hasConfirmedFlooding);
    let reroutedDueToFlood = false;

    if (primaryIdx === -1) {
      // All candidates have confirmed flooding -> attempt OSRM retry that avoids the bbox of confirmed zones
      const confirmed = candidates[0].evaluation.confirmedZoneIds;
      if (confirmed.length > 0 && this.osrm.isAvailable()) {
        const retryRoute = await this.tryAvoidConfirmedZones(start, end, candidates[0].evaluation);
        if (retryRoute) {
          candidates.unshift(retryRoute);
          primaryIdx = 0;
          reroutedDueToFlood = true;
        }
      }
      if (primaryIdx === -1) {
        // Still nothing better; pick the candidate with the fewest confirmed zones
        primaryIdx = candidates
          .map((c, i) => ({ i, n: c.evaluation.confirmedZoneIds.length }))
          .sort((a, b) => a.n - b.n)[0].i;
      }
    } else if (primaryIdx > 0) {
      reroutedDueToFlood = true;
    }

    candidates.forEach((c, i) => (c.selected = i === primaryIdx));
    const primary = candidates[primaryIdx];
    const alternatives = candidates.filter((_, i) => i !== primaryIdx);

    return {
      primary,
      alternatives,
      avoidedZones: primary.evaluation.confirmedZoneIds,
      reroutedDueToFlood,
    };
  }

  /**
   * Evaluate an externally-computed route (e.g. mobile-side cached) against current flood state.
   */
  async evaluateExistingRoute(params: {
    coordinates: Array<[number, number]>; // [lng, lat]
  }): Promise<{ evaluation: RouteEvaluation; warnings: RouteWarning[] }> {
    const evaluation = await this.evaluator.evaluateRoute({ coords: params.coordinates });
    return {
      evaluation,
      warnings: this.buildWarnings(evaluation),
    };
  }

  private async toCandidate(
    route: OsrmRoute,
    source: 'osrm' | 'fallback',
  ): Promise<RouteCandidate> {
    const evaluation = await this.evaluator.evaluateRoute({
      lineStringGeoJson: route.geometry,
    });
    return {
      distance: route.distance / 1000,
      duration: route.duration / 60,
      geometry: route.geometry,
      evaluation,
      warnings: this.buildWarnings(evaluation),
      selected: false,
      source,
    };
  }

  private async buildFallbackCandidate(
    start: [number, number],
    end: [number, number],
  ): Promise<RouteCandidate> {
    const distanceKm = this.haversineKm(start[1], start[0], end[1], end[0]);
    const durationMin = (distanceKm / 50) * 60;
    const geometry = {
      type: 'LineString' as const,
      coordinates: [start, end],
    };
    const evaluation = await this.evaluator.evaluateRoute({ lineStringGeoJson: geometry });
    return {
      distance: distanceKm,
      duration: durationMin,
      geometry,
      evaluation,
      warnings: this.buildWarnings(evaluation),
      selected: false,
      source: 'fallback',
    };
  }

  /**
   * Retry OSRM with an extra waypoint chosen to detour around the bbox of confirmed flooded zones.
   * OSRM's open-source service does not support `exclude_polygons` directly, so we approximate with
   * a midpoint waypoint shifted away from the flooded centroid.
   */
  private async tryAvoidConfirmedZones(
    start: [number, number],
    end: [number, number],
    evaluation: RouteEvaluation,
  ): Promise<RouteCandidate | null> {
    if (evaluation.zonesAlongRoute.length === 0) return null;

    // Compute average centroid of confirmed zones (using their lat/lng from cached ZoneAlongRoute is not enough,
    // but the route already passes through them, so detour direction = perpendicular shift of midpoint).
    const midLng = (start[0] + end[0]) / 2;
    const midLat = (start[1] + end[1]) / 2;

    // Perpendicular offset of ~2km in the lat direction
    const offsetDeg = 0.018; // ~2km
    const candidates: Array<[number, number]> = [
      [midLng, midLat + offsetDeg],
      [midLng, midLat - offsetDeg],
      [midLng + offsetDeg, midLat],
      [midLng - offsetDeg, midLat],
    ];

    for (const waypoint of candidates) {
      const resp = await this.osrm.route([start, waypoint, end]);
      if (!resp || resp.routes.length === 0) continue;
      const candidate = await this.toCandidate(resp.routes[0], 'osrm');
      if (!candidate.evaluation.hasConfirmedFlooding) {
        this.logger.log(
          `Detour via waypoint ${waypoint[0]},${waypoint[1]} avoids confirmed flooding`,
        );
        return candidate;
      }
    }
    return null;
  }

  private buildWarnings(evaluation: RouteEvaluation): RouteWarning[] {
    return evaluation.zonesAlongRoute
      .filter(z => z.classification !== 'safe' && z.classification !== 'flood_prone')
      .map(z => ({
        level: z.classification === 'confirmed_flooded' ? 'critical' : 'warning',
        zoneId: z.zoneId,
        zoneName: z.zoneName,
        classification: z.classification,
        message: this.warningMessage(z),
      }));
  }

  private warningMessage(z: ZoneAlongRoute): string {
    switch (z.classification) {
      case 'confirmed_flooded':
        return `Zone "${z.zoneName}" inondée confirmée — ${z.reason}`;
      case 'flood_prone_with_rain':
        return `Zone "${z.zoneName}" inondable avec pluie prévue — ${z.reason}`;
      default:
        return `Zone "${z.zoneName}" — ${z.reason}`;
    }
  }

  private haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371;
    const toRad = (deg: number) => deg * (Math.PI / 180);
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
}
