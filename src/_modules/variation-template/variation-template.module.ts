import { Module } from '@nestjs/common';
import { PrismaService } from 'src/globals/services/prisma.service';
import { ResponseService } from 'src/globals/services/response.service';
import { VariationTemplateController } from './variation-template.controller';
import { VariationTemplateService } from './variation-template.service';

@Module({
  controllers: [VariationTemplateController],
  providers: [VariationTemplateService, PrismaService, ResponseService],
})
export class VariationTemplateModule {}
