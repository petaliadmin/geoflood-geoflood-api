import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ReportEntity } from '../zones/entities/zone.entity';

@Injectable()
export class ReportsService {
  constructor(
    @InjectRepository(ReportEntity)
    private reportsRepository: Repository<ReportEntity>,
  ) {}

  async createReport(
    userId: string,
    reportData: {
      lat: number;
      lng: number;
      waterLevel: string;
      roadBlocked?: boolean;
      comment?: string;
      photoPaths?: string[];
    },
  ) {
    const report = this.reportsRepository.create({
      userId,
      lat: reportData.lat,
      lng: reportData.lng,
      waterLevel: reportData.waterLevel as ReportEntity['waterLevel'],
      roadBlocked: reportData.roadBlocked || false,
      comment: reportData.comment,
      photoPaths: reportData.photoPaths || [],
      status: 'pending',
      location: {
        type: 'Point',
        coordinates: [reportData.lng, reportData.lat],
      },
    });

    const saved = await this.reportsRepository.save(report);
    return this.formatReportResponse(saved);
  }

  async findReports(query?: { limit?: number; offset?: number; status?: string }) {
    const limit = query?.limit || 10;
    const offset = query?.offset || 0;

    let qb = this.reportsRepository.createQueryBuilder('report');

    if (query?.status) {
      qb = qb.where('report.status = :status', { status: query.status });
    }

    const [reports, total] = await qb
      .orderBy('report.createdAt', 'DESC')
      .take(limit)
      .skip(offset)
      .getManyAndCount();

    return {
      reports: reports.map(r => this.formatReportResponse(r)),
      total,
    };
  }

  async findNearby(lat: number, lng: number, radius: number = 5) {
    const reports = await this.reportsRepository
      .createQueryBuilder('report')
      .where(
        `ST_DWithin(
          ST_MakePoint(:lng, :lat)::geography,
          report.location::geography,
          :radiusMeters
        )`,
        {
          lat,
          lng,
          radiusMeters: radius * 1000,
        },
      )
      .orderBy('report.createdAt', 'DESC')
      .take(20)
      .getMany();

    return reports.map(r => this.formatReportResponse(r));
  }

  async findById(id: string) {
    const report = await this.reportsRepository.findOne({
      where: { id },
    });

    if (!report) {
      throw new NotFoundException('Report not found');
    }
    return this.formatReportResponse(report);
  }

  async updateStatus(id: string, status: 'verified' | 'rejected') {
    const report = await this.reportsRepository.findOne({
      where: { id },
    });

    if (!report) {
      throw new NotFoundException('Report not found');
    }

    report.status = status;
    const updated = await this.reportsRepository.save(report);
    return this.formatReportResponse(updated);
  }

  private formatReportResponse(report: ReportEntity) {
    return {
      id: report.id,
      userId: report.userId,
      lat: report.lat,
      lng: report.lng,
      waterLevel: report.waterLevel,
      roadBlocked: report.roadBlocked,
      comment: report.comment,
      photoPaths: report.photoPaths,
      status: report.status,
      createdAt: report.createdAt,
    };
  }
}
