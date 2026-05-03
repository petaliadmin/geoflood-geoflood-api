import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ReportEntity } from '../zones/entities/zone.entity';
import { FloodZoneEntity } from '../zones/entities/zone.entity';

export interface HistoryByYear {
  year: number;
  count: number;
}

export interface TopZone {
  zoneId: string;
  zoneName: string;
  episodeCount: number;
}

export interface ZoneHistoryPoint {
  month: string;
  count: number;
}

export interface ZoneHistoryResponse {
  zone: {
    id: string;
    name: string;
    city: string;
    level: 'high' | 'medium' | 'low';
  };
  range: { startDate: string; endDate: string; years: number };
  totalReports: number;
  byMonth: ZoneHistoryPoint[];
  byYear: HistoryByYear[];
}

@Injectable()
export class HistoryService {
  private readonly logger = new Logger(HistoryService.name);

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
    const currentYear = new Date().getUTCFullYear();
    const startYear = this.parseYear(query?.startYear, 2000);
    const endYear = this.parseYear(query?.endYear, currentYear);

    if (startYear > endYear) {
      throw new BadRequestException('startYear ne peut pas etre superieur a endYear');
    }

    const startDate = new Date(Date.UTC(startYear, 0, 1));
    const endDate = new Date(Date.UTC(endYear, 11, 31, 23, 59, 59));

    try {
      const qb = this.reportsRepository
        .createQueryBuilder('report')
        .where('report.createdAt BETWEEN :start AND :end', { start: startDate, end: endDate });

      if (query?.city) {
        qb.andWhere(
          `EXISTS (
            SELECT 1 FROM flood_zones fz
            WHERE fz.city = :city
              AND ST_Contains(fz.polygon, report.location)
          )`,
          { city: query.city },
        );
      }

      const reports = await qb.getMany();

      const byYearMap = new Map<number, number>();
      for (const r of reports) {
        const year = new Date(r.createdAt).getUTCFullYear();
        byYearMap.set(year, (byYearMap.get(year) ?? 0) + 1);
      }

      const byYear: HistoryByYear[] = Array.from(byYearMap.entries())
        .map(([year, count]) => ({ year, count }))
        .sort((a, b) => a.year - b.year);

      return { byYear };
    } catch (err) {
      this.logger.error(`getFloodHistory failed: ${(err as Error).message}`, (err as Error).stack);
      throw new InternalServerErrorException("Impossible de charger l'historique des inondations");
    }
  }

  async getTopZones(query?: { city?: string; limit?: number }): Promise<TopZone[]> {
    const limit = Math.min(Math.max(query?.limit ?? 10, 1), 50);

    try {
      const qb = this.zonesRepository
        .createQueryBuilder('zone')
        .select('zone.id', 'zone_id')
        .addSelect('zone.name', 'zone_name')
        .addSelect('COUNT(r.id)', 'reportCount')
        .leftJoin(ReportEntity, 'r', 'ST_Contains(zone.polygon, r.location)')
        .groupBy('zone.id')
        .orderBy('"reportCount"', 'DESC')
        .limit(limit);

      if (query?.city) {
        qb.where('zone.city = :city', { city: query.city });
      }

      const rows = await qb.getRawMany<{
        zone_id: string;
        zone_name: string;
        reportCount: string;
      }>();

      return rows.map(z => ({
        zoneId: z.zone_id,
        zoneName: z.zone_name,
        episodeCount: parseInt(z.reportCount, 10) || 0,
      }));
    } catch (err) {
      this.logger.error(`getTopZones failed: ${(err as Error).message}`, (err as Error).stack);
      throw new InternalServerErrorException('Impossible de charger le classement des zones');
    }
  }

  async getZoneHistory(zoneId: string, years = 5): Promise<ZoneHistoryResponse> {
    const parsed = Number(years);
    const safeYears = Math.min(Math.max(Number.isFinite(parsed) ? parsed : 5, 1), 50);

    const zone = await this.zonesRepository.findOne({
      where: { id: zoneId },
      select: ['id', 'name', 'city', 'level'],
    });

    if (!zone) {
      throw new NotFoundException(`Zone ${zoneId} introuvable`);
    }

    const endDate = new Date();
    const startDate = new Date(endDate);
    startDate.setUTCFullYear(startDate.getUTCFullYear() - safeYears);

    try {
      const reports = await this.reportsRepository
        .createQueryBuilder('report')
        .select(['report.id', 'report.createdAt'])
        .where('report.createdAt BETWEEN :start AND :end', { start: startDate, end: endDate })
        .andWhere(
          'ST_Contains((SELECT polygon FROM flood_zones WHERE id = :zoneId), report.location)',
          { zoneId },
        )
        .getMany();

      const monthly = new Map<string, number>();
      const yearly = new Map<number, number>();
      for (const r of reports) {
        const d = new Date(r.createdAt);
        const ym = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
        monthly.set(ym, (monthly.get(ym) ?? 0) + 1);
        yearly.set(d.getUTCFullYear(), (yearly.get(d.getUTCFullYear()) ?? 0) + 1);
      }

      const byMonth = Array.from(monthly.entries())
        .map(([month, count]) => ({ month, count }))
        .sort((a, b) => a.month.localeCompare(b.month));

      const byYear = Array.from(yearly.entries())
        .map(([year, count]) => ({ year, count }))
        .sort((a, b) => a.year - b.year);

      return {
        zone: { id: zone.id, name: zone.name, city: zone.city, level: zone.level },
        range: {
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
          years: safeYears,
        },
        totalReports: reports.length,
        byMonth,
        byYear,
      };
    } catch (err) {
      this.logger.error(
        `getZoneHistory(${zoneId}) failed: ${(err as Error).message}`,
        (err as Error).stack,
      );
      throw new InternalServerErrorException("Impossible de charger l'historique de la zone");
    }
  }

  private parseYear(value: unknown, fallback: number): number {
    if (value === undefined || value === null || value === '') return fallback;
    const n = Number(value);
    if (!Number.isInteger(n) || n < 1900 || n > 2100) {
      throw new BadRequestException(`Annee invalide: ${value}`);
    }
    return n;
  }
}
