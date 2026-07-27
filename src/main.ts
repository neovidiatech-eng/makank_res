import './declares';
// organize-imports-disable-above
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import * as cookieParser from 'cookie-parser';
import { config } from 'dotenv';
import { I18nService } from 'nestjs-i18n';
import * as requestIp from 'request-ip';
import * as swStats from 'swagger-stats';

import * as path from 'path';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app/app.module';
import { corsConfig } from './configs/cors.config';
import { morganMiddleware } from './configs/morgan.config';
import { globalValidationPipeOptions } from './configs/pipes.config';
import { swaggerConfig } from './configs/swagger.config';
import { GlobalExceptionFilter } from './globals/filters/global.exception.filter';
import { assertEgyptTimeZoneAvailable } from './globals/helpers/egypt-time.helper';
import { ResponseService } from './globals/services/response.service';
// import './instrument.ts';

const environment = env('NODE_ENV') || 'development';
const envFileName = environment == 'production' ? '.env.prod' : '.env';
config({ path: envFileName, override: true });

async function bootstrap() {
  // Fail fast if the runtime cannot resolve Africa/Cairo (e.g. a small-icu build):
  // every shift / store-hours rule depends on it (see egypt-time.helper).
  assertEgyptTimeZoneAvailable();

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    cors: corsConfig,
    logger: environment !== 'production' ? ['error', 'warn', 'log'] : false,
  });

  // Serve the uploads directory statically under all common prefixes
  const uploadsDir = path.join(process.cwd(), 'uploads');
  app.useStaticAssets(uploadsDir, { prefix: '/uploads/' });
  app.useStaticAssets(uploadsDir, { prefix: '/uploads' });
  app.useStaticAssets(uploadsDir, { prefix: '/api/uploads/' });
  app.useStaticAssets(uploadsDir, { prefix: '/api/uploads' });
  app.useStaticAssets(uploadsDir, { prefix: '/api/uploads/uploads/' });
  app.useStaticAssets(uploadsDir, { prefix: '/uploads/uploads/' });

  const port = +env('PORT') || 3000;

  app.use(morganMiddleware);

  app.use(cookieParser(env('COOKIE_SECRET'), {}));
  const i18nService =
    app.get<I18nService<Record<string, unknown>>>(I18nService);
  const responseService = app.get(ResponseService);

  const prefix = env('API_PREFIX') || '';

  app.setGlobalPrefix(prefix);

  // app.useLogger(new Logger()); // By default, it logs the requests

  app.useGlobalFilters(new GlobalExceptionFilter(i18nService, responseService));

  app.useGlobalPipes(new ValidationPipe(globalValidationPipeOptions));

  app.use(swStats.getMiddleware());
  app.set('trust proxy', true);

  app.use(
    requestIp.mw({
      attributeName: 'clientIp',
    }),
  );

  swaggerConfig(app);

  await app.listen(port, async () => {
    // await compareSwagger();
    // eslint-disable-next-line no-console
    console.info(`server is running on port ${port}`);
    // eslint-disable-next-line no-console
    console.info(
      `Swagger is running on http://localhost:${port}${prefix}/docs`,
    );
  });
}
bootstrap();
