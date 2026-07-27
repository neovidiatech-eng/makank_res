import { Body, Controller, Get, Post, Res } from '@nestjs/common';
import { ApiOkResponse, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { Auth } from 'src/_modules/authentication/decorators/auth.decorator';
import { ApiOptionalIdParam } from 'src/decorators/api/id-params.decorator';
import { Filter } from 'src/decorators/param/filter.decorator';
import { isOne } from 'src/globals/helpers/first-or-many';
import { buildExamples } from 'src/globals/helpers/generate-example.helper';
import { tag } from 'src/globals/helpers/tag.helper';
import { ResponseService } from 'src/globals/services/response.service';
import { CreateFundDTO, FilterFundDTO } from './dto/fund.dto';
import { FundService } from './fund.service';
import { selectFundOBJ } from './prisma-args/fund.prisma-args';

const prefix = 'fund';

@Controller(prefix)
@ApiTags(tag(prefix))
@Auth({ prefix })
export class FundController {
  constructor(
    private readonly service: FundService,
    private readonly responses: ResponseService,
  ) {}
  @Post('/')
  async create(@Res() res: Response, @Body() body: CreateFundDTO) {
    await this.service.create(body);
    return this.responses.created(res, 'fund created successfully');
  }

  @Get(['/', '/:id'])
  @ApiQuery({ type: FilterFundDTO })
  @ApiOkResponse(
    buildExamples([
      {
        title: 'Get All Fund',
        paginated: true,
        body: [{ ...selectFundOBJ() }],
      },
      {
        title: 'Get Fund with id',
        paginated: false,
        body: { ...selectFundOBJ() },
      },
    ]),
  )
  @ApiOptionalIdParam()
  async getAll(
    @Res() res: Response,
    @Filter({ dto: FilterFundDTO }) filters: FilterFundDTO,
  ) {
    const funds = await this.service.getAll(filters);
    const total = isOne(filters?.id)
      ? undefined
      : await this.service.count(filters);
    return this.responses.success(res, 'Funds returned successfully', funds, {
      total,
    });
  }
}
