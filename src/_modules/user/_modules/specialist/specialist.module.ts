import { Module } from '@nestjs/common';
import { SpecialistController } from './specialist.controller';
import { SpecialistService } from './specialist.service';

@Module({
  imports: [],
  controllers: [SpecialistController],
  providers: [SpecialistService],
  exports: [SpecialistService],
})
export class SpecialistModule {}
