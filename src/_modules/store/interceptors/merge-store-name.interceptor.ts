import {
  applyDecorators,
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  UseInterceptors,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Observable } from 'rxjs';

// ValidateName()'s Transform mirrors ar->en / en->ar whenever only one
// locale key is sent, so a client cannot tell whether a field is present
// with one key going in — by the time UpdateStoreDTO reaches the service,
// a genuine partial update like `{ name: { ar: "..." } }` already looks
// identical to a full `{ ar: "...", en: "..." }` submission, and writing it
// straight to the DB clobbers whichever language the client didn't send.
// This interceptor runs before that Pipe (interceptors execute pre-Pipe),
// so it still sees the untouched request body: if exactly one locale key
// was sent, it fills in the other from the store's current stored value
// instead of letting the mirror duplicate the sent language over it.
@Injectable()
export class MergeStoreNameInterceptor implements NestInterceptor {
  private prisma = new PrismaClient();

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<any>> {
    const request = context.switchToHttp().getRequest();
    const storeId = Number(request.params?.id);
    let name = request.body?.name;

    // multipart/form-data delivers non-file fields as raw strings — parse
    // it the same way ValidateName() eventually would, so this still works
    // regardless of whether the client sent JSON or multipart.
    if (typeof name === 'string') {
      try {
        name = JSON.parse(name);
      } catch {
        name = undefined;
      }
    }

    if (
      name &&
      typeof name === 'object' &&
      storeId &&
      ((name.ar && !name.en) || (name.en && !name.ar))
    ) {
      const store = await this.prisma.store.findUnique({
        where: { id: storeId },
        select: { name: true },
      });
      const existingName = (store?.name as { ar?: string; en?: string }) || {};
      request.body.name = { ...existingName, ...name };
    }

    return next.handle();
  }
}

export function MergeStoreNameOnUpdate() {
  return applyDecorators(UseInterceptors(new MergeStoreNameInterceptor()));
}
