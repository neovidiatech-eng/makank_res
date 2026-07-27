import { Controller, Get, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { WalletService } from 'src/_modules/wallet/wallet.service';
import { tag } from 'src/globals/helpers/tag.helper';
import { ResponseService } from 'src/globals/services/response.service';
import { Auth } from '../../authentication/decorators/auth.decorator';
import { CurrentUser } from '../../authentication/decorators/current-user.decorator';

const prefix = 'wallet';
@Controller('users/me')
@ApiTags(tag('profile'))
@Auth({ prefix })
export class MeWalletController {
  constructor(
    private service: WalletService,
    private responses: ResponseService,
  ) {}
  @Get('/wallet')
  async getWallet(
    @Res() res: Response,
    @CurrentUser() currentUser: CurrentUser,
  ) {
    const wallet = await this.service.getWallet(currentUser.id);
    return this.responses.success(res, 'Wallet returned successfully', wallet);
  }
}
