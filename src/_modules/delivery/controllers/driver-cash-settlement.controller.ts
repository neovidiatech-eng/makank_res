import { Body, Controller, Get, Post, Res } from '@nestjs/common';
import { ApiQuery, ApiTags, PartialType } from '@nestjs/swagger';
import { Response } from 'express';
import { Auth } from 'src/_modules/authentication/decorators/auth.decorator';
import { ApiOptionalIdParam } from 'src/decorators/api/id-params.decorator';
import { Filter } from 'src/decorators/param/filter.decorator';
import { isOne } from 'src/globals/helpers/first-or-many';
import { tag } from 'src/globals/helpers/tag.helper';
import { ResponseService } from 'src/globals/services/response.service';
import {
  CreateCashSettlementDTO,
  FilterCashSettlementDTO,
} from '../dto/driver-cash-settlement.dto';
import { DriverCashSettlementService } from '../services/driver-cash-settlement.service';

const prefix = 'delivery/cash-settlements';

// Admin-facing: record a physical COD cash handover received from a driver.
@Controller(prefix)
@ApiTags(tag('Delivery'))
export class DriverCashSettlementController {
  constructor(
    private readonly service: DriverCashSettlementService,
    private readonly response: ResponseService,
  ) {}

  @Post('/')
  @Auth({ prefix })
  async create(@Res() res: Response, @Body() body: CreateCashSettlementDTO) {
    await this.service.create(body);
    return this.response.created(res, 'Cash settlement recorded successfully');
  }

  @Get(['/', '/:id'])
  @Auth({ prefix })
  @ApiQuery({ type: PartialType(FilterCashSettlementDTO) })
  @ApiOptionalIdParam()
  async findAll(
    @Res() res: Response,
    @Filter({ dto: FilterCashSettlementDTO }) filters: FilterCashSettlementDTO,
  ) {
    const data = await this.service.findAll(filters);
    const total = isOne(filters?.id)
      ? undefined
      : await this.service.count(filters);
    return this.response.success(
      res,
      'Cash settlements fetched successfully',
      data,
      { total },
    );
  }
}
