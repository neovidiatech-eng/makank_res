import { Controller, Get, Query, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { existsSync } from 'fs';
import * as path from 'path';
import { tag } from 'src/globals/helpers/tag.helper';
import { MediaService } from './services/media.service';

const prefix = 'media';
@Controller(prefix)
@ApiTags(tag(prefix))
export class MediaController {
  constructor(private mediaService: MediaService) {}
  @Get('/')
  async returnMedia(@Res() res: Response, @Query('media') media: string) {
    if (!media) return res.status(400).send('Media parameter required');

    let relativePath = media.replace(/^(\/?uploads\/|\/?uploads)/, '');
    if (!relativePath.startsWith('/')) {
      relativePath = '/' + relativePath;
    }

    const uploadsRoot = env('UPLOADS_PATH');
    const fullPath = path.join(uploadsRoot, relativePath);

    if (existsSync(fullPath)) {
      return res.sendFile(relativePath, { root: uploadsRoot });
    }

    // Fallback 1: Deduplicate repeated subfolder names (e.g. /service/service/x.jpg -> /service/x.jpg)
    const dedupedPath = relativePath.replace(/\/([^/]+)\/\1\//, '/$1/');
    if (dedupedPath !== relativePath && existsSync(path.join(uploadsRoot, dedupedPath))) {
      return res.sendFile(dedupedPath, { root: uploadsRoot });
    }

    // Fallback 2: Check if file was stored under root uploads directory without subfolder
    const baseName = '/' + path.basename(relativePath);
    if (existsSync(path.join(uploadsRoot, baseName))) {
      return res.sendFile(baseName, { root: uploadsRoot });
    }

    await this.mediaService.isMediaExist(relativePath);
    return res.sendFile(relativePath, { root: uploadsRoot });
  }
}
