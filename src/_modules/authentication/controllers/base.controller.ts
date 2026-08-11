import {
  Body,
  Controller,
  Post,
  Res,
  UnprocessableEntityException,
  UseInterceptors,
} from '@nestjs/common';
import { ApiParam, ApiTags } from '@nestjs/swagger';
import { SessionType } from '@prisma/client';
import { Response } from 'express';
import { CurrentUser } from 'src/_modules/authentication/decorators/current-user.decorator';
import { RolesKeys } from 'src/_modules/authorization/providers/roles';
import { cookieConfig } from 'src/configs/cookie.config';
import { ApiDefaultOkResponse } from 'src/globals/helpers/generate-example.helper';
import { tag } from 'src/globals/helpers/tag.helper';
import { ResponseService } from 'src/globals/services/response.service';
import { Auth } from '../decorators/auth.decorator';
import { IpAddress } from '../decorators/ip.decorator';
import { LocaleHeader } from '../decorators/locale.decorator';
import { ForgetPasswordDTO } from '../dto/forgot-password.dto';
import { GoogleLoginDTO } from '../dto/google-login.dto';
import { BioLoginDTO, EmailPasswordLoginDTO } from '../dto/login.dto';
import { ResetPasswordDTO } from '../dto/reset-password.dto';
import { VerifyOtpDTO } from '../dto/verify-otp.dto';
import { RoleInterceptor } from '../interceptor/role.interceptor';
import { BaseAuthenticationService } from '../services/base.authentication.service';

const prefix = 'authentication';
@Controller(prefix)
@ApiTags(tag(prefix))
export class BaseAuthenticationController {
  constructor(
    private readonly service: BaseAuthenticationService,

    private readonly response: ResponseService,
  ) {}

  @Post(['refresh-token', 'refresh-token/:role'])
  @ApiDefaultOkResponse(null)
  @Auth({ type: SessionType.REFRESH })
  async refreshToken(
    @IpAddress() ip: string,
    @Res() res: Response,
    @CurrentUser('id') userId: Id,
    @CurrentUser('languageId') languageId: string,
  ) {
    const { user, AccessToken, RefreshToken } = await this.service.refreshToken(
      ip,
      userId,
      languageId,
    );

    res.cookie(env('ACCESS_TOKEN_COOKIE_KEY'), AccessToken, cookieConfig);

    return this.response.success(res, 'Token refreshed successfully', {
      user,
      accessToken: AccessToken,
      refreshToken: RefreshToken,
      AccessToken,
      RefreshToken,
    });
  }

  @Post('bio')
  async loginWithBIO(
    @IpAddress() ip: string,
    @Res() res: Response,
    @Body() dto: BioLoginDTO,
  ) {
    const data = await this.service.getBioInfo(dto);
    if (!data) throw new UnprocessableEntityException('Face Id not registered');

    const { user, AccessToken, RefreshToken, unReadNotifications } =
      await this.service.login(ip, {
        email: data?.email,
        phone: data?.phone,
        password: undefined,
        fcm: dto.fcm,
        roleKey: data.roleKey,
        locale: dto.locale,
      });

    res.cookie(env('ACCESS_TOKEN_COOKIE_KEY'), AccessToken, cookieConfig);

    return this.response.success(res, 'User Logged In Successfully', {
      user,
      unReadNotifications,
      AccessToken,
      RefreshToken,
    });
  }

  // Customer-only "Sign in with Google" — one call both registers (first time)
  // and logs in (returning users), same response shape as /login/:roleKey.
  @Post('google')
  async loginWithGoogle(
    @IpAddress() ip: string,
    @Res() res: Response,
    @Body() dto: GoogleLoginDTO,
  ) {
    const { user, AccessToken, RefreshToken, unReadNotifications } =
      await this.service.loginWithGoogle(ip, dto);

    res.cookie(env('ACCESS_TOKEN_COOKIE_KEY'), AccessToken, cookieConfig);

    return this.response.success(res, 'User Logged In Successfully', {
      user,
      unReadNotifications,
      AccessToken,
      RefreshToken,
    });
  }

  @Post('login/:roleKey')
  @ApiParam({
    name: 'roleKey',
    enum: Object.values(RolesKeys),
    required: true,
  })
  @UseInterceptors(RoleInterceptor)
  async login(
    @IpAddress() ip: string,
    @Res() res: Response,
    @Body() dto: EmailPasswordLoginDTO,
  ) {
    await this.service.validateDto(dto);
    const { user, AccessToken, RefreshToken, unReadNotifications } =
      await this.service.login(ip, dto);

    res.cookie(env('ACCESS_TOKEN_COOKIE_KEY'), AccessToken, cookieConfig);

    return this.response.success(res, 'User Logged In Successfully', {
      user,
      unReadNotifications,
      AccessToken,
      RefreshToken,
    });
  }

  @Post('forget-password/:roleKey')
  @ApiParam({
    name: 'roleKey',
    enum: Object.values(RolesKeys),
    required: true,
  })
  @UseInterceptors(RoleInterceptor)
  async forgetPassword(
    @IpAddress() ip: string,
    @Res() res: Response,
    @Body() dto: ForgetPasswordDTO,
  ) {
    const { user, token } = await this.service.forgetPassword(ip, dto);

    res.cookie(env('VERIFY_TOKEN_COOKIE_KEY'), token, cookieConfig);

    return this.response.success(res, 'otp sent to email successfully', {
      user,
      token,
    });
  }

  @Post('resend-otp')
  @Auth({ type: SessionType.VERIFY })
  async resendOtp(
    @IpAddress() ip: string,
    @Res() res: Response,
    @CurrentUser() currentUser: CurrentUser,
  ) {
    const token = await this.service.resendOtp(ip, currentUser.id);

    return this.response.success(res, 'otp resent successfully', token);
  }

  @Post('verify')
  @Auth({ type: SessionType.VERIFY })
  async verifyUser(
    @IpAddress() ip: string,
    @Res() res: Response,
    @Body() dto: VerifyOtpDTO,
    @CurrentUser() currentUser: CurrentUser,
    @LocaleHeader() locale: string,
  ) {
    const { user, unReadNotifications, AccessToken, RefreshToken } =
      await this.service.verify(ip, currentUser.id, dto, locale);

    res.cookie(env('ACCESS_TOKEN_COOKIE_KEY'), AccessToken, cookieConfig);

    return this.response.success(res, 'user verified successfully', {
      user,
      unReadNotifications,
      AccessToken,
      RefreshToken,
    });
  }

  @Post('verify-reset-password')
  @Auth({ type: SessionType.VERIFY })
  async verifyOtp(
    @IpAddress() ip: string,
    @Res() res: Response,
    @Body() dto: VerifyOtpDTO,
    @CurrentUser() currentUser: CurrentUser,
  ) {
    const { user, token } = await this.service.verifyReset(
      currentUser.id,
      dto,
      ip,
    );

    res.cookie(env('RESET_PASSWORD_TOKEN_COOKIE_KEY'), token, cookieConfig);

    return this.response.success(res, 'user verified successfully', {
      user,
      token,
    });
  }

  @Post('reset-password')
  @Auth({ type: SessionType.PASSWORD_RESET })
  async resetPassword(
    @Res() res: Response,
    @Body() dto: ResetPasswordDTO,
    @CurrentUser('id') userId: Id,
  ) {
    await this.service.resetPassword(userId, dto);

    return this.response.success(res, 'password reset successfully');
  }

  @Post('logout')
  @Auth()
  async logout(@Res() res: Response, @CurrentUser() { jti }: CurrentUser) {
    await this.service.logout(jti);
    return this.response.success(res, 'User Logged Out');
  }
}
