import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery, ApiBody } from '@nestjs/swagger';
import { RouteService } from './route.service';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';

@ApiTags('Routes')
@Controller('v1/routes')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('access-token')
export class RouteController {
  constructor(private readonly routeService: RouteService) {}

  @Get('safe')
  @ApiOperation({
    summary:
      'Calculate a flood-aware route. Reroutes around confirmed flooded zones; warns about flood-prone zones with rain.',
  })
  @ApiQuery({ name: 'fromLat', required: true, type: Number })
  @ApiQuery({ name: 'fromLng', required: true, type: Number })
  @ApiQuery({ name: 'toLat', required: true, type: Number })
  @ApiQuery({ name: 'toLng', required: true, type: Number })
  async getSafeRoute(
    @Query() query: { fromLat: number; fromLng: number; toLat: number; toLng: number },
  ) {
    return this.routeService.calculateSafeRoute({
      fromLat: Number(query.fromLat),
      fromLng: Number(query.fromLng),
      toLat: Number(query.toLat),
      toLng: Number(query.toLng),
    });
  }

  @Post('evaluate')
  @ApiOperation({
    summary:
      'Evaluate an externally-computed route against current flood state (active alerts + AI predictions + weather).',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        coordinates: {
          type: 'array',
          items: {
            type: 'array',
            items: { type: 'number' },
            minItems: 2,
            maxItems: 2,
          },
          description: 'Array of [lng, lat] pairs',
        },
      },
      required: ['coordinates'],
    },
  })
  async evaluate(@Body() body: { coordinates: Array<[number, number]> }) {
    return this.routeService.evaluateExistingRoute({ coordinates: body.coordinates });
  }
}
