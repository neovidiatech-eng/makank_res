import { Body, Controller, Get, Param, Patch, Post, Put, Query, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { Auth } from 'src/_modules/authentication/decorators/auth.decorator';
import { CurrentUser } from 'src/_modules/authentication/decorators/current-user.decorator';
import { WalletService } from 'src/_modules/wallet/wallet.service';
import { tag } from 'src/globals/helpers/tag.helper';
import { ResponseService } from 'src/globals/services/response.service';
import { CreateDriverWithdrawDTO } from './dto/driver-withdraw.dto';
import { DriverWithdrawService } from './services/driver-withdraw.service';

import { DeliveryService } from './delivery.service';

const prefix = 'delivery/me';

@Controller(prefix)
@ApiTags(tag('Delivery'))
@Auth()
export class DeliveryWalletController {
  constructor(
    private readonly response: ResponseService,
    private readonly walletService: WalletService,
    private readonly withdrawService: DriverWithdrawService,
    private readonly deliveryService: DeliveryService,
  ) {}

  @Get('/wallet')
  async getWallet(@Res() res: Response, @CurrentUser('id') userId: number) {
    const wallet = await this.walletService.getDriverWalletSummary(userId);
    return this.response.success(res, 'Wallet returned successfully', wallet);
  }

  @Get('/daily-statistics')
  async getDailyStatistics(
    @Res() res: Response,
    @CurrentUser('id') userId: number,
    @Query('date') date?: string,
  ) {
    const data = await this.walletService.getDriverDailyStatistics(userId, date);
    return this.response.success(res, 'Daily statistics fetched successfully', data);
  }

  @Get('/daily-orders')
  async getDailyOrders(
    @Res() res: Response,
    @CurrentUser('id') userId: number,
    @Query('date') date?: string,
  ) {
    const data = await this.walletService.getDriverDailyOrders(userId, date);
    return this.response.success(res, 'Daily orders fetched successfully', data);
  }

  @Get('/orders/:id/financial-breakdown')
  async getOrderFinancialBreakdown(
    @Res() res: Response,
    @Param('id') id: string,
  ) {
    const data = await this.walletService.getOrderFinancialBreakdown(+id);
    return this.response.success(res, 'Order financial breakdown fetched successfully', data);
  }

  @Post('/withdraw')
  async requestWithdraw(
    @Res() res: Response,
    @CurrentUser('id') userId: number,
    @Body() body: CreateDriverWithdrawDTO,
  ) {
    await this.withdrawService.requestWithdraw(userId, body);
    return this.response.created(
      res,
      'Withdraw request submitted successfully',
    );
  }

  @Get('/withdrawals')
  async getMyWithdrawals(
    @Res() res: Response,
    @CurrentUser('id') userId: number,
  ) {
    const data = await this.withdrawService.findAll({
      deliveryId: userId,
    } as any);
    return this.response.success(
      res,
      'Withdraw requests fetched successfully',
      data,
    );
  }

  @Put('/location')
  @Patch('/location')
  @Post('/location')
  async updateLocation(
    @CurrentUser('id') userId: number,
    @Body() body: any,
  ) {
    return this.deliveryService.updateLocation(
      userId,
      body.lat,
      body.lng,
      body.bearing,
    );
  }
}
