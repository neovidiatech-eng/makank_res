import {
  BadRequestException,
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Request } from 'express';
import { unlinkSync } from 'fs';
import { Observable } from 'rxjs';
import { mapUploads } from '../helpers/media.helper';
import { isImageFileIntact } from 'src/_modules/media/helpers/validate-image-integrity';

function flattenUploadedFiles(
  files: UploadedFile | UploadedFile[] | { [key: string]: UploadedFile[] } | undefined,
): UploadedFile[] {
  if (!files) return [];
  if (Array.isArray(files)) return files;
  if ('fieldname' in files) return [files as UploadedFile];
  return Object.values(files).flat();
}

@Injectable()
export class MapUploadsInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest<Request>();

    const files = request.file || request.files;

    // Reject truncated image uploads immediately (visible error to the
    // uploader) instead of silently persisting a file that later fails to
    // decode on strict mobile decoders while still rendering fine in a
    // lenient browser preview.
    for (const file of flattenUploadedFiles(files)) {
      if (
        file.mimetype?.startsWith('image/') &&
        !isImageFileIntact(file.path, file.mimetype)
      ) {
        try {
          unlinkSync(file.path);
        } catch {
          // best-effort cleanup — the corrupt temp file is harmless either way
        }
        throw new BadRequestException(
          'Uploaded image file is corrupted or incomplete — please try uploading it again',
        );
      }
    }

    mapUploads(request.body, files, true);
    return next.handle();
  }
}
