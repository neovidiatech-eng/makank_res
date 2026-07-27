import { Module } from '@nestjs/common';
import { SearchController } from './controllers/search.controller';
import { SearchService } from './services/search.service';

@Module({
  imports: [],
  controllers: [SearchController],
  providers: [SearchService],
  exports: [],
})
export class SearchModule {}
