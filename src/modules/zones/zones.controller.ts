import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { ZonesService } from './zones.service';

@ApiTags('Zones')
@Controller('v1/zones')
export class ZonesController {
  constructor(private readonly zonesService: ZonesService) {}

  @Get()
  @ApiOperation({ summary: 'Get all flood zones' })
  @ApiQuery({ name: 'city', required: false })
  @ApiQuery({ name: 'level', required: false })
  @ApiQuery({
    name: 'source',
    required: false,
    description: 'Filter by data source (e.g. shapefile_zone_inondable_humide)',
  })
  @ApiQuery({ name: 'nature', required: false, description: 'Filter by zone nature' })
  @ApiQuery({ name: 'lat', required: false })
  @ApiQuery({ name: 'lng', required: false })
  @ApiQuery({ name: 'radius', required: false })
  async getZones(
    @Query()
    query: {
      city?: string;
      level?: string;
      source?: string;
      nature?: string;
      lat?: number;
      lng?: number;
      radius?: number;
    },
  ) {
    const zones = await this.zonesService.findAll(query);
    return { zones };
  }

  @Get('nearby')
  @ApiOperation({ summary: 'Get nearby flood zones' })
  @ApiQuery({ name: 'lat', required: true })
  @ApiQuery({ name: 'lng', required: true })
  @ApiQuery({ name: 'radius', required: false })
  async getNearby(@Query() query: { lat: number; lng: number; radius?: number }) {
    const zones = await this.zonesService.getNearby(query.lat, query.lng, query.radius);
    return { zones };
  }

  @Get('by-area')
  @ApiOperation({
    summary: 'Get flood zones filtered by administrative area (region/department/commune/quartier)',
  })
  @ApiQuery({ name: 'region', required: false })
  @ApiQuery({ name: 'department', required: false })
  @ApiQuery({ name: 'departement', required: false, description: 'Alias for department' })
  @ApiQuery({ name: 'commune', required: false })
  @ApiQuery({ name: 'ville', required: false, description: 'Alias for commune' })
  @ApiQuery({ name: 'city', required: false, description: 'Alias for commune' })
  @ApiQuery({ name: 'quartier', required: false })
  @ApiQuery({
    name: 'level',
    required: false,
    description: 'Filter by zone risk level (high/medium/low)',
  })
  async getByArea(
    @Query()
    query: {
      region?: string;
      department?: string;
      departement?: string;
      commune?: string;
      ville?: string;
      city?: string;
      quartier?: string;
      level?: string;
    },
  ) {
    return this.zonesService.findByArea(query);
  }

  @Get('alerted')
  @ApiOperation({
    summary: 'Get zones currently under an active validated alert',
  })
  @ApiQuery({
    name: 'freshnessHours',
    required: false,
    description: 'Alert freshness window in hours (default: 12)',
  })
  @ApiQuery({ name: 'city', required: false })
  async getAlerted(@Query() query: { freshnessHours?: string; city?: string }) {
    const freshnessHours = query.freshnessHours ? Number(query.freshnessHours) : undefined;
    const zones = await this.zonesService.findAlerted({
      freshnessHours,
      city: query.city,
    });
    return { count: zones.length, zones };
  }

  @Get('risk-map')
  @ApiOperation({ summary: 'Get zones for risk map visualization (mobile-optimized)' })
  @ApiQuery({ name: 'city', required: false })
  @ApiQuery({
    name: 'zoom',
    required: false,
    description: 'Map zoom level (8-18) for polygon simplification',
  })
  async getRiskMap(@Query() query: { city?: string; zoom?: number }) {
    const zones = await this.zonesService.getRiskMapOptimized(query);
    return { zones };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get flood zone by ID' })
  async getZone(@Param('id') id: string) {
    return this.zonesService.findById(id);
  }
}
