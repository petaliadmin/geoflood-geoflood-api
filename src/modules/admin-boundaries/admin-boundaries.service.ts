import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  AdministrativeBoundaryEntity,
  BoundaryLevel,
} from './entities/administrative-boundary.entity';

export interface ResolvedArea {
  region?: AdministrativeBoundaryEntity;
  department?: AdministrativeBoundaryEntity;
  commune?: AdministrativeBoundaryEntity;
  quartier?: AdministrativeBoundaryEntity;
}

@Injectable()
export class AdminBoundariesService {
  constructor(
    @InjectRepository(AdministrativeBoundaryEntity)
    private repo: Repository<AdministrativeBoundaryEntity>,
  ) {}

  async findByLevel(level: BoundaryLevel): Promise<AdministrativeBoundaryEntity[]> {
    return this.repo.find({
      where: { level },
      order: { name: 'ASC' },
      select: ['id', 'level', 'name', 'parentId', 'code', 'createdAt'],
    });
  }

  async listAreas(level?: string, parentId?: string): Promise<any[]> {
    const qb = this.repo.createQueryBuilder('b')
      .select([
        'b.id as id',
        'b.level as level',
        'b.name as name',
        'b.parentId as "parentId"',
        'b.code as code',
        'ST_XMin(b.geometry) as "minLng"',
        'ST_YMin(b.geometry) as "minLat"',
        'ST_XMax(b.geometry) as "maxLng"',
        'ST_YMax(b.geometry) as "maxLat"'
      ])
      .orderBy('b.name', 'ASC');

    if (level) {
      qb.andWhere('b.level = :level', { level });
    }
    if (parentId) {
      qb.andWhere('b.parentId = :parentId', { parentId });
    }

    return qb.getRawMany();
  }

  async findByName(
    level: BoundaryLevel,
    name: string,
  ): Promise<AdministrativeBoundaryEntity | null> {
    return this.repo
      .createQueryBuilder('b')
      .where('b.level = :level', { level })
      .andWhere('LOWER(b.name) = LOWER(:name)', { name })
      .getOne();
  }

  async findById(id: string): Promise<AdministrativeBoundaryEntity> {
    const boundary = await this.repo.findOne({ where: { id } });
    if (!boundary) {
      throw new NotFoundException(`Administrative boundary ${id} not found`);
    }
    return boundary;
  }

  async findContaining(
    lat: number,
    lng: number,
    level?: BoundaryLevel,
  ): Promise<AdministrativeBoundaryEntity[]> {
    let qb = this.repo
      .createQueryBuilder('b')
      .where('ST_Contains(b.geometry, ST_SetSRID(ST_MakePoint(:lng, :lat), 4326))', { lat, lng });

    if (level) {
      qb = qb.andWhere('b.level = :level', { level });
    }

    return qb.getMany();
  }

  async resolveArea(query: {
    region?: string;
    department?: string;
    commune?: string;
    quartier?: string;
  }): Promise<ResolvedArea> {
    const resolved: ResolvedArea = {};

    if (query.region) {
      const r = await this.findByName('region', query.region);
      if (r) resolved.region = r;
    }
    if (query.department) {
      const d = await this.findByName('department', query.department);
      if (d) resolved.department = d;
    }
    if (query.commune) {
      const c = await this.findByName('commune', query.commune);
      if (c) resolved.commune = c;
    }
    if (query.quartier) {
      const q = await this.findByName('quartier', query.quartier);
      if (q) resolved.quartier = q;
    }

    return resolved;
  }

  /**
   * Returns the deepest (most specific) boundary in the resolved area.
   * Order of specificity: quartier > commune > department > region
   */
  pickDeepest(area: ResolvedArea): AdministrativeBoundaryEntity | undefined {
    return area.quartier || area.commune || area.department || area.region;
  }

  async findChildren(parentId: string): Promise<AdministrativeBoundaryEntity[]> {
    return this.repo.find({
      where: { parentId },
      order: { name: 'ASC' },
    });
  }
}
