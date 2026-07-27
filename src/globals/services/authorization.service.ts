import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { Request } from 'express';
@Injectable()
export class AuthorizationService {
  constructor(
    @Inject(REQUEST)
    private request: Request & { user: { permissions: string[] } },
  ) {}
  isAuthorized(module: unknown, method: unknown) {
    if (!this.request.user?.permissions?.includes(`${module}_${method}`)) {
      throw new ForbiddenException(
        `You are not allowed to ${method} ${module}`,
      );
    }
  }
}
