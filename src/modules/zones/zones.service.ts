import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FloodZoneEntity } from './entities/zone.entity';
import { FloodZoneDto, RiskLevel } from '@/common/dtos';

@Injectable()
export class ZonesService {
  constructor(
    @InjectRepository(FloodZoneEntity)
    private zonesRepository: Repository<FloodZoneEntity>,
  ) {}

  async findAll(query?: {
    city?: string;
    level?: string;
    lat?: number;
    lng?: number;
    radius?: number;
  }): Promise<FloodZoneDto[]> {
    let qb = this.zonesRepository.createQueryBuilder('zone');

    if (query?.city) {
      qb = qb.where('zone.city = :city', { city: query.city });
    }

    if (query?.level) {
      qb = qb.andWhere('zone.level = :level', { level: query.level });
    }

    // If lat/lng provided, find nearby zones (within radius km)
    if (query?.lat && query?.lng) {
      const radius = query.radius || 10;
      qb = qb.andWhere(
        `ST_DWithin(
          ST_MakePoint(:lng, :lat)::geography,
          ST_MakePoint(zone."centerLng", zone."centerLat")::geography,
          :radiusMeters
        )`,
        {
          lat: query.lat,
          lng: query.lng,
          radiusMeters: radius * 1000, // Convert km to meters
        },
      );
    }

    const zones = await qb
      .orderBy('zone.level', 'DESC')
      .addOrderBy('zone.createdAt', 'DESC')
      .getMany();
    return zones.map(z => this.formatZoneResponse(z));
  }

  async findById(id: string): Promise<FloodZoneDto> {
    const zone = await this.zonesRepository.findOne({ where: { id } });
    if (!zone) {
      throw new NotFoundException('Flood zone not found');
    }
    return this.formatZoneResponse(zone);
  }

  async getNearby(lat: number, lng: number, radius: number = 10): Promise<FloodZoneDto[]> {
    return this.findAll({ lat, lng, radius });
  }

  async getRiskMap(query?: { city?: string; bounds?: string }): Promise<FloodZoneDto[]> {
    return this.findAll({ city: query?.city });
  }

  private formatZoneResponse(zone: FloodZoneEntity): FloodZoneDto {
    // Parse GeoJSON polygon to array of LatLng
    const coordinates = zone.polygon?.coordinates?.[0] || [];
    const polygon = coordinates.map(([lng, lat]: [number, number]) => ({ lat, lng }));

    return {
      id: zone.id,
      name: zone.name,
      level: zone.level as RiskLevel,
      polygon,
      center: { lat: zone.centerLat, lng: zone.centerLng },
      city: zone.city,
      score: zone.score,
      createdAt: zone.createdAt,
    };
  }
}
