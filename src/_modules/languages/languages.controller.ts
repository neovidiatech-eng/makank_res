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
import {
  ApiOkResponse,
  ApiParam,
  ApiQuery,
  ApiTags,
  PartialType,
} from '@nestjs/swagger';
import { Response } from 'express';
import { Auth } from 'src/_modules/authentication/decorators/auth.decorator';
import { UploadMultipleFiles } from 'src/decorators/api/upload-file.decorator';
import { Filter } from 'src/decorators/param/filter.decorator';
import { isOne } from 'src/globals/helpers/first-or-many';
import {
  ApiDefaultOkResponse,
  buildExamples,
} from 'src/globals/helpers/generate-example.helper';
import { tag } from 'src/globals/helpers/tag.helper';
import { ResponseService } from 'src/globals/services/response.service';
import {
  CreateLanguagesDTO,
  FilterLanguagesDTO,
  UpdateLanguagesDTO,
} from './dto/languages.dto';
import { LanguagesService } from './languages.service';
import { selectLanguagesOBJ } from './prisma-args/languages.prisma.args';
const prefix = 'languages';

@Controller(prefix)
@ApiTags(tag(prefix))
export class LanguagesController {
  constructor(
    private readonly service: LanguagesService,
    private readonly response: ResponseService,
  ) {}

  @Post('/')
  @ApiDefaultOkResponse(null)
  @UploadMultipleFiles([
    {
      name: 'file',
      filePath: '/i18n',
      fileType: 'application/json',
    },
    {
      name: 'frontFile',
      filePath: '/i18n',
      fileType: 'application/json',
    },
  ])
  @Auth({ prefix })
  async create(@Res() res: Response, @Body() body: CreateLanguagesDTO) {
    await this.service.handelFile(body);
    await this.service.create(body);
    return this.response.created(res, 'language created successfully');
  }

  @Patch('/:key')
  @UploadMultipleFiles([
    {
      name: 'file',
      filePath: '/i18n',
      fileType: 'application/json',
    },
    {
      name: 'frontFile',
      filePath: '/i18n',
      fileType: 'application/json',
    },
  ])
  @ApiDefaultOkResponse(null)
  @Auth({ prefix })
  @ApiParam({
    type: 'string',
    name: 'key',
    required: true,
  })
  async update(
    @Res() res: Response,
    @Body() body: UpdateLanguagesDTO,
    @Param('key') key: string,
  ) {
    body.key = key;
    if (body.file) await this.service.handelFile(body);
    await this.service.update(body);
    return this.response.created(res, 'language updated successfully');
  }
  @Get(['/', '/:key'])
  @ApiParam({
    type: 'string',
    name: 'key',
    required: false,
  })
  @ApiQuery({ type: PartialType(FilterLanguagesDTO) })
  @ApiOkResponse(
    buildExamples([
      {
        title: 'Get All Languages',
        paginated: true,
        body: [selectLanguagesOBJ()],
      },
      {
        title: 'Single Language',
        paginated: false,
        body: selectLanguagesOBJ(),
      },
    ]),
  )
  async findAll(
    @Res() res: Response,
    @Filter({ dto: FilterLanguagesDTO }) filters: FilterLanguagesDTO,
  ) {
    const data = await this.service.findAll(filters);
    const total = isOne(filters?.key)
      ? undefined
      : await this.service.count(filters);

    return this.response.success(res, 'language fetched successfully', data, {
      total,
    });
  }

  @Delete('/:key')
  @Auth({ prefix })
  @ApiParam({
    type: 'string',
    name: 'key',
    required: true,
  })
  @ApiDefaultOkResponse(null)
  async delete(@Res() res: Response, @Param('key') key: string) {
    await this.service.delete(key);
    return this.response.success(res, 'delete language successfully');
  }
}
