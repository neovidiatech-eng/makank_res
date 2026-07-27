import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const CurrentUser = createParamDecorator(
  (key: keyof CurrentUser, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();

    if (key) return request?.user ? request.user[key] : undefined;
    return request?.user;
  },
);
