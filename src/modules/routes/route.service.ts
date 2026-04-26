import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FloodZoneEntity } from '../zones/entities/zone.entity';

export interface RouteResult {
  distance: number; // km
  duration: number; // minutes
  geometry: string; // encoded polyline
  avoidedZones: string[];
}

@Injectable()
export class RouteService {
  constructor(
    @InjectRepository(FloodZoneEntity)
    private zonesRepository: Repository<FloodZoneEntity>,
  ) {}

  async calculateSafeRoute(params: {
    fromLat: number;
    fromLng: number;
    toLat: number;
    toLng: number;
  }): Promise<RouteResult> {
    // TODO: Integrate with OSRM API for routing
    // For now, return mock data with zone avoidance logic

    const highRiskZones = await this.getHighRiskZonesAlongRoute(
      params.fromLat,
      params.fromLng,
      params.toLat,
      params.toLng,
    );

    // Calculate direct distance (haversine)
    const distance = this.calculateDistance(
      params.fromLat,
      params.fromLng,
      params.toLat,
      params.toLng,
    );

    // Estimate duration (average 50km/h in urban areas)
    const duration = (distance / 50) * 60;

    // Encode mock geometry (straight line)
    const geometry = this.encodePolyline([
      [params.fromLat, params.fromLng],
      [params.toLat, params.toLng],
    ]);

    return {
      distance,
      duration,
      geometry,
      avoidedZones: highRiskZones.map(z => z.id),
    };
  }

  private async getHighRiskZonesAlongRoute(
    fromLat: number,
    fromLng: number,
    toLat: number,
    toLng: number,
    bufferKm: number = 2,
  ) {
    // Get bounding box for the route
    const minLat = Math.min(fromLat, toLat) - 0.02 * bufferKm;
    const maxLat = Math.max(fromLat, toLat) + 0.02 * bufferKm;
    const minLng = Math.min(fromLng, toLng) - 0.02 * bufferKm;
    const maxLng = Math.max(fromLng, toLng) + 0.02 * bufferKm;

    return this.zonesRepository
      .createQueryBuilder('zone')
      .where('zone.level = :level', { level: 'high' })
      .andWhere('zone.centerLat BETWEEN :minLat AND :maxLat', {
        minLat,
        maxLat,
      })
      .andWhere('zone.centerLng BETWEEN :minLng AND :maxLng', {
        minLng,
        maxLng,
      })
      .getMany();
  }

  private calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371; // Earth radius in km
    const dLat = this.toRad(lat2 - lat1);
    const dLng = this.toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(lat1)) *
        Math.cos(this.toRad(lat2)) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRad(deg: number): number {
    return deg * (Math.PI / 180);
  }

  private encodePolyline(coords: number[][]): string {
    // Simple polyline encoding (Google's encoded polyline algorithm)
    // This is a simplified version
    return coords
      .map(([lat, lng]) => {
        const latE5 = Math.round(lat * 1e5);
        const lngE5 = Math.round(lng * 1e5);
        return `${latE5},${lngE5}`;
      })
      .join(';');
  }
}
