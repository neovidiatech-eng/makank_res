import { SetMetadata } from '@nestjs/common';

export const RequiredPermissions = (...permissions: string[]) =>
  SetMetadata(env('PERMISSION_METADATA_KEY'), permissions);
