import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Injectable,
} from '@nestjs/common';
import { Response } from 'express';
import { I18nService } from 'nestjs-i18n';
import { ResponseService } from 'src/globals/services/response.service';

@Catch()
@Injectable()
export class GlobalExceptionFilter implements ExceptionFilter {
  constructor(
    private readonly i18n: I18nService, // Inject i18n service
    private readonly responseService: ResponseService, // Inject ResponseService
  ) {}

  async catch(exception: HttpException, host: ArgumentsHost) {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const message = exception.getResponse() as any;
      const messageKey = message['message'] || message;

      switch (status) {
        case 500:
          this.responseService.internalServerError(response, messageKey);
          break;
        case 400: {
          this.responseService.badRequest(response, messageKey);
          break;
        }
        case 401:
          this.responseService.unauthorized(response, messageKey);
          break;
        case 403:
          this.responseService.forbidden(
            response,
            messageKey,
            exception['response']['data'],
          );
          break;
        case 404:
          this.responseService.notFound(response, messageKey);
          break;
        case 409:
          this.responseService.conflict(response, messageKey);
          break;
        case 429:
          this.responseService.tooManyRequest(response, messageKey);
          break;
        case 412:
          {
            this.responseService.custom(
              response,
              messageKey,
              exception['options']['data'],
              { code: status },
            );
          }
          break;
        case 413:
          this.responseService.badRequest(response, messageKey);
          break;
        case 422:
          this.responseService.unProcessableData(response, messageKey);
          break;
        default:
          // eslint-disable-next-line no-console
          console.log(exception);
          break;
      }
    } else if ((exception as any)?.code === 'P2002') {
      // Prisma unique-constraint violations are not HttpExceptions, so without
      // this they fall through to a generic 500. Map them to a clean 409 with a
      // field-specific message derived from the violated constraint name
      // (e.g. users_phone_role_key_key -> phone_already_exists).
      const target = (exception as any)?.meta?.target;
      const field = Array.isArray(target)
        ? target.join(',')
        : typeof target === 'string'
          ? target
          : '';
      const messageKey = field.includes('phone')
        ? 'phone_already_exists'
        : field.includes('email')
          ? 'email_already_exists'
          : 'user_already_exist';
      this.responseService.conflict(response, messageKey);
    } else {
      if (env('PROCESS') && env('PROCESS') === 'production') {
      } else {
        // eslint-disable-next-line no-console
        console.log(exception);
      }

      this.responseService.internalServerError(
        response,
        'Internal server error',
      );
    }
  }
}
