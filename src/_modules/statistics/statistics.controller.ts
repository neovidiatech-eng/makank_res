import { Body, Controller, Get, Post, Res } from '@nestjs/common';
import { ApiQuery, ApiTags, PartialType } from '@nestjs/swagger';
import { Response } from 'express';
import { Auth } from 'src/_modules/authentication/decorators/auth.decorator';
import { AttachStoreId } from 'src/decorators/api/attachStoreIdInterceptor.decorator';
import { Filter } from 'src/decorators/param/filter.decorator';
import { ResponseService } from 'src/globals/services/response.service';

import { tag } from 'src/globals/helpers/tag.helper';
import { FilterStatisticsDTO } from './dto/statistics.dto';
import { StatisticsService } from './statistics.service';

const prefix = 'statistics';

@Controller(prefix)
@ApiTags(tag(prefix))
export class StatisticsController {
  constructor(
    private readonly service: StatisticsService,
    private readonly response: ResponseService,
  ) {}

  @Get('/')
  @Auth({ prefix })
  @ApiQuery({ type: PartialType(FilterStatisticsDTO) })
  async findAll(
    @Res() res: Response,
    @Filter({ dto: FilterStatisticsDTO }) filters: FilterStatisticsDTO,
  ) {
    const data = await this.service.getStatistics(filters);

    return this.response.success(res, 'Statistics fetched successfully', data);
  }

  // Single reference endpoint for the whole platform's financial picture —
  // revenue, discounts given, platform/store commission, wallet balances,
  // withdrawal requests, and cash drivers are holding. Supports the same
  // fromDate/toDate filter as GET /statistics (see service for exactly which
  // figures respect it vs. which are always a current snapshot).
  @Get('/financial-overview')
  @Auth({ prefix })
  @ApiQuery({ type: PartialType(FilterStatisticsDTO) })
  async findFinancialOverview(
    @Res() res: Response,
    @Filter({ dto: FilterStatisticsDTO }) filters: FilterStatisticsDTO,
  ) {
    const data = await this.service.getFinancialOverview(filters);
    return this.response.success(
      res,
      'Financial overview fetched successfully',
      data,
    );
  }

  @Get('/store')
  @Auth({ prefix: `${prefix}/store` })
  @AttachStoreId()
  @ApiQuery({ type: PartialType(FilterStatisticsDTO) })
  async findStoreStatistics(
    @Res() res: Response,
    @Filter({ dto: FilterStatisticsDTO }) filters: FilterStatisticsDTO,
  ) {
    const data = await this.service.getStoreDashboard(filters.storeId);

    return this.response.success(
      res,
      'Store statistics fetched successfully',
      data,
    );
  }

  // All-time historical facts (peak hour, best day, top/bottom product) —
  // not windowed like /store or /store/employee-performance.
  @Get('/store/sales-analytics')
  @Auth({ prefix: `${prefix}/store` })
  @AttachStoreId()
  @ApiQuery({ type: PartialType(FilterStatisticsDTO) })
  async findStoreSalesAnalytics(
    @Res() res: Response,
    @Filter({ dto: FilterStatisticsDTO }) filters: FilterStatisticsDTO,
  ) {
    const data = await this.service.getSalesAnalytics(filters.storeId);
    return this.response.success(
      res,
      'Store sales analytics fetched successfully',
      data,
    );
  }

  // Rolling 30-day window, same as /store.
  @Get('/store/employee-performance')
  @Auth({ prefix: `${prefix}/store` })
  @AttachStoreId()
  @ApiQuery({ type: PartialType(FilterStatisticsDTO) })
  async findStoreEmployeePerformance(
    @Res() res: Response,
    @Filter({ dto: FilterStatisticsDTO }) filters: FilterStatisticsDTO,
  ) {
    const data = await this.service.getEmployeePerformance(filters.storeId);
    return this.response.success(
      res,
      'Store employee performance fetched successfully',
      data,
    );
  }

  // Manual checkpoint only — never deletes any Order/Transaction row. Historical
  // data stays reachable via the existing fromDate/toDate filters on GET /statistics.
  @Post('/reset-period')
  @Auth({ prefix })
  async resetPeriod(@Res() res: Response) {
    const data = await this.service.resetAdminPeriod();
    return this.response.success(
      res,
      'Dashboard period reset successfully',
      data,
    );
  }

  @Post('/store/reset-period')
  @Auth({ prefix: `${prefix}/store` })
  @AttachStoreId()
  async resetStorePeriod(@Res() res: Response, @Body() body: { storeId: Id }) {
    const data = await this.service.resetStorePeriod(body.storeId);
    return this.response.success(
      res,
      'Store dashboard period reset successfully',
      data,
    );
  }
}
