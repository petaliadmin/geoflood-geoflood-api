import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TerrainCheckEntity } from '../zones/entities/zone.entity';
import { TerrainReportDto } from '@/common/dtos';

@Injectable()
export class TerrainService {
  constructor(
    @InjectRepository(TerrainCheckEntity)
    private terrainRepository: Repository<TerrainCheckEntity>,
  ) {}

  async checkTerrain(
    userId: string,
    address: string,
    lat: number,
    lng: number,
  ): Promise<TerrainReportDto> {
    // TODO: Call Python AI service for scoring
    // For now, generate mock data
    const riskScore = Math.floor(Math.random() * 100);
    const drainageScore = Math.floor(Math.random() * 100);
    const historicalFloods = Math.floor(Math.random() * 10);

    const check = this.terrainRepository.create({
      userId,
      address,
      lat,
      lng,
      riskScore,
      drainageScore,
      historicalFloods,
      recommendation: this.generateRecommendation(riskScore),
      location: {
        type: 'Point',
        coordinates: [lng, lat],
      },
    });

    const saved = await this.terrainRepository.save(check);
    return this.formatTerrainResponse(saved);
  }

  async getUserChecks(
    userId: string,
    query?: { limit?: number; offset?: number },
  ) {
    const limit = query?.limit || 10;
    const offset = query?.offset || 0;

    const [checks, total] = await this.terrainRepository.findAndCount({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: limit,
      skip: offset,
    });

    return {
      checks: checks.map(c => this.formatTerrainResponse(c)),
      total,
    };
  }

  async findById(id: string): Promise<TerrainReportDto> {
    const check = await this.terrainRepository.findOne({
      where: { id },
    });

    if (!check) {
      throw new NotFoundException('Terrain check not found');
    }

    return this.formatTerrainResponse(check);
  }

  async getTerrainHistory(userId: string, limit = 10) {
    return this.terrainRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  private generateRecommendation(riskScore: number): string {
    if (riskScore >= 70) {
      return 'High flood risk area. Not recommended for residence or investment. Strongly consider alternative locations.';
    } else if (riskScore >= 40) {
      return 'Moderate flood risk. Recommend installing proper drainage systems and floodproofing measures before construction.';
    } else if (riskScore >= 20) {
      return 'Low to moderate flood risk. Area is generally safe but consider elevation and drainage during construction.';
    } else {
      return 'Low flood risk. Safe area for investment and residence. Standard precautions recommended.';
    }
  }

  private formatTerrainResponse(check: TerrainCheckEntity): TerrainReportDto {
    return {
      id: check.id,
      userId: check.userId,
      address: check.address,
      lat: check.lat,
      lng: check.lng,
      riskScore: check.riskScore,
      altitudeMeters: check.altitudeMeters,
      drainageScore: check.drainageScore,
      historicalFloods: check.historicalFloods,
      recommendation: check.recommendation,
      createdAt: check.createdAt,
    };
  }
}
