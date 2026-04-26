import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  Unique,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { UserEntity } from '../../users/entities/user.entity';

interface GeoJsonPolygon {
  type: 'Polygon';
  coordinates: number[][][];
}

interface GeoJsonPoint {
  type: 'Point';
  coordinates: [number, number];
}

@Entity('flood_zones')
@Index(['level'])
@Index(['city'])
@Index(['centerLat', 'centerLng'])
@Index(['polygon'], { spatial: true })
export class FloodZoneEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('varchar', { length: 100 })
  name: string;

  @Column('enum', { enum: ['high', 'medium', 'low'] })
  level: 'high' | 'medium' | 'low';

  @Column('geometry', { spatialFeatureType: 'Polygon', srid: 4326 })
  polygon: GeoJsonPolygon;

  @Column('double precision')
  centerLat: number;

  @Column('double precision')
  centerLng: number;

  @Column('varchar', { length: 100 })
  city: string;

  @Column('int', { default: 0 })
  score: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Relations
  @OneToMany(() => PredictionEntity, prediction => prediction.zone, {
    cascade: true,
    onDelete: 'CASCADE',
  })
  predictions: PredictionEntity[];
}

@Entity('alerts')
@Index(['level'])
@Index(['category'])
@Index(['createdAt'])
export class AlertEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('varchar', { length: 200 })
  title: string;

  @Column('text')
  message: string;

  @Column('enum', {
    enum: ['rain', 'flood', 'evacuation', 'roadBlocked', 'info'],
  })
  category: 'rain' | 'flood' | 'evacuation' | 'roadBlocked' | 'info';

  @Column('enum', { enum: ['high', 'medium', 'low'] })
  level: 'high' | 'medium' | 'low';

  @Column('varchar', { length: 200 })
  area: string;

  @Column('uuid', { nullable: true })
  targetZoneId: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Relations
  @ManyToOne(() => FloodZoneEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'targetZoneId' })
  targetZone: FloodZoneEntity;

  @OneToMany(() => AlertReadEntity, read => read.alert, {
    cascade: true,
    onDelete: 'CASCADE',
  })
  reads: AlertReadEntity[];
}

@Entity('alert_reads')
@Unique(['userId', 'alertId'])
export class AlertReadEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  userId: string;

  @Column('uuid')
  alertId: string;

  @Column('timestamp', { nullable: true })
  readAt: Date;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: UserEntity;

  @ManyToOne(() => AlertEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'alertId' })
  alert: AlertEntity;
}

@Entity('reports')
@Index(['userId'])
@Index(['createdAt'])
@Index(['location'], { spatial: true })
export class ReportEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  userId: string;

  @Column('double precision')
  lat: number;

  @Column('double precision')
  lng: number;

  @Column('geometry', { spatialFeatureType: 'Point', srid: 4326 })
  location: GeoJsonPoint;

  @Column('enum', { enum: ['ankle', 'knee', 'waist', 'above'] })
  waterLevel: 'ankle' | 'knee' | 'waist' | 'above';

  @Column('boolean', { default: false })
  roadBlocked: boolean;

  @Column('text', { nullable: true })
  comment: string;

  @Column('text', { array: true, nullable: true })
  photoPaths: string[];

  @Column('enum', { enum: ['pending', 'verified', 'rejected'], default: 'pending' })
  status: 'pending' | 'verified' | 'rejected';

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: UserEntity;
}

@Entity('terrain_checks')
@Index(['userId'])
@Index(['createdAt'])
@Index(['location'], { spatial: true })
export class TerrainCheckEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  userId: string;

  @Column('varchar', { length: 300 })
  address: string;

  @Column('double precision')
  lat: number;

  @Column('double precision')
  lng: number;

  @Column('geometry', { spatialFeatureType: 'Point', srid: 4326 })
  location: GeoJsonPoint;

  @Column('int')
  riskScore: number;

  @Column('double precision', { nullable: true })
  altitudeMeters: number;

  @Column('int')
  drainageScore: number;

  @Column('int')
  historicalFloods: number;

  @Column('text')
  recommendation: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: UserEntity;
}

@Entity('weather_snapshots')
@Index(['city'])
@Index(['createdAt'])
export class WeatherSnapshotEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('varchar', { length: 100 })
  city: string;

  @Column('double precision')
  tempC: number;

  @Column('enum', {
    enum: ['sunny', 'cloudy', 'rain', 'heavyRain', 'storm'],
  })
  condition: 'sunny' | 'cloudy' | 'rain' | 'heavyRain' | 'storm';

  @Column('int')
  rainChance: number;

  @Column('int')
  humidity: number;

  @Column('double precision')
  windKmh: number;

  @Column('date', { nullable: true })
  forecastDate: Date;

  @CreateDateColumn()
  createdAt: Date;
}

@Entity('predictions')
@Index(['zoneId'])
@Index(['createdAt'])
export class PredictionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  zoneId: string;

  @Column('double precision')
  floodProbability: number;

  @Column('enum', { enum: ['high', 'medium', 'low'] })
  severity: 'high' | 'medium' | 'low';

  @Column('double precision')
  confidence: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => FloodZoneEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'zoneId' })
  zone: FloodZoneEntity;
}

@Entity('notification_tokens')
@Index(['userId'])
export class NotificationTokenEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  userId: string;

  @Column('varchar', { length: 500 })
  fcmToken: string;

  @Column('enum', { enum: ['android', 'ios'] })
  platform: 'android' | 'ios';

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: UserEntity;
}
