import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { PredictionsService } from './predictions.service';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';

@ApiTags('Predictions')
@Controller('v1/predictions')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('access-token')
export class PredictionsController {
  constructor(private readonly predictionsService: PredictionsService) {}

  @Get('zone/:zoneId')
  @ApiOperation({ summary: 'Get prediction for a specific zone' })
  async getPredictionForZone(@Param('zoneId') zoneId: string) {
    return this.predictionsService.getPredictionForZone(zoneId);
  }

  @Get('city/:cityName')
  @ApiOperation({ summary: 'Get predictions for a city' })
  async getPredictionsForCity(@Param('cityName') cityName: string) {
    return this.predictionsService.getPredictionsForCity(cityName);
  }

  @Get('my-zone')
  @ApiOperation({ summary: 'Get prediction for user\'s current location' })
  @ApiQuery({ name: 'lat', required: true, type: Number })
  @ApiQuery({ name: 'lng', required: true, type: Number })
  async getPredictionForMyZone(
    @Query('lat') lat: number,
    @Query('lng') lng: number,
  ) {
    return this.predictionsService.getPredictionForLocation(lat, lng);
  }
}
