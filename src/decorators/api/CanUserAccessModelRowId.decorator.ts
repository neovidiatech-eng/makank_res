import {
  applyDecorators,
  BadRequestException,
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  UseInterceptors,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Observable } from 'rxjs';
import { GlobalHelpers } from 'src/globals/services/globalHelpers.service';
import { PrismaService } from 'src/globals/services/prisma.service';

@Injectable()
export class CanUserAccessModelRowIdInterceptor implements NestInterceptor {
  constructor(
    private readonly modelName: keyof PrismaClient,
    private readonly prefix: string,
    private readonly idParamName: string = 'id',
    private readonly ownerFieldName?: string,
    private readonly ownerCurrentUserField?: string,
    private readonly indirectRelation?: boolean,
  ) {}
  private prisma = new PrismaClient();
  private globalHelpers = new GlobalHelpers(new PrismaService());

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<any>> {
    const request = context.switchToHttp().getRequest();
    // const method = request.method.toUpperCase();
    const user = request.user as CurrentUser;
    const params = request.params;
    const id = +params?.[this.idParamName];
    if (!id || isNaN(id)) {
      throw new BadRequestException(
        `Missing required parameter: ${this.idParamName}`,
      );
    }
    await this.globalHelpers.canUserAccessResource(
      user,
      this.modelName,
      this.prefix,
      id,
      this.ownerFieldName,
      this.ownerCurrentUserField,
      this.indirectRelation,
    );
    return next.handle();
  }
}
export function CanUserAccessModelRowId(parameters: {
  modelName: keyof PrismaClient;
  prefix: string;
  idParamName?: string;
  ownerFieldName?: string;
  ownerCurrentUserField?: string;
  indirectRelation?: boolean;
}) {
  return applyDecorators(
    UseInterceptors(
      new CanUserAccessModelRowIdInterceptor(
        parameters.modelName,
        parameters.prefix,
        parameters?.idParamName || 'id',
        parameters?.ownerFieldName,
        parameters?.ownerCurrentUserField,
        parameters?.indirectRelation,
      ),
    ),
  );
}
