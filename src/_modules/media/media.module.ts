import { Module } from '@nestjs/common';
import { MediaController } from './media.controller';
import { MediaService } from './services/media.service';
import { PrismaService } from 'src/globals/services/prisma.service';

@Module({
  controllers: [MediaController],
  providers: [MediaService, PrismaService],
  exports: [MediaService],
  imports: [],
})
export class MediaModule {}
