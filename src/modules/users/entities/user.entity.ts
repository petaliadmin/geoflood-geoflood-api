import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  Unique,
  OneToMany,
} from 'typeorm';
import { ReportEntity } from '../../zones/entities/zone.entity';
import { TerrainCheckEntity } from '../../zones/entities/zone.entity';
import { AlertReadEntity } from '../../zones/entities/zone.entity';
import { NotificationTokenEntity } from '../../zones/entities/zone.entity';

@Entity('users')
@Unique(['email', 'phone'])
@Index(['email'])
@Index(['phone'])
export class UserEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('varchar', { length: 100 })
  fullName: string;

  @Column('varchar', { length: 255 })
  email: string;

  @Column('varchar', { length: 20 })
  phone: string;

  @Column('enum', {
    enum: ['citizen', 'authority', 'admin'],
    default: 'citizen',
  })
  role: 'citizen' | 'authority' | 'admin';

  @Column('varchar', { length: 255, nullable: true })
  passwordHash: string;

  @Column('varchar', { length: 500, nullable: true })
  avatarUrl: string;

  @Column('varchar', { length: 100, default: 'Dakar' })
  city: string;

  @Column('varchar', { length: 5, default: 'fr' })
  locale: string;

  @Column('boolean', { default: true })
  pushAlertsEnabled: boolean;

  @Column('boolean', { default: true })
  locationAlertsEnabled: boolean;

  @Column('varchar', { length: 10, default: 'system' })
  themeMode: string;

  @Column('varchar', { length: 6, nullable: true })
  otpCode: string;

  @Column('timestamp', { nullable: true })
  otpExpiresAt: Date;

  @Column('varchar', { length: 255, nullable: true })
  resetToken: string;

  @Column('timestamp', { nullable: true })
  resetTokenExpiresAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Relations
  @OneToMany(() => ReportEntity, report => report.user, {
    cascade: true,
    onDelete: 'CASCADE',
  })
  reports: ReportEntity[];

  @OneToMany(() => TerrainCheckEntity, check => check.user, {
    cascade: true,
    onDelete: 'CASCADE',
  })
  terrainChecks: TerrainCheckEntity[];

  @OneToMany(() => AlertReadEntity, read => read.user, {
    cascade: true,
    onDelete: 'CASCADE',
  })
  alertReads: AlertReadEntity[];

  @OneToMany(() => NotificationTokenEntity, token => token.user, {
    cascade: true,
    onDelete: 'CASCADE',
  })
  notificationTokens: NotificationTokenEntity[];
}
