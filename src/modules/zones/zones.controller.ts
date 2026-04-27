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
  @ApiQuery({ name: 'source', required: false, description: 'Filter by data source (e.g. shapefile_zone_inondable_humide)' })
  @ApiQuery({ name: 'nature', required: false, description: 'Filter by zone nature' })
  @ApiQuery({ name: 'lat', required: false })
  @ApiQuery({ name: 'lng', required: false })
  @ApiQuery({ name: 'radius', required: false })
  async getZones(
    @Query() query: {
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

  @Get('risk-map')
  @ApiOperation({ summary: 'Get zones for risk map visualization (mobile-optimized)' })
  @ApiQuery({ name: 'city', required: false })
  @ApiQuery({ name: 'zoom', required: false, description: 'Map zoom level (8-18) for polygon simplification' })
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
