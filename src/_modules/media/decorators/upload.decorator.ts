import { applyDecorators, BadRequestException } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString } from 'class-validator';

export function RequiredFile() {
  return applyDecorators(
    ApiProperty({ type: String, format: 'binary', required: true }),
    ValidateImage(),
  );
}
export function OptionalFile() {
  return applyDecorators(
    ApiProperty({ type: String, format: 'binary', required: false }),
    ValidateImage(),
  );
}
export function RequiredFileOptional() {
  return applyDecorators(
    ApiProperty({ type: String, format: 'binary', required: false }),
    ValidateImage(),
  );
}
export function RequiredFileArray() {
  return applyDecorators(
    ApiProperty({ type: [String], format: 'binary', required: true }),
    ValidateImageArray(),
  );
}

export function ValidateImage() {
  return applyDecorators(
    Transform(({ value }) => {
      if (value === undefined) return undefined;
      if (value === null || value === 'null' || value === '') return null;
      
      const interceptorKey = env('INTERCEPTOR_KEY');
      if (interceptorKey && typeof value === 'string' && value.includes(interceptorKey)) {
        value = value.replaceAll(interceptorKey, '');
      }
      
      if (typeof value === 'string' && value.trim() !== '') {
        return value.trim();
      }
      return undefined;
    }),
    IsOptional(),
    IsString({
      message: (property) => {
        throw new BadRequestException(`validator.invalidFile`, {
          cause: { field: property.property },
        });
      },
    }),
  );
}

export function ValidateImageArray() {
  return applyDecorators(
    Transform(({ value }) => {
      if (value === undefined) return undefined;
      if (value === null || value === 'null' || value === '') return [];
      if (Array.isArray(value)) value = value.map(String);
      if (typeof value === 'string') value = value.split(',').map(String);
      
      const interceptorKey = env('INTERCEPTOR_KEY');
      value = value
        ?.map((val) => {
          if (val === undefined || val === null || val === 'null' || val === '') return undefined;
          let cleanVal = val.trim();
          if (interceptorKey && cleanVal.includes(interceptorKey)) {
            cleanVal = cleanVal.replaceAll(interceptorKey, '');
          }
          return cleanVal !== '' ? cleanVal : undefined;
        })
        ?.filter((x) => x !== undefined);
        
      return value;
    }),
    IsString({
      each: true,
      message: (property) => {
        throw new BadRequestException(`validator.invalidFile`, {
          cause: { field: property.property },
        });
      },
    }),
  );
}
