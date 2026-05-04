import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { AdminBoundariesService } from './admin-boundaries.service';
import { BoundaryLevel } from './entities/administrative-boundary.entity';

@ApiTags('Areas')
@Controller('v1/areas')
export class AdminBoundariesController {
  constructor(private readonly service: AdminBoundariesService) {}

  @Get()
  @ApiOperation({ summary: 'List boundaries by level and parentId (for mobile app)' })
  @ApiQuery({ name: 'level', required: false, description: 'region, department, commune, quartier' })
  @ApiQuery({ name: 'parentId', required: false })
  async list(@Query('level') level?: BoundaryLevel, @Query('parentId') parentId?: string) {
    const areas = await this.service.listAreas(level, parentId);
    return {
      level,
      count: areas.length,
      areas: areas.map(a => ({
        ...a,
        minLng: Number(a.minLng),
        minLat: Number(a.minLat),
        maxLng: Number(a.maxLng),
        maxLat: Number(a.maxLat),
      })),
    };
  }

  @Get('contains')
  @ApiOperation({ summary: 'Find boundaries containing a point' })
  @ApiQuery({ name: 'lat', required: true })
  @ApiQuery({ name: 'lng', required: true })
  @ApiQuery({ name: 'level', required: false })
  async contains(
    @Query('lat') lat: string,
    @Query('lng') lng: string,
    @Query('level') level?: BoundaryLevel,
  ) {
    const boundaries = await this.service.findContaining(Number(lat), Number(lng), level);
    return {
      count: boundaries.length,
      boundaries: boundaries.map(b => ({
        id: b.id,
        level: b.level,
        name: b.name,
        code: b.code,
        parentId: b.parentId,
      })),
    };
  }

  @Get(':id/children')
  @ApiOperation({ summary: 'List direct children of a boundary' })
  async children(@Param('id') id: string) {
    const children = await this.service.findChildren(id);
    return {
      parentId: id,
      count: children.length,
      children: children.map(c => ({
        id: c.id,
        level: c.level,
        name: c.name,
        code: c.code,
      })),
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get boundary metadata by ID' })
  async get(@Param('id') id: string) {
    const b = await this.service.findById(id);
    return {
      id: b.id,
      level: b.level,
      name: b.name,
      code: b.code,
      parentId: b.parentId,
      centroid: b.centroid,
    };
  }
}
