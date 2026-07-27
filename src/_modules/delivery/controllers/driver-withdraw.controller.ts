import { Body, Controller, Get, Param, Patch, Res } from '@nestjs/common';
import { ApiQuery, ApiTags, PartialType } from '@nestjs/swagger';
import { Response } from 'express';
import { Auth } from 'src/_modules/authentication/decorators/auth.decorator';
import {
  ApiOptionalIdParam,
  ApiRequiredIdParam,
} from 'src/decorators/api/id-params.decorator';
import { Filter } from 'src/decorators/param/filter.decorator';
import { RequiredIdParam } from 'src/dtos/params/id-param.dto';
import { isOne } from 'src/globals/helpers/first-or-many';
import { tag } from 'src/globals/helpers/tag.helper';
import { ResponseService } from 'src/globals/services/response.service';
import {
  FilterDriverWithdrawDTO,
  UpdateDriverWithdrawDTO,
} from '../dto/driver-withdraw.dto';
import { DriverWithdrawService } from '../services/driver-withdraw.service';

const prefix = 'delivery/withdrawals';

// Admin-facing: review, approve, or deny driver withdrawal requests.
@Controller(prefix)
@ApiTags(tag('Delivery'))
export class DriverWithdrawController {
  constructor(
    private readonly service: DriverWithdrawService,
    private readonly response: ResponseService,
  ) {}

  @Get(['/', '/:id'])
  @Auth({ prefix })
  @ApiQuery({ type: PartialType(FilterDriverWithdrawDTO) })
  @ApiOptionalIdParam()
  async findAll(
    @Res() res: Response,
    @Filter({ dto: FilterDriverWithdrawDTO }) filters: FilterDriverWithdrawDTO,
  ) {
    const data = await this.service.findAll(filters);
    const total = isOne(filters?.id)
      ? undefined
      : await this.service.count(filters);
    return this.response.success(
      res,
      'Withdraw requests fetched successfully',
      data,
      { total },
    );
  }

  @Patch('/:id')
  @Auth({ prefix })
  @ApiRequiredIdParam()
  async resolve(
    @Res() res: Response,
    @Param() { id }: RequiredIdParam,
    @Body() body: UpdateDriverWithdrawDTO,
  ) {
    await this.service.resolve(+id, body);
    return this.response.success(res, 'Withdraw request updated successfully');
  }
}
