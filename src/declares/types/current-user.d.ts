import { Permission } from '@prisma/client';

declare global {
  interface CurrentUser {
    id: Id;
    jti: string;
    Role: {
      id: Id;
      roleKey: string;
      default?: boolean;
    };
    permissions?: Permission[];
    storeId?: Id;
    branchId?: Id;
    languageId?: string;
  }
}

export {};
