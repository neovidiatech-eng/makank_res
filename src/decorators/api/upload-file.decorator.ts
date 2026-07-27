import {
  applyDecorators,
  BadRequestException,
  ExecutionContext,
  mixin,
  NestInterceptor,
  SetMetadata,
  UseInterceptors,
} from '@nestjs/common';
import {
  FileFieldsInterceptor,
  FileInterceptor,
  FilesInterceptor,
} from '@nestjs/platform-express';
import { ApiConsumes } from '@nestjs/swagger';
import { existsSync, mkdirSync } from 'fs';
import { diskStorage } from 'multer';
import * as path from 'path';
import { UploadTypes } from 'src/declares/types/upload.types';
import { EmptyInterceptor } from 'src/globals/interceptors/empty.interceptor';
import { MapUploadsInterceptor } from 'src/globals/interceptors/handle-uploads-interceptor';
import { RequiredFileValidationInterceptor } from 'src/globals/interceptors/required-files-Interceptor';
import { v4 } from 'uuid';

export const uploadOptions = (
  filePath: string,
  type?: UploadTypes,
  fileType?: string,
  maxFileSize?: number, // Add max file size parameter (in bytes)
  disallowedTypes?: string[], // Add disallowed types parameter
) => {
  let fileKey = '';

  const uploadOptions = {
    fileFilter: (
      _req: any,
      file: { fieldname: string; mimetype: string },
      callback: (error: Error | null, acceptFile: boolean) => void,
    ) => {
      fileKey = file.fieldname;
      if (disallowedTypes && disallowedTypes.includes(file.mimetype)) {
        return callback(
          new BadRequestException('invalidFileType', {
            cause: { fieldname: file.fieldname },
          }),
          false,
        );
      }
      if (fileType && !file.mimetype.startsWith(fileType)) {
        return callback(
          new BadRequestException('File type is not supported'),
          false,
        );
      }
      callback(null, true);
    },

    // Add file size limits (default to 5MB if not specified)
    limits: {
      fileSize: maxFileSize || 5 * 1024 * 1024, // 5MB default
    },

    storage: diskStorage({
      filename(_req, file, callback) {
        let fileName = '';
        if (type === 'many')
          fileName =
            env('TEMP_FILE_KEY') +
            fileKey +
            '-' +
            v4() +
            path.extname(file.originalname);
        else
          fileName =
            env('TEMP_FILE_KEY') + v4() + path.extname(file.originalname);
        callback(null, fileName);
      },

      destination(_, __, callback) {
        const uploadPath = `${env('UPLOADS_PATH')}/${filePath}`;
        if (!existsSync(env('UPLOADS_PATH'))) {
          mkdirSync(env('UPLOADS_PATH'));
        }
        if (!existsSync(uploadPath)) {
          mkdirSync(uploadPath, { recursive: true });
        }
        callback(null, uploadPath);
      },
    }),
  };

  return uploadOptions;
};

export const UploadFiles = (
  key: string,
  filePath?: string,
  maxCount: number = 10,
  fileType?: string,
) => {
  return applyDecorators(
    UseInterceptors(
      FilesInterceptor(
        key,
        maxCount,
        uploadOptions(filePath, 'many', fileType),
      ),
      MapUploadsInterceptor,
    ),
    ApiConsumes('multipart/form-data'),
  );
};

export const UploadMultipleFiles = (
  fields: {
    name: string;
    maxCount?: number;
    filePath?: string;
    fileType?: string;
    required?: boolean;
  }[],
) => {
  const generateRequired = (
    requiredFields = fields.filter((f) => f.required).map((f) => f.name),
  ) => SetMetadata('requiredFiles', requiredFields);

  return applyDecorators(
    generateRequired(),
    UseInterceptors(
      FileFieldsInterceptor(
        fields.map((field) => ({
          name: field.name,
          maxCount: field.maxCount || 1,
        })),
        {
          fileFilter: (_, file, callback) => {
            const field = fields.find((f) => f.name === file.fieldname);
            if (!field) {
              return callback(
                new BadRequestException('errors.unknownField', {
                  cause: { fieldname: file.fieldname },
                }),
                false,
              );
            }

            if (field.fileType && !file.mimetype.startsWith(field.fileType)) {
              return callback(
                new BadRequestException(
                  `errors.invalidFileType ${field.name}`,
                  {
                    cause: { fieldname: file.fieldname },
                  },
                ),
                false,
              );
            }

            callback(null, true);
          },
          storage: diskStorage({
            destination: (_, file, callback) => {
              const field = fields.find((f) => f.name === file.fieldname);
              const uploadPath = `${env('UPLOADS_PATH')}/${field?.filePath || ''}`;
              if (!existsSync(env('UPLOADS_PATH'))) {
                mkdirSync(env('UPLOADS_PATH'));
              }
              if (!existsSync(uploadPath)) {
                mkdirSync(uploadPath, { recursive: true });
              }
              callback(null, uploadPath);
            },
            filename: (_, file, callback) => {
              const fileName = `${env('TEMP_FILE_KEY')}${file.fieldname}-${v4()}${path.extname(file.originalname)}`;
              callback(null, fileName);
            },
          }),
        },
      ),
      MapUploadsInterceptor,
      RequiredFileValidationInterceptor,
    ),
    ApiConsumes('multipart/form-data'),
  );
};
interface UploadOptions {
  allowedTypes?: string[]; // e.g., ['image/jpeg', 'image/png']
  maxSize?: number; // in bytes (e.g., 5 * 1024 * 1024 for 5MB)
  disallowedTypes?: string[]; // e.g.,
  fileTypePrefix?: string; // e.g., 'image/' to allow all image types
}

export const UploadFile = (
  key: string,
  filePath?: string,
  interceptor?: any,
  options?: UploadOptions,
) => {
  return applyDecorators(
    UseInterceptors(
      FileInterceptor(
        key,
        uploadOptions(
          filePath || 'path',
          undefined,
          options?.fileTypePrefix,
          options?.maxSize,
          options?.disallowedTypes,
        ),
      ),
      MapUploadsInterceptor,
      interceptor ? interceptor : EmptyInterceptor,
    ),
    ApiConsumes('multipart/form-data'),
  );
};

interface UploadNestedOptions {
  fileTypePrefix?: string;
  maxSize?: number;
}
export const UploadNestedFiles = (
  parentKey: string,
  childKey: string,
  count: number,
  filePath?: string,
  options?: UploadNestedOptions,
) => {
  const fields = Array.from({ length: count }).map((_, i) => ({
    name: `${parentKey}[${i}].${childKey}`,
    maxCount: 1,
  }));

  const uploadPath = path.join(
    process.env.UPLOADS_PATH || 'uploads',
    filePath || '',
  );

  const storage = diskStorage({
    destination: (_req, _file, cb) => {
      if (!existsSync(uploadPath)) {
        mkdirSync(uploadPath, { recursive: true });
      }
      cb(null, uploadPath);
    },
    filename: (_req, file, cb) => {
      const fileName = `${file.fieldname}-${v4()}${path.extname(file.originalname)}`;
      cb(null, fileName);
    },
  });

  const multerInterceptor = FileFieldsInterceptor(fields, {
    storage,
    // limits: {
    //   fileSize: options?.maxSize || 5 * 1024 * 1024,
    // },
    fileFilter: (_req, file, cb) => {
      if (
        options?.fileTypePrefix &&
        !file.mimetype.startsWith(options.fileTypePrefix)
      ) {
        return cb(
          new BadRequestException(
            `Invalid file type for field ${file.fieldname}`,
          ),
          false,
        );
      }
      cb(null, true);
    },
  });

  const MixedInterceptor = mixin(
    class implements NestInterceptor {
      private readonly multer = new (multerInterceptor as any)();

      async intercept(context: ExecutionContext, next: any) {
        const req = context.switchToHttp().getRequest();

        // Wait for files to be processed
        await this.multer.intercept(context, next);

        // Parse the nested JSON field if it's a string
        if (typeof req.body[parentKey] === 'string') {
          try {
            req.body[parentKey] = JSON.parse(req.body[parentKey]);
          } catch {
            throw new BadRequestException(`Invalid JSON in field ${parentKey}`);
          }
        }

        // Inject file path into nested DTOs
        if (req.files) {
          for (const fieldName of Object.keys(req.files)) {
            const match = fieldName.match(
              new RegExp(`^${parentKey}\\[(\\d+)]\\.${childKey}$`),
            );
            if (match) {
              const index = parseInt(match[1], 10);
              const fileData = req.files[fieldName][0];
              if (!req.body[parentKey]) req.body[parentKey] = [];
              if (!req.body[parentKey][index]) req.body[parentKey][index] = {};
              req.body[parentKey][index][childKey] =
                fileData?.path || fileData?.filename;
            }
          }
        }

        return next.handle();
      }
    },
  );

  return applyDecorators(
    UseInterceptors(MixedInterceptor),
    ApiConsumes('multipart/form-data'),
  );
};
