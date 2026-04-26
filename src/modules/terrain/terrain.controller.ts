import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  UseGuards,
  HttpCode,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { TerrainService } from './terrain.service';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { CurrentUser } from '@/common/decorators/current-user.decorator';

@ApiTags('Terrain')
@Controller('v1/terrain')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('access-token')
export class TerrainController {
  constructor(private readonly terrainService: TerrainService) {}

  @Post('check')
  @HttpCode(201)
  @ApiOperation({ summary: 'Perform terrain check' })
  async checkTerrain(
    @CurrentUser() user: any,
    @Body() body: { address: string; lat: number; lng: number },
  ) {
    return this.terrainService.checkTerrain(user.id, body.address, body.lat, body.lng);
  }

  @Get('checks')
  @ApiOperation({ summary: 'Get user terrain checks' })
  async getUserChecks(
    @CurrentUser() user: any,
    @Query() query: { limit?: number; offset?: number },
  ) {
    return this.terrainService.getUserChecks(user.id, query);
  }

  @Get('checks/:id')
  @ApiOperation({ summary: 'Get terrain check by ID' })
  async getCheck(@Param('id') id: string) {
    return this.terrainService.findById(id);
  }

  @Get('checks/:id/pdf')
  @ApiOperation({ summary: 'Generate PDF for terrain check' })
  async getCheckPdf(@Param('id') id: string) {
    // TODO: Generate PDF
    return { message: 'PDF generation not implemented yet', id };
  }
}
