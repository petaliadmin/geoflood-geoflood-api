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
  @ApiQuery({ name: 'lat', required: false })
  @ApiQuery({ name: 'lng', required: false })
  @ApiQuery({ name: 'radius', required: false })
  async getZones(
    @Query() query: { city?: string; level?: string; lat?: number; lng?: number; radius?: number },
  ) {
    return this.zonesService.findAll(query);
  }

  @Get('nearby')
  @ApiOperation({ summary: 'Get nearby flood zones' })
  @ApiQuery({ name: 'lat', required: true })
  @ApiQuery({ name: 'lng', required: true })
  @ApiQuery({ name: 'radius', required: false })
  async getNearby(@Query() query: { lat: number; lng: number; radius?: number }) {
    return this.zonesService.getNearby(query.lat, query.lng, query.radius);
  }

  @Get('risk-map')
  @ApiOperation({ summary: 'Get zones for risk map visualization' })
  async getRiskMap(@Query() query: { city?: string }) {
    return this.zonesService.getRiskMap(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get flood zone by ID' })
  async getZone(@Param('id') id: string) {
    return this.zonesService.findById(id);
  }
}
