import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Query,
  DefaultValuePipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiParam } from '@nestjs/swagger';
import { HistoryService } from './history.service';

@ApiTags('History')
@Controller('v1/history')
export class HistoryController {
  constructor(private readonly historyService: HistoryService) {}

  @Get('floods')
  @ApiOperation({ summary: 'Get flood history by year' })
  @ApiQuery({ name: 'city', required: false })
  @ApiQuery({ name: 'startYear', required: false, type: Number })
  @ApiQuery({ name: 'endYear', required: false, type: Number })
  async getFloodHistory(@Query() query: { city?: string; startYear?: number; endYear?: number }) {
    return this.historyService.getFloodHistory(query);
  }

  @Get('top-zones')
  @ApiOperation({ summary: 'Get top flood-affected zones' })
  @ApiQuery({ name: 'city', required: false })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getTopZones(@Query() query: { city?: string; limit?: number }) {
    return this.historyService.getTopZones(query);
  }

  @Get('zone/:zoneId')
  @ApiOperation({ summary: 'Get flood history for a specific zone' })
  @ApiParam({ name: 'zoneId', description: 'UUID de la zone inondable' })
  @ApiQuery({
    name: 'years',
    required: false,
    type: Number,
    description: "Nombre d'années d'historique (1-50, défaut 5)",
  })
  async getZoneHistory(
    @Param('zoneId', new ParseUUIDPipe({ version: '4' })) zoneId: string,
    @Query('years', new DefaultValuePipe(5), ParseIntPipe) years: number,
  ) {
    return this.historyService.getZoneHistory(zoneId, years);
  }
}
