import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminBoundariesService } from './admin-boundaries.service';
import { AdminBoundariesController } from './admin-boundaries.controller';
import { AdministrativeBoundaryEntity } from './entities/administrative-boundary.entity';

@Module({
  imports: [TypeOrmModule.forFeature([AdministrativeBoundaryEntity])],
  providers: [AdminBoundariesService],
  controllers: [AdminBoundariesController],
  exports: [AdminBoundariesService, TypeOrmModule],
})
export class AdminBoundariesModule {}
