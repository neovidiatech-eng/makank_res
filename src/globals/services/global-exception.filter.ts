import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { I18nService } from 'nestjs-i18n';

@Catch(HttpException)
export class GlobalExceptionFilter implements ExceptionFilter {
  constructor(private readonly i18n: I18nService) {}

  async catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    // Extract language from request headers (default to English)
    const lang = request.headers['accept-language'] || 'en';

    // Get exception response
    const exceptionResponse = exception.getResponse();
    let message = 'internal_server_error'; // Default translation key

    if (typeof exceptionResponse === 'string') {
      message = exceptionResponse;
    } else if (
      typeof exceptionResponse === 'object' &&
      (exceptionResponse as any).message
    ) {
      message = (exceptionResponse as any).message;
    }

    // If message is an array (e.g., validation errors), translate each one
    let translatedMessage;
    if (Array.isArray(message)) {
      translatedMessage = await Promise.all(
        message.map(
          async (msg) => await this.i18n.translate(`${msg}`, { lang }),
        ),
      );
    } else {
      translatedMessage = await this.i18n.translate(`${message}`, {
        lang,
      });
    }

    // Get HTTP status or default to 500
    const status = exception.getStatus
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    response.status(status).json({
      statusCode: status,
      message: translatedMessage,
      error: exception.name || 'Error',
    });
  }
}
