import {
  applyDecorators,
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { ApiOperation, ApiResponse as SwaggerResponse } from '@nestjs/swagger';
import { PrismaClient } from '@prisma/client';
import { map, Observable } from 'rxjs';

export interface ApiResponse<T> {
  statusCode: number;
  message: string;
  data?: T;
  error?: string;
  timestamp: string;
  path?: string;
}

export class PrismaResponseGenerator {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * Get model fields from Prisma's DMMF
   */
  private getModelFields(modelName: string): string[] {
    const dmmf = (this.prisma as any)._dmmf.modelMap;
    const model = dmmf[modelName];

    if (!model) {
      return [];
    }

    return model.fields.map((field) => field.name);
  }

  /**
   * Create an example response for a Prisma model
   */
  createModelExample(modelName: string): any {
    const fields = this.getModelFields(modelName);
    const example = {};

    // Generate example data for each field
    fields.forEach((field) => {
      example[field] = this.generateExampleValue(field);
    });

    return example;
  }

  /**
   * Generate an example value based on field name
   */
  private generateExampleValue(fieldName: string): any {
    // String fields
    if (fieldName === 'id') return 1;
    if (fieldName === 'name') return 'Example Name';
    if (fieldName === 'email') return 'user@example.com';
    if (fieldName === 'phone') return '+971501234567';
    if (fieldName === 'password') return '$2a$10$dJwXbGgAHd.9bH/rJkDfwepG...';
    if (fieldName === 'image') return 'uploads/default.png';
    if (fieldName === 'type') return 'CUSTOMER';
    if (fieldName === 'token') return 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';

    // Boolean fields
    if (
      fieldName === 'verified' ||
      fieldName === 'active' ||
      fieldName.startsWith('is')
    )
      return true;

    // Date fields
    if (fieldName === 'createdAt' || fieldName === 'created_at')
      return new Date().toISOString();
    if (fieldName === 'updatedAt' || fieldName === 'updated_at')
      return new Date().toISOString();
    if (fieldName === 'deletedAt' || fieldName === 'deleted_at') return null;

    // Default for other fields
    return `Example ${fieldName}`;
  }
}

// 5. Swagger Response Decorator for Prisma Models
// ----------------------------------------------

/**
 * Create a Swagger response decorator from a Prisma model
 */
export function ApiPrismaResponse(options: {
  operation: string;
  model: string;
  status?: number;
  description?: string;
  isArray?: boolean;
  exampleOverrides?: Record<string, any>;
}) {
  const {
    operation,
    model,
    status = 200,
    description,
    isArray = false,
    exampleOverrides = {},
  } = options;

  // Create a fake instance of PrismaClient to get DMMF
  const prisma = new PrismaClient();
  const generator = new PrismaResponseGenerator(prisma);

  // Generate example data
  const modelExample = generator.createModelExample(model);

  // Apply any overrides to the example
  const finalExample = { ...modelExample, ...exampleOverrides };

  // Create response schema
  return applyDecorators(
    ApiOperation({ summary: operation }),
    SwaggerResponse({
      status,
      description: description || operation,
      schema: {
        properties: {
          statusCode: { type: 'number', example: status },
          message: { type: 'string', example: description || operation },
          timestamp: { type: 'string', example: new Date().toISOString() },
          path: { type: 'string', example: '/api/example' },
          data: {
            type: isArray ? 'array' : 'object',
            ...(isArray
              ? { items: { type: 'object', example: finalExample } }
              : { example: finalExample }),
          },
        },
      },
    }),
  );
}
// Base response class
export class BaseApiResponse<T> implements ApiResponse<T> {
  statusCode: number;
  message: string;
  data?: T;
  error?: string;
  timestamp: string;
  path?: string;

  constructor(options: {
    statusCode: number;
    message: string;
    data?: T;
    error?: string;
    path?: string;
  }) {
    this.statusCode = options.statusCode;
    this.message = options.message;
    this.data = options.data;
    this.error = options.error;
    this.timestamp = new Date().toISOString();
    this.path = options.path;
  }
}

export function createSuccessResponse<T>(options: {
  data?: T;
  message?: string;
  statusCode?: number;
  path?: string;
}): ApiResponse<T> {
  return new BaseApiResponse({
    statusCode: options.statusCode || 200,
    message: options.message || 'Success',
    data: options.data,
    path: options.path,
  });
}
// 6. Response Interceptor
// -----------------------

@Injectable()
export class ApiResponseInterceptor<T>
  implements NestInterceptor<T, ApiResponse<T>>
{
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<ApiResponse<T>> {
    const ctx = context.switchToHttp();
    const request = ctx.getRequest<Request>();
    const path = request.url;

    return next.handle().pipe(
      map((data) => {
        // If response is already an ApiResponse, just ensure path is set
        if (data && data.statusCode && data.message) {
          if (!data.path) data.path = path;
          if (!data.timestamp) data.timestamp = new Date().toISOString();
          return data;
        }

        // Otherwise, wrap it in a success response
        return createSuccessResponse({
          data,
          path,
        });
      }),
    );
  }
}
