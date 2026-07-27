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
import { ApiOkResponse, ApiQuery, ApiTags, PartialType } from '@nestjs/swagger';
import { Response } from 'express';
import { Auth } from 'src/_modules/authentication/decorators/auth.decorator';
import {
  ApiOptionalIdParam,
  ApiRequiredIdParam,
} from 'src/decorators/api/id-params.decorator';
import { Filter } from 'src/decorators/param/filter.decorator';
import { RequiredIdParam } from 'src/dtos/params/id-param.dto';
import { ResponseService } from 'src/globals/services/response.service';

import { UploadFile } from 'src/decorators/api/upload-file.decorator';
import { isOne } from 'src/globals/helpers/first-or-many';
import { buildExamples } from 'src/globals/helpers/generate-example.helper';
import { tag } from 'src/globals/helpers/tag.helper';
import { CityService } from './city.service';
import { CreateCityDTO, FilterCityDTO, UpdateCityDTO } from './dto/city.dto';
import { selectCityOBJ } from './prisma-args/city.prisma.args';

const prefix = 'cities';

@Controller(prefix)
@ApiTags(tag(prefix))
export class CityController {
  constructor(
    private readonly service: CityService,
    private readonly response: ResponseService,
  ) {}

  @Post('/')
  @Auth({ prefix })
  async create(@Res() res: Response, @Body() body: CreateCityDTO) {
    await this.service.create(body);
    return this.response.created(res, 'City created successfully');
  }

  @Patch('/:id')
  @Auth({ prefix })
  @UploadFile('image')
  @ApiRequiredIdParam()
  async update(
    @Res() res: Response,
    @Param() { id }: RequiredIdParam,
    @Body() body: UpdateCityDTO,
  ) {
    await this.service.update(id, body);
    return this.response.created(res, 'City updated successfully');
  }
  @Get(['/', '/:id'])
  @ApiOkResponse(
    buildExamples([
      {
        title: 'Get All Citys',
        paginated: true,
        body: [selectCityOBJ()],
      },
      {
        title: 'Single City',
        paginated: false,
        body: selectCityOBJ(),
      },
    ]),
  )
  @Auth({ prefix, visitor: true })
  @ApiQuery({ type: PartialType(FilterCityDTO) })
  @ApiOptionalIdParam('id')
  async findAll(
    @Res() res: Response,
    @Filter({ dto: FilterCityDTO }) filters: FilterCityDTO,
  ) {
    const data = await this.service.findAll(filters);
    const total = isOne(filters?.id)
      ? undefined
      : await this.service.count(filters);

    return this.response.success(res, 'City fetched successfully', data, {
      total,
    });
  }

  @Delete('/:id')
  @ApiRequiredIdParam()
  @Auth({ prefix })
  async delete(@Res() res: Response, @Param() { id }: RequiredIdParam) {
    await this.service.delete(id);
    return this.response.success(res, 'delete City successfully');
  }
}
