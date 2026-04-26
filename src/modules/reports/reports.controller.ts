import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Query,
  Body,
  UseGuards,
  HttpCode,
  UseInterceptors,
  UploadedFiles,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ReportsService } from './reports.service';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { Roles } from '@/common/decorators/roles.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';

@ApiTags('Reports')
@Controller('v1/reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get()
  @ApiOperation({ summary: 'Get all reports' })
  async getReports(@Query() query: any) {
    return this.reportsService.findReports(query);
  }

  @Get('nearby')
  @ApiOperation({ summary: 'Get reports nearby' })
  async getNearby(@Query() query: any) {
    return this.reportsService.findNearby(query.lat, query.lng, query.radius);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get report by ID' })
  async getReport(@Param('id') id: string) {
    return this.reportsService.findById(id);
  }

  @Post()
  @HttpCode(201)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @UseInterceptors(FilesInterceptor('photos', 3))
  @ApiOperation({ summary: 'Create flood report' })
  async createReport(
    @CurrentUser() user: any,
    @Body() reportData: any,
    @UploadedFiles() files?: Array<Express.Multer.File>,
  ) {
    // TODO: Upload files to S3/MinIO and get URLs
    const photoPaths = files?.map(f => f.filename) || [];
    return this.reportsService.createReport(user.id, { ...reportData, photoPaths });
  }

  @Patch(':id/status')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'authority')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Update report status (admin only)' })
  async updateStatus(
    @Param('id') id: string,
    @Body() body: { status: 'verified' | 'rejected' },
  ) {
    return this.reportsService.updateStatus(id, body.status);
  }
}
