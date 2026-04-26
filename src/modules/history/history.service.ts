import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ReportEntity } from '../zones/entities/zone.entity';
import { FloodZoneEntity } from '../zones/entities/zone.entity';

export interface HistoryByYear {
  year: number;
  count: number;
}

export interface TopZone {
  zoneName: string;
  episodeCount: number;
}

@Injectable()
export class HistoryService {
  constructor(
    @InjectRepository(ReportEntity)
    private reportsRepository: Repository<ReportEntity>,
    @InjectRepository(FloodZoneEntity)
    private zonesRepository: Repository<FloodZoneEntity>,
  ) {}

  async getFloodHistory(query?: {
    city?: string;
    startYear?: number;
    endYear?: number;
  }): Promise<{ byYear: HistoryByYear[] }> {
    const startDate = new Date(query?.startYear?.toString() || '2000-01-01');
    const endDate = new Date(query?.endYear?.toString() || '2100-12-31');

    const reports = await this.reportsRepository
      .createQueryBuilder('report')
      .where('report.createdAt BETWEEN :start AND :end', { start: startDate, end: endDate })
      .getMany();

    // Group by year
    const byYearMap: Map<number, number> = new Map();
    reports.forEach(report => {
      const year = new Date(report.createdAt).getFullYear();
      byYearMap.set(year, (byYearMap.get(year) || 0) + 1);
    });

    const byYear: HistoryByYear[] = Array.from(byYearMap.entries())
      .map(([year, count]) => ({ year, count }))
      .sort((a, b) => a.year - b.year);

    return { byYear };
  }

  async getTopZones(query?: { city?: string; limit?: number }): Promise<TopZone[]> {
    const limit = query?.limit || 10;

    // Get zones with most reports
    const zones = await this.zonesRepository
      .createQueryBuilder('zone')
      .select('zone.id')
      .addSelect('zone.name')
      .addSelect('COUNT(report.id)', 'reportCount')
      .leftJoin('report', 'report', 'ST_Contains(zone.polygon, report.location)')
      .groupBy('zone.id')
      .orderBy('reportCount', 'DESC')
      .take(limit)
      .getRawMany();

    return zones.map((z: { zone_name: string; reportCount: string }) => ({
      zoneName: z.zone_name,
      episodeCount: parseInt(z.reportCount, 10),
    }));
  }

  async getZoneHistory(zoneId: string, years: number = 5) {
    const startDate = new Date();
    startDate.setFullYear(startDate.getFullYear() - years);

    const reports = await this.reportsRepository
      .createQueryBuilder('report')
      .where('report.createdAt >= :start', { start: startDate })
      .andWhere(
        `ST_Contains(
          (SELECT polygon FROM flood_zones WHERE id = :zoneId),
          report.location
        )`,
        { zoneId },
      )
      .getMany();

    // Group by month/year
    const monthlyData: Map<string, number> = new Map();
    reports.forEach(report => {
      const month = new Date(report.createdAt).toISOString().substring(0, 7);
      monthlyData.set(month, (monthlyData.get(month) || 0) + 1);
    });

    return Array.from(monthlyData.entries()).map(([month, count]) => ({
      month,
      count,
    }));
  }
}
