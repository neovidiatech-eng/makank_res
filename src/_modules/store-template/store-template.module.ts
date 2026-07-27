import { Module } from '@nestjs/common';
import { StoreTemplateController } from './store-template.controller';
import { StoreTemplateService } from './store-template.service';

@Module({
  controllers: [StoreTemplateController],
  providers: [StoreTemplateService],
  exports: [StoreTemplateService],
})
export class StoreTemplateModule {}
