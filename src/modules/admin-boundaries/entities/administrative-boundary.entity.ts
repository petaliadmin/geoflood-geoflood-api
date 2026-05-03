import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';

interface GeoJsonMultiPolygon {
  type: 'MultiPolygon';
  coordinates: number[][][][];
}

interface GeoJsonPoint {
  type: 'Point';
  coordinates: [number, number];
}

export type BoundaryLevel = 'region' | 'department' | 'commune' | 'quartier';

@Entity('administrative_boundaries')
@Index(['level'])
@Index(['name'])
@Index(['parentId'])
@Index(['geometry'], { spatial: true })
export class AdministrativeBoundaryEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('enum', { enum: ['region', 'department', 'commune', 'quartier'] })
  level: BoundaryLevel;

  @Column('varchar', { length: 200 })
  name: string;

  @Column('uuid', { nullable: true })
  parentId: string | null;

  @Column('varchar', { length: 50, nullable: true })
  code: string | null;

  @Column('geometry', { spatialFeatureType: 'MultiPolygon', srid: 4326 })
  geometry: GeoJsonMultiPolygon;

  @Column('geometry', { spatialFeatureType: 'Point', srid: 4326, nullable: true })
  centroid: GeoJsonPoint | null;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => AdministrativeBoundaryEntity, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'parentId' })
  parent: AdministrativeBoundaryEntity | null;
}
