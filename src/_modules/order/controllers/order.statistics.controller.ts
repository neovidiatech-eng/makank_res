import { Controller, Get, Res } from '@nestjs/common';
import { ApiQuery, ApiTags, PartialType } from '@nestjs/swagger';
import { Response } from 'express';
import { AttachStoreId } from 'src/decorators/api/attachStoreIdInterceptor.decorator';
import { Filter } from 'src/decorators/param/filter.decorator';
import { tag } from 'src/globals/helpers/tag.helper';
import { ResponseService } from 'src/globals/services/response.service';
import { Auth } from '../../authentication/decorators/auth.decorator';
import { CurrentUser } from '../../authentication/decorators/current-user.decorator';
import { FilterStoreWalletDTO } from '../dto/order.countStatus.filter.dto';
import { OrderService } from '../order.service';

const prefix = 'orders';

@Controller(prefix)
@ApiTags(tag('Order-Statistics'))
export class OrderStatisticsController {
  constructor(
    private readonly service: OrderService,
    private readonly response: ResponseService,
  ) {}

  @Get('/statistics')
  @Auth({ prefix: `${prefix}/statistics` })
  @AttachStoreId()
  @ApiQuery({ type: PartialType(FilterStoreWalletDTO) })
  async getStatistics(
    @Res() res: Response,
    @CurrentUser() user: CurrentUser,
    @Filter({ dto: FilterStoreWalletDTO })
    filters: FilterStoreWalletDTO,
  ) {
    const data = await this.service.orderStatistics(filters);

    return this.response.success(
      res,
      'orders_statistics_fetched_successfully',
      data,
    );
  }
}
