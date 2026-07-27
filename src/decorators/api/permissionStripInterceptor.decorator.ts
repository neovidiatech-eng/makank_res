import {
  applyDecorators,
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  UseInterceptors,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { PermissionMethod } from 'src/_modules/authorization/providers/permissions.provider';
import { isSuperAdmin } from 'src/globals/helpers/is-super-admin.helper';
import { validatePermissions } from 'src/globals/helpers/validatePermissions.helper';

function deleteByPath(obj: any, path: string) {
  if (!obj || typeof obj !== 'object') return;
  const parts = path.split('.');
  if (parts.length === 1) {
    delete obj[parts[0]];
    return;
  }

  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!cur || typeof cur !== 'object') return;
    cur = cur[parts[i]];
  }
  if (cur && typeof cur === 'object') {
    delete cur[parts[parts.length - 1]];
  }
}

@Injectable()
export class PermissionStripInterceptor implements NestInterceptor {
  constructor(
    private readonly prefix?: string,
    private readonly method?: PermissionMethod,
    private readonly restrictedFields: string[] = [],
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();
    const user = req.user as CurrentUser | undefined;
    const reqMethod = (this.method || req.method || '').toLowerCase();
    // derive prefix if not passed
    let prefix = this.prefix;
    if (!prefix) {
      const url = (req.baseUrl || req.originalUrl || req.url || '') as string;
      const segs = String(url).split('/').filter(Boolean);
      prefix = segs[0] || '';
    }
    prefix = prefix.toLowerCase();

    if (!req.body || !this.restrictedFields.length) {
      return next.handle();
    }

    // Super-admin (the default Admin role) bypasses field stripping. Custom
    // roles that merely share the Admin role key must still be checked.
    if (isSuperAdmin(user)) {
      return next.handle();
    }

    // Check if user has permission
    // const hasPermission = user?.permissions?.some(
    //   (perm) =>
    //     perm.prefix.toLowerCase() === prefix &&
    //     perm.method.toUpperCase() === reqMethod,
    // );
    const hasPermission = validatePermissions(
      `${this.prefix}_${reqMethod}`,
      user.permissions as any[],
    );

    if (!hasPermission) {
      const strip = (obj: any) => {
        if (!obj || typeof obj !== 'object') return;
        for (const path of this.restrictedFields) {
          deleteByPath(obj, path);
        }
      };

      if (Array.isArray(req.body)) {
        req.body.forEach(strip);
      } else {
        strip(req.body);
      }
    }

    return next.handle();
  }
}

export function StripFieldsIfNoPermission(params: {
  prefix?: string;
  method?: PermissionMethod;
  restrictedFields: string[];
}) {
  return applyDecorators(
    UseInterceptors(
      new PermissionStripInterceptor(
        params.prefix,
        params.method,
        params.restrictedFields,
      ),
    ),
  );
}
