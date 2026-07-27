import { Module } from '@nestjs/common';
import { LanguagesService } from '../languages/languages.service';
import { ZoneService } from '../zone/zone.service';
import { BranchController } from './controllers/branch.controller';
import { BranchService } from './services/branch.service';

@Module({
  controllers: [BranchController],
  providers: [BranchService, LanguagesService, ZoneService],
  exports: [BranchService],
})
export class BranchModule {}
