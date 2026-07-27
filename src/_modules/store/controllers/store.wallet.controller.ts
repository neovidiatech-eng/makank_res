import { Controller, ForbiddenException, Get, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { Auth } from 'src/_modules/authentication/decorators/auth.decorator';
import { CurrentUser } from 'src/_modules/authentication/decorators/current-user.decorator';
import { WalletService } from 'src/_modules/wallet/wallet.service';
import { tag } from 'src/globals/helpers/tag.helper';
import { ResponseService } from 'src/globals/services/response.service';

const prefix = 'stores/me';

@Controller(prefix)
@ApiTags(tag('Stores'))
@Auth({ prefix: 'wallet' })
export class StoreWalletController {
  constructor(
    private readonly response: ResponseService,
    private readonly walletService: WalletService,
  ) {}
  @Get('/wallet')
  async getWallet(
    @Res() res: Response,
    @CurrentUser() currentUser: CurrentUser,
  ) {
    if (!currentUser.storeId) {
      throw new ForbiddenException('Forbidden Resource');
    }
    const wallet = await this.walletService.getStoreWalletSummary(
      currentUser.storeId,
    );
    return this.response.success(res, 'Wallet returned successfully', wallet);
  }
}
