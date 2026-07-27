import { Body, Controller, Get, Param, Patch, Post, Res } from '@nestjs/common';
import { ApiQuery, ApiTags, PartialType } from '@nestjs/swagger';
import { Response } from 'express';
import { Auth } from 'src/_modules/authentication/decorators/auth.decorator';
import {
  ApiOptionalIdParam,
  ApiRequiredIdParam,
} from 'src/decorators/api/id-params.decorator';
import { Filter } from 'src/decorators/param/filter.decorator';
import { RequiredIdParam } from 'src/dtos/params/id-param.dto';
import { ResponseService } from 'src/globals/services/response.service';

import { isOne } from 'src/globals/helpers/first-or-many';
import { tag } from 'src/globals/helpers/tag.helper';

import { AttachStoreId } from 'src/decorators/api/attachStoreIdInterceptor.decorator';
import {
  CreateWithdrawDTO,
  FilterWithdrawDTO,
  UpdateWithdrawDTO,
} from './dto/withdraw.dto';
import { WithdrawService } from './withdraw.service';

const prefix = 'withdraw';

@Controller(prefix)
@ApiTags(tag(prefix))
export class WithdrawController {
  constructor(
    private readonly service: WithdrawService,
    private readonly response: ResponseService,
  ) {}

  @Post('/')
  @Auth({ prefix })
  @AttachStoreId()
  async create(@Res() res: Response, @Body() body: CreateWithdrawDTO) {
    await this.service.create(body);
    return this.response.created(res, 'Withdraw created successfully');
  }

  @Patch('/:id')
  @Auth({ prefix })
  @ApiRequiredIdParam()
  async update(
    @Res() res: Response,
    @Param() { id }: RequiredIdParam,
    @Body() body: UpdateWithdrawDTO,
  ) {
    await this.service.update(id, body);
    return this.response.created(res, 'Withdraw updated successfully');
  }
  @Get(['/', '/:id'])
  @Auth({ prefix })
  @AttachStoreId()
  @ApiQuery({ type: PartialType(FilterWithdrawDTO) })
  @ApiOptionalIdParam('id')
  async findAll(
    @Res() res: Response,
    @Filter({ dto: FilterWithdrawDTO }) filters: FilterWithdrawDTO,
  ) {
    const data = await this.service.findAll(filters);
    const total = isOne(filters?.id)
      ? undefined
      : await this.service.count(filters);

    return this.response.success(res, 'Withdraw fetched successfully', data, {
      total,
    });
  }
}
