import { Module } from '@nestjs/common';
import { MediaService } from '../media/services/media.service';
import { LanguagesController } from './languages.controller';
import { LanguagesService } from './languages.service';

@Module({
  imports: [],
  controllers: [LanguagesController],
  providers: [LanguagesService, MediaService],
})
export class LanguagesModule {}
