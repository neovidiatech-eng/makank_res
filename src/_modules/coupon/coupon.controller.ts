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
import { CouponService } from './coupon.service';
import {
  CreateCouponDTO,
  FilterCouponDTO,
  UpdateCouponDTO,
} from './dto/coupon.dto';
import { selectCouponOBJ } from './prisma-args/coupon.prisma.args';

const prefix = 'coupons';

@Controller(prefix)
@ApiTags(tag(prefix))
@Auth({ prefix })
export class CouponController {
  constructor(
    private readonly service: CouponService,
    private readonly response: ResponseService,
  ) {}

  @Post('/')
  async create(@Res() res: Response, @Body() body: CreateCouponDTO) {
    await this.service.create(body);
    return this.response.created(res, 'coupon created successfully');
  }

  @Patch('/:id')
  @ApiRequiredIdParam()
  async update(
    @Res() res: Response,
    @Param() { id }: RequiredIdParam,
    @Body() body: UpdateCouponDTO,
  ) {
    await this.service.update(id, body);
    return this.response.created(res, 'coupon updated successfully');
  }
  @Get(['/', '/:id'])
  @ApiOkResponse(
    buildExamples([
      {
        title: 'Get All Coupons',
        paginated: true,
        body: [selectCouponOBJ()],
      },
      {
        title: 'Single Coupon',
        paginated: false,
        body: selectCouponOBJ(),
      },
    ]),
  )
  @ApiQuery({ type: PartialType(FilterCouponDTO) })
  @ApiOptionalIdParam('id')
  async findAll(
    @Res() res: Response,
    @Filter({ dto: FilterCouponDTO }) filters: FilterCouponDTO,
  ) {
    const data = await this.service.findAll(filters);
    const total = isOne(filters?.id)
      ? undefined
      : await this.service.count(filters);

    return this.response.success(res, 'coupon fetched successfully', data, {
      total,
    });
  }

  @Delete('/:id')
  @ApiRequiredIdParam()
  async delete(@Res() res: Response, @Param() { id }: RequiredIdParam) {
    await this.service.delete(id);
    return this.response.success(res, 'delete coupon successfully');
  }
}
