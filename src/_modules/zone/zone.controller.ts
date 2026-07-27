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
import { isOne } from 'src/globals/helpers/first-or-many';
import { buildExamples } from 'src/globals/helpers/generate-example.helper';
import { tag } from 'src/globals/helpers/tag.helper';
import { ResponseService } from 'src/globals/services/response.service';
import { CreateZoneDTO, FilterZoneDTO, UpdateZoneDTO } from './dto/zone.dto';
import { selectZoneOBJ } from './prisma-args/zone.prisma.args';
import { ZoneService } from './zone.service';

const prefix = 'zones';

@Controller(prefix)
@ApiTags(tag(prefix))
export class ZoneController {
  constructor(
    private readonly service: ZoneService,
    private readonly response: ResponseService,
  ) {}

  @Post('/')
  @Auth({ prefix })
  async create(@Res() res: Response, @Body() body: CreateZoneDTO) {
    await this.service.create(body);
    return this.response.created(res, 'zone created successfully');
  }

  @Patch('/:id')
  @Auth({ prefix })
  @ApiRequiredIdParam()
  async update(
    @Res() res: Response,
    @Param() { id }: RequiredIdParam,
    @Body() body: UpdateZoneDTO,
  ) {
    await this.service.update(id, body);
    return this.response.created(res, 'zone updated successfully');
  }

  @Get(['/', '/:id'])
  @ApiOkResponse(
    buildExamples([
      {
        title: 'Get All Zones',
        paginated: true,
        body: [selectZoneOBJ()],
      },
      {
        title: 'Single Zone',
        paginated: false,
        body: selectZoneOBJ(),
      },
    ]),
  )
  @Auth({ prefix, visitor: true })
  @ApiQuery({ type: PartialType(FilterZoneDTO) })
  @ApiOptionalIdParam('id')
  async findAll(
    @Res() res: Response,
    @Filter({ dto: FilterZoneDTO }) filters: FilterZoneDTO,
  ) {
    const data = await this.service.findAll(filters);
    const total = isOne(filters?.id)
      ? undefined
      : await this.service.count(filters);

    return this.response.success(res, 'zone fetched successfully', data, {
      total,
    });
  }

  @Delete('/:id')
  @ApiRequiredIdParam()
  @Auth({ prefix })
  async delete(@Res() res: Response, @Param() { id }: RequiredIdParam) {
    await this.service.delete(id);
    return this.response.success(res, 'delete zone successfully');
  }
}
