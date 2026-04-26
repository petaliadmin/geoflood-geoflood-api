import {
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { RouteService } from './route.service';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';

@ApiTags('Routes')
@Controller('v1/routes')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('access-token')
export class RouteController {
  constructor(private readonly routeService: RouteService) {}

  @Get('safe')
  @ApiOperation({ summary: 'Get safe route avoiding flood zones' })
  @ApiQuery({ name: 'fromLat', required: true, type: Number })
  @ApiQuery({ name: 'fromLng', required: true, type: Number })
  @ApiQuery({ name: 'toLat', required: true, type: Number })
  @ApiQuery({ name: 'toLng', required: true, type: Number })
  async getSafeRoute(
    @Query() query: {
      fromLat: number;
      fromLng: number;
      toLat: number;
      toLng: number;
    },
  ) {
    return this.routeService.calculateSafeRoute(query);
  }
}
