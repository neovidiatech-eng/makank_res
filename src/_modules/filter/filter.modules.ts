import { Module } from '@nestjs/common';
import { FilterController } from './controllers/filter.controller';
import { FilterService } from './services/filter.service';

@Module({
  imports: [],
  controllers: [FilterController],
  providers: [FilterService],
})
export class FilterModule {}
