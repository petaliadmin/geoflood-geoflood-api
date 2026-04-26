import { Injectable, HttpException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { ConfigService } from '@nestjs/config';
import { PredictionEntity } from '../zones/entities/zone.entity';
import { PredictionDto, RiskLevel } from '@/common/dtos';

@Injectable()
export class PredictionsService {
  constructor(
    @InjectRepository(PredictionEntity)
    private predictionRepository: Repository<PredictionEntity>,
    private httpService: HttpService,
    private configService: ConfigService,
  ) {}

  async getPredictionForZone(zoneId: string): Promise<PredictionDto> {
    // Try to get cached prediction from DB
    const prediction = await this.predictionRepository.findOne({
      where: { zoneId },
      order: { createdAt: 'DESC' },
    });

    if (prediction) {
      return this.formatPredictionResponse(prediction);
    }

    // If no prediction exists, try to generate from AI service
    try {
      return await this.generatePredictionFromAI(zoneId);
    } catch (error) {
      // Fallback to mock
      return this.generateMockPrediction(zoneId);
    }
  }

  async getPredictionsForCity(_cityName: string): Promise<PredictionDto[]> {
    // TODO: Find zones by city and get predictions for each
    // For now return empty
    return [];
  }

  async getPredictionForLocation(
    lat: number,
    lng: number,
  ): Promise<PredictionDto> {
    const nearestZone = await this.findNearestZone(lat, lng);
    if (!nearestZone) {
      return this.generateMockPrediction('unknown');
    }

    return this.getPredictionForZone(nearestZone.id);
  }

  async createOrUpdatePrediction(data: {
    zoneId: string;
    floodProbability: number;
    severity: 'high' | 'medium' | 'low';
    confidence: number;
  }) {
    const existing = await this.predictionRepository.findOne({
      where: { zoneId: data.zoneId },
    });

    if (existing) {
      existing.floodProbability = data.floodProbability;
      existing.severity = data.severity;
      existing.confidence = data.confidence;
      existing.updatedAt = new Date();
      return this.predictionRepository.save(existing);
    }

    const prediction = this.predictionRepository.create(data);
    return this.predictionRepository.save(prediction);
  }

  private async generatePredictionFromAI(zoneId: string): Promise<PredictionDto> {
    const aiServiceUrl = this.configService.get('AI_SERVICE_URL');
    if (!aiServiceUrl) {
      throw new HttpException('AI service not configured', 503);
    }

    try {
      // Fetch zone details
      // TODO: fetch zone data to provide to AI
      const response = await firstValueFrom(
        this.httpService.post(`${aiServiceUrl}/predict/flood-risk`, {
          zoneId,
          weather: {},
          altitude: 0,
          historicalData: 0,
          drainage: 0,
          rainfallForecast: 0,
        }),
      );

      const data = response.data;
      return {
        id: 'ai-' + Math.random().toString(36).substr(2, 9),
        zoneId,
        floodProbability: data.floodProbability,
        severity: data.severity as RiskLevel,
        confidence: data.confidence,
        createdAt: new Date(),
      };
    } catch (error) {
      throw new HttpException('Failed to fetch prediction from AI service', 502);
    }
  }

  private async findNearestZone(lat: number, lng: number) {
    // Query zones using PostGIS
    const zones = await this.predictionRepository
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.zone', 'zone')
      .where(
        `ST_DWithin(
          ST_MakePoint(:lng, :lat)::geography,
          ST_MakePoint(zone."centerLng", zone."centerLat")::geography,
          :radiusMeters
        )`,
        {
          lat,
          lng,
          radiusMeters: 10000, // 10km radius
        },
      )
      .orderBy('p.createdAt', 'DESC')
      .getOne();

    return zones?.zone;
  }

  private generateMockPrediction(zoneId: string): PredictionDto {
    return {
      id: 'mock-' + Math.random().toString(36).substr(2, 9),
      zoneId,
      floodProbability: Math.random() * 0.5,
      severity: Math.random() > 0.7 ? RiskLevel.HIGH : Math.random() > 0.4 ? RiskLevel.MEDIUM : RiskLevel.LOW,
      confidence: Math.random() * 0.3 + 0.7,
      createdAt: new Date(),
    };
  }

  private formatPredictionResponse(prediction: PredictionEntity): PredictionDto {
    return {
      id: prediction.id,
      zoneId: prediction.zoneId,
      floodProbability: prediction.floodProbability,
      severity: prediction.severity as unknown as RiskLevel,
      confidence: prediction.confidence,
      createdAt: prediction.createdAt,
    };
  }
}

