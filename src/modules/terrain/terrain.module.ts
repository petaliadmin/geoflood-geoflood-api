import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TerrainService } from './terrain.service';
import { TerrainController } from './terrain.controller';
import { TerrainCheckEntity } from '../zones/entities/zone.entity';

@Module({
  imports: [TypeOrmModule.forFeature([TerrainCheckEntity])],
  providers: [TerrainService],
  controllers: [TerrainController],
  exports: [TerrainService],
})
export class TerrainModule {}
