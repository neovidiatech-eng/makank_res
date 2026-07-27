import { Injectable, NestMiddleware, NotFoundException } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { PrismaService } from '../services/prisma.service';

@Injectable()
export class LocaleMiddleware implements NestMiddleware {
  constructor(private readonly prisma: PrismaService) {}

  async use(req: Request, _: Response, next: NextFunction) {
    const localeHeader = req.headers['locale'];
    const acceptLanguageHeader = req.headers['accept-language']?.toString();

    const localeBeforeFilter = localeHeader || acceptLanguageHeader || 'en';
    const locale = Array.isArray(localeBeforeFilter)
      ? localeBeforeFilter[0].toLowerCase()
      : localeBeforeFilter.toLowerCase();
    const isFound = await this.prisma.language.findUnique({
      where: { key: locale },
    });

    if (!isFound && !req.url.toLowerCase().includes('media')) {
      throw new NotFoundException(`This language not found or not supported.`);
    }

    next();
  }
}
