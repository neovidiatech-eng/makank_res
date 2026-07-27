import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const LocaleHeader = createParamDecorator(
  (_: any, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const locale = request.headers['locale']?.toLowerCase() || 'en';
    if (locale === 'en' || locale === 'ar' || locale === 'admin') return locale;
    return 'en';
  },
);
