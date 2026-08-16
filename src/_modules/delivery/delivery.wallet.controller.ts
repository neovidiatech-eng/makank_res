import { Body, Controller, Get, Patch, Post, Put, Res } from '@nestjs/common';
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
