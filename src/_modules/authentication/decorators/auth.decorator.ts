import { UseGuards, applyDecorators } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth } from '@nestjs/swagger';
import { SessionType } from '@prisma/client';
import { PermissionAndTypeGuard } from '../guards/mix-guard';
import { OptionalAuthGuard } from '../guards/optional-auth-guard';
import { WsJwtGuard } from '../guards/ws.guard';
import { RequiredPermissions } from './permission.decorator';

interface AuthOptions {
  type?: SessionType;
  prefix?: string;
  visitor?: boolean;
}

export function Auth({
  type = SessionType.ACCESS,
  prefix,
  visitor = false,
}: AuthOptions = {}) {
  const guards: any[] = [];

  if (visitor) {
    return applyDecorators(OptionalAuth());
  }
  guards.push(AuthGuard(type));
  if (prefix) guards.push(PermissionAndTypeGuard);
  const decorators = [
    RequiredPermissions(prefix),
    UseGuards(...guards),
    ApiBearerAuth(`${type} Token`),
  ];

  return applyDecorators(...decorators);
}

export function WsAuth() {
  return applyDecorators(UseGuards(WsJwtGuard));
}

export function OptionalAuth() {
  return applyDecorators(
    UseGuards(OptionalAuthGuard),
    ApiBearerAuth(`${SessionType.ACCESS} Token`),
  );
}
