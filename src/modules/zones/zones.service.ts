import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FloodZoneEntity, AlertEntity } from './entities/zone.entity';
import { FloodZoneDto, RiskLevel } from '@/common/dtos';
import { RedisService } from '@/common/redis/redis.service';
import { AdminBoundariesService } from '@/modules/admin-boundaries/admin-boundaries.service';

@Injectable()
export class ZonesService {
  constructor(
    @InjectRepository(FloodZoneEntity)
    private zonesRepository: Repository<FloodZoneEntity>,
    @InjectRepository(AlertEntity)
    private alertsRepository: Repository<AlertEntity>,
    private redisService: RedisService,
    private adminBoundariesService: AdminBoundariesService,
  ) {}

  async findAll(query?: {
    city?: string;
    level?: string;
    source?: string;
    nature?: string;
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

    if (query?.source) {
      qb = qb.andWhere('zone.source = :source', { source: query.source });
    }

    if (query?.nature) {
      qb = qb.andWhere('zone.nature = :nature', { nature: query.nature });
    }

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
          radiusMeters: radius * 1000,
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

  async getRiskMapOptimized(query?: { city?: string; zoom?: number }): Promise<FloodZoneDto[]> {
    const zoom = query?.zoom ? Number(query.zoom) : 12;
    const cacheKey = `risk-map:${query?.city || 'all'}:${zoom}`;

    const cached = await this.redisService.getJson<FloodZoneDto[]>(cacheKey);
    if (cached) return cached;

    let tolerance: number;
    if (zoom <= 10) tolerance = 0.005;
    else if (zoom <= 13) tolerance = 0.001;
    else tolerance = 0;

    let result: FloodZoneDto[];

    if (tolerance > 0) {
      let qb = this.zonesRepository.createQueryBuilder('zone');

      if (query?.city) {
        qb = qb.where('zone.city = :city', { city: query.city });
      }

      qb = qb
        .select('zone.id', 'id')
        .addSelect('zone.name', 'name')
        .addSelect('zone.level', 'level')
        .addSelect('zone.centerLat', 'centerLat')
        .addSelect('zone.centerLng', 'centerLng')
        .addSelect('zone.city', 'city')
        .addSelect('zone.score', 'score')
        .addSelect('zone.source', 'source')
        .addSelect(`ST_AsGeoJSON(ST_Simplify(zone.polygon, :tolerance))`, 'simplified_polygon')
        .setParameter('tolerance', tolerance);

      const rawZones = await qb.getRawMany();

      result = rawZones
        .filter(z => z.simplified_polygon)
        .map(z => {
          const geojson = JSON.parse(z.simplified_polygon);
          const coordinates = geojson?.coordinates?.[0] || [];
          const polygon = coordinates.map(([lng, lat]: [number, number]) => ({ lat, lng }));
          return {
            id: z.id,
            name: z.name,
            level: z.level as RiskLevel,
            polygon,
            center: { lat: z.centerLat, lng: z.centerLng },
            city: z.city,
            score: z.score,
            source: z.source,
          } as FloodZoneDto;
        });
    } else {
      result = await this.findAll({ city: query?.city });
    }

    await this.redisService.setJson(cacheKey, 300, result);
    return result;
  }

  /**
   * Find flood zones inside a given administrative area (region/department/commune/quartier).
   * Uses ST_Intersects against the deepest provided boundary geometry.
   */
  async findByArea(query: {
    region?: string;
    department?: string;
    commune?: string;
    quartier?: string;
    level?: string;
  }): Promise<{
    area: { region?: string; department?: string; commune?: string; quartier?: string };
    boundaryId?: string;
    zones: FloodZoneDto[];
  }> {
    const { region, department, commune, quartier, level } = query;
    if (!region && !department && !commune && !quartier) {
      throw new BadRequestException(
        'At least one of region, department, commune, quartier is required',
      );
    }

    const resolved = await this.adminBoundariesService.resolveArea({
      region,
      department,
      commune,
      quartier,
    });
    const deepest = this.adminBoundariesService.pickDeepest(resolved);
    if (!deepest) {
      throw new NotFoundException('No matching administrative boundary found');
    }

    let qb = this.zonesRepository
      .createQueryBuilder('zone')
      .innerJoin(
        'administrative_boundaries',
        'b',
        'b.id = :boundaryId AND ST_Intersects(zone.polygon, b.geometry)',
        { boundaryId: deepest.id },
      );

    if (level) {
      qb = qb.where('zone.level = :level', { level });
    }

    const zones = await qb
      .orderBy('zone.level', 'DESC')
      .addOrderBy('zone.createdAt', 'DESC')
      .getMany();

    return {
      area: {
        region: resolved.region?.name,
        department: resolved.department?.name,
        commune: resolved.commune?.name,
        quartier: resolved.quartier?.name,
      },
      boundaryId: deepest.id,
      zones: zones.map(z => this.formatZoneResponse(z)),
    };
  }

  /**
   * Find flood zones currently under an active validated alert.
   * "Active" = alert.status='validated' AND validatedAt within freshnessHours window.
   */
  async findAlerted(options?: {
    freshnessHours?: number;
    city?: string;
  }): Promise<Array<FloodZoneDto & { alertCount: number }>> {
    const freshnessHours = options?.freshnessHours ?? 12;
    const cutoff = new Date(Date.now() - freshnessHours * 3600 * 1000);

    let qb = this.zonesRepository
      .createQueryBuilder('zone')
      .innerJoin(AlertEntity, 'alert', 'alert."targetZoneId" = zone.id')
      .where('alert.status = :status', { status: 'validated' })
      .andWhere('alert."validatedAt" >= :cutoff', { cutoff });

    if (options?.city) {
      qb = qb.andWhere('zone.city = :city', { city: options.city });
    }

    const zones = await qb
      .select('zone')
      .addSelect('COUNT(alert.id)', 'alertCount')
      .groupBy('zone.id')
      .orderBy('"alertCount"', 'DESC')
      .getRawAndEntities();

    return zones.entities.map((z, i) => ({
      ...this.formatZoneResponse(z),
      alertCount: parseInt(zones.raw[i].alertCount, 10),
    }));
  }

  private formatZoneResponse(zone: FloodZoneEntity): FloodZoneDto {
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
      altitude: zone.altitude,
      elevation: zone.elevation,
      nature: zone.nature,
      zoneType: zone.zoneType,
      designation: zone.designation,
      shapeArea: zone.shapeArea,
      source: zone.source,
      createdAt: zone.createdAt,
    };
  }
}
