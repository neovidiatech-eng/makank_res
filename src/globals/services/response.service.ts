import { HttpStatus, Injectable } from '@nestjs/common';
import { Response } from 'express';
import { I18nService } from 'nestjs-i18n';
import {
  deleteFile,
  deleteFiles,
  handelSucceededTemp,
} from 'src/_modules/media/helpers/handel-temp-files';
import { toBoolean } from '../helpers/boolean.helper';
import { timeColumnToHHmm } from '../helpers/egypt-time.helper';
import { localizedObject } from '../helpers/localized.return';

type ResOptions = {
  total?: number;
  code?: number;
  dashboardOptions?: any;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

@Injectable()
export class ResponseService {
  constructor(private readonly i18n: I18nService) {}

  async custom(
    response: Response,
    messageKey,
    dataKey?: any,
    options: ResOptions = {},
  ) {
    const { code, ...restOptions } = options;
    if (code && code !== 200 && code !== 201) {
      await this.reqDeleteFiles(response);
    }

    const data = this.localizeBody(
      dataKey,
      response.req.headers['locale'],
      response.req.headers['islocalized'],
    );
    const message = this.translateMessage(
      response.req.headers['locale'],
      messageKey,
    );

    return response.status(code || HttpStatus.OK).json({
      message,
      data,
      ...restOptions,
    });
  }

  success<Type>(
    response: Response,
    messageKey: string,
    dataKey?: Type | Type[] | null,
    options: ResOptions = {},
  ) {
    this.reqBasedEdits(response);
    const message = this.translateMessage(
      response.req.headers['locale'],
      messageKey,
    );

    const data = this.localizeBody(
      dataKey,
      response.req.headers['locale'],
      response.req.headers['islocalized'],
    );
    const { code, ...restOptions } = options;
    response.status(code || HttpStatus.OK).json({
      message,
      data,
      ...restOptions,
    });
  }

  created(
    response: Response,
    messageKey: string,
    dataKey?: object,
    options: ResOptions = {},
  ) {
    this.reqBasedEdits(response);

    const data = this.localizeBody(
      dataKey,
      response.req.headers['locale'],
      response.req.headers['islocalized'],
    );
    const message = this.translateMessage(
      response.req.headers['locale'],
      messageKey,
    );

    response.status(HttpStatus.CREATED).json({
      message,
      data,
      ...options,
    });
  }

  async forbidden(
    response: Response,
    messageKey: string,
    dataKey?: object,
    options: ResOptions = {},
  ) {
    await this.reqDeleteFiles(response);
    const message = this.translateMessage(
      response.req.headers['locale'],
      messageKey,
    );

    const data = this.localizeBody(
      dataKey,
      response.req.headers['locale'],
      response.req.headers['islocalized'],
    );
    return response.status(HttpStatus.FORBIDDEN).json({
      message,
      data,
      ...options,
    });
  }

  async conflict(
    response: Response,
    messageKey: string,
    dataKey?: object,
    options: ResOptions = {},
  ) {
    await this.reqDeleteFiles(response);
    const data = this.localizeBody(
      dataKey,
      response.req.headers['locale'],
      response.req.headers['islocalized'],
    );
    const message = this.translateMessage(
      response.req.headers['locale'],
      messageKey,
    );
    return response.status(HttpStatus.CONFLICT).json({
      message,
      data,
      ...options,
    });
  }

  async notFound(
    response: Response,
    messageKey: string,
    options: ResOptions = {},
  ) {
    await this.reqDeleteFiles(response);
    const message = this.translateMessage(
      response.req.headers['locale'],
      messageKey,
    );
    return response.status(HttpStatus.NOT_FOUND).json({
      message,
      ...options,
    });
  }

  async tooManyRequest(
    response: Response,
    messageKey: string,
    options: ResOptions = {},
  ) {
    await this.reqDeleteFiles(response);
    const message = this.translateMessage(
      response.req.headers['locale'],
      messageKey,
    );
    return response.status(HttpStatus.TOO_MANY_REQUESTS).json({
      message,
      ...options,
    });
  }

  async internalServerError(
    response: Response,
    messageKey: string,
    options: ResOptions = {},
  ) {
    await this.reqDeleteFiles(response);
    const message = this.translateMessage(
      response.req.headers['locale'],
      messageKey,
    );
    return response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      message,
      ...options,
    });
  }

  async unauthorized(
    response: Response,
    messageKey: string,
    options: ResOptions = {},
  ) {
    await this.reqDeleteFiles(response);
    const message = this.translateMessage(
      response.req.headers['locale'],
      messageKey,
    );

    return response.status(HttpStatus.UNAUTHORIZED).json({
      message,
      ...options,
    });
  }

  async badRequest(
    response: Response,
    messageKey: string,
    options: ResOptions = {},
  ) {
    await this.reqDeleteFiles(response);
    const message = this.translateMessage(
      response.req.headers['locale'],
      messageKey,
    );

    return response.status(HttpStatus.BAD_REQUEST).json({
      message,
      ...options,
    });
  }

  async unProcessableData(
    response: Response,
    messageKey: string,
    options: ResOptions = {},
  ) {
    await this.reqDeleteFiles(response);
    const message = this.translateMessage(
      response.req.headers['locale'],
      messageKey,
    );

    return response.status(HttpStatus.UNPROCESSABLE_ENTITY).json({
      message,
      ...options,
    });
  }
  private reqBasedEdits(response: Response) {
    const files = response.req.file || response.req.files;
    if (files) handelSucceededTemp(files);
  }

  private async reqDeleteFiles(response: Response) {
    const req = response.req as any; // optionally type this better
    const files = req.file || req.files;

    if (!files) return;

    if (Array.isArray(files)) {
      // case: upload.array()
      await deleteFiles(files);
    } else if (req.file) {
      // case: upload.single()
      await deleteFile(req.file);
    } else if (typeof files === 'object') {
      // case: upload.fields() — object with field names
      const allFiles = Object.values(files).flat();
      await deleteFiles(allFiles);
    }
  }
  private translateMessage(lang: string | string[], messageKey: string) {
    if (lang && Array.isArray(lang)) {
      const { extractedProperty, extractedKey } = this.getMessageArgs(
        messageKey[0],
      );
      if (extractedKey)
        return this.i18n.translate(`response.${extractedKey}`, {
          lang: lang[0],
          args: {
            property: extractedProperty,
          },
        });
      return this.i18n.translate(`response.${messageKey}`, {
        lang: lang[0],
      });
    }
    if (lang && typeof lang === 'string') {
      const { extractedProperty, extractedKey } = this.getMessageArgs(
        Array.isArray(messageKey) ? messageKey[0] : messageKey,
      );
      if (!extractedProperty) {
        return this.i18n.translate(`response.${messageKey}`, {
          lang,
        });
      }
      if (extractedKey)
        return this.i18n.translate(`response.${extractedKey}`, {
          lang,
          args: {
            property: extractedProperty,
          },
        });
      return this.i18n.translate(`response.${messageKey}`, {
        lang,
      });
    }
  }
  private getMessageArgs(messageKey: string) {
    const regexProperty = /\*(.*?)\*/;
    const regexKey = /0(.*?)0/;

    const matchProperty = messageKey.match(regexProperty);

    let extractedProperty;
    let extractedKey;

    if (matchProperty && matchProperty[1]) {
      extractedProperty = matchProperty[1];
    }

    // Strip the *property* span before extracting the 0KEY0 token. Otherwise a
    // property value that itself contains a "0" (e.g. *[10]*) lets the key
    // regex latch onto the wrong "0...0" span and produce a garbage key such as
    // "]* " — surfacing the infamous `response.]* ` message.
    const keySource = matchProperty
      ? messageKey.replace(matchProperty[0], '')
      : messageKey;
    const matchKey = keySource.match(regexKey);

    if (matchKey && matchKey[1]) {
      extractedKey = matchKey[1];
    }
    return { extractedProperty, extractedKey };
  }
  /**
   * Schedule `@db.Time` columns (`openingTime`/`closingTime`) come back from Prisma as
   * 1970-epoch `Date` objects. Expose them as Egypt wall-clock "HH:mm" strings on EVERY
   * response — localized (mobile) and raw (admin) alike — so clients never see an instant or
   * the localizer's `+2h` shift for schedule times. Mutates in place, before localization.
   *
   * Only these two field names are rewritten; they are used exclusively for schedule TIME
   * columns, so every other `Date` (createdAt, order dates, breakUntil, …) is left untouched
   * and keeps its existing serialization.
   */
  private stringifyScheduleTimes(data: unknown): void {
    if (Array.isArray(data)) {
      for (const item of data) this.stringifyScheduleTimes(item);
      return;
    }
    if (data === null || typeof data !== 'object' || data instanceof Date)
      return;
    const obj = data as Record<string, unknown>;
    for (const key of Object.keys(obj)) {
      const value = obj[key];
      if (
        (key === 'openingTime' || key === 'closingTime') &&
        value instanceof Date
      ) {
        obj[key] = timeColumnToHHmm(value);
      } else {
        this.stringifyScheduleTimes(value);
      }
    }
  }

  private localizeBody<T>(
    data: T,
    locale: string | string[],
    isLocalized: string | string[],
  ) {
    // Schedule TIME columns → "HH:mm" on every response (localized + raw), before any
    // locale/+2h handling so schedule fields never pick up the serializer shift.
    this.stringifyScheduleTimes(data);

    const Localized = Array.isArray(isLocalized)
      ? toBoolean(isLocalized[0])
      : toBoolean(isLocalized);
    if (!Localized) {
      return data; // If not localized, return data as is
    }
    const lang = Array.isArray(locale) ? locale[0] : locale;
    if (typeof data === 'object' && data !== null) {
      const x = localizedObject(data, lang);
      return x;
    }
    return data;
  }
}
//
