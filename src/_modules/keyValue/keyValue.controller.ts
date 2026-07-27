import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Res,
} from '@nestjs/common';
import { ApiQuery, ApiTags, PartialType } from '@nestjs/swagger';
import { ResponseService } from 'src/globals/services/response.service';

import { Response } from 'express';
import { Auth } from 'src/_modules/authentication/decorators/auth.decorator';
import { LocaleHeader } from 'src/_modules/authentication/decorators/locale.decorator';
import {
  ApiOptionalIdParam,
  ApiRequiredIdParam,
} from 'src/decorators/api/id-params.decorator';
import { UploadFile } from 'src/decorators/api/upload-file.decorator';
import { Filter } from 'src/decorators/param/filter.decorator';
import { RequiredIdParam } from 'src/dtos/params/id-param.dto';
import { CreateKeyValueDTO, UpdateKeyValueDTO } from './dto/create.dto';
import { FilterKeyValueDTO } from './dto/filter.dto';
import { KeyValueService } from './keyValue.service';

const prefix = 'KeyValue';

@Controller(prefix.toLowerCase())
@ApiTags(prefix)
export class KeyValueController {
  constructor(
    private keyValueService: KeyValueService,
    private responses: ResponseService,
  ) {}
  @Get(['/', '/:id'])
  @ApiQuery({ type: PartialType(FilterKeyValueDTO) })
  @ApiOptionalIdParam('id')
  async getAll(
    @Res() res: Response,
    @LocaleHeader() locale: Locale,
    @Filter({ dto: FilterKeyValueDTO }) filters: FilterKeyValueDTO,
  ) {
    const { data, total } = await this.keyValueService.getAll(locale, filters);
    return this.responses.success(res, 'Seasons returned successfully', data, {
      total,
    });
  }
  @Post('/')
  @Auth({ prefix })
  @UploadFile('file', 'KeyValue')
  async create(
    @Res() res: Response,
    @LocaleHeader() locale: Locale,
    @Body() body: CreateKeyValueDTO,
  ) {
    await this.keyValueService.create(body);
    return this.responses.created(res, 'KeyValue_created_successfully');
  }

  @Patch('/:id')
  @Auth({ prefix })
  @ApiRequiredIdParam('id')
  @UploadFile('file', 'KeyValue')
  async update(
    @Res() res: Response,
    @LocaleHeader() locale: Locale,
    @Body() body: UpdateKeyValueDTO,
    @Param() { id }: RequiredIdParam,
  ) {
    await this.keyValueService.update(id, body);
    return this.responses.created(res, 'KeyValue_updated_successfully');
  }

  @Delete('/:id')
  @Auth({ prefix })
  @ApiRequiredIdParam('id')
  async delete(
    @Res() res: Response,
    @LocaleHeader() locale: Locale,
    @Param() { id }: RequiredIdParam,
  ) {
    await this.keyValueService.delete(id);
    return this.responses.success(res, locale, 'delete_KeyValue_successfully');
  }
}
