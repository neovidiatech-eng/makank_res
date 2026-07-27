import { SetMetadata } from '@nestjs/common';

export const RequiredRole = (role: string) =>
  SetMetadata(env('ROLE_METADATA_KEY'), role);
//
