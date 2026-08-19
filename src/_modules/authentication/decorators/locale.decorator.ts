import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const LocaleHeader = createParamDecorator(
  (_: any, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const rawLocale =
      request.headers['locale']?.toLowerCase() ||
      request.headers['accept-language']?.toLowerCase() ||
      'ar';

    if (rawLocale.includes('ar')) return 'ar';
    if (rawLocale.includes('en')) return 'en';
    return 'ar';
  },
);
