import { Module } from '@nestjs/common';

import { EmailService } from 'src/globals/services/email.service';
import { AdminNotificationModule } from '../admin-notification/admin-notification.module';
import { CouponModule } from '../coupon/coupon.module';
import { LogsModule } from '../logs/logs.module';
import { HelperService } from '../user/services/helper.service';
import { UserService } from '../user/services/user.service';
import { BaseAuthenticationController } from './controllers/base.controller';
import { BaseAuthenticationService } from './services/base.authentication.service';
import { GoogleAuthService } from './services/google-auth.service';
import { TokenService } from './services/jwt.service';
import { OTPService } from './services/otp.service';
import { AccessTokenStrategy } from './strategies/access-token.strategy';
import { RefreshTokenStrategy } from './strategies/refresh-token.strategy';
import { ResetPasswordTokenStrategy } from './strategies/reset-password-token.strategy';
import { VerifyTokenStrategy } from './strategies/verify-token.strategy';
import { VisitorStrategy } from './strategies/visitor.strategy';

@Module({
  imports: [CouponModule, AdminNotificationModule, LogsModule],
  controllers: [BaseAuthenticationController],
  providers: [
    TokenService,
    EmailService,
    BaseAuthenticationService,
    AccessTokenStrategy,
    VisitorStrategy,
    ResetPasswordTokenStrategy,
    RefreshTokenStrategy,
    VerifyTokenStrategy,
    UserService,
    OTPService,
    HelperService,
    GoogleAuthService,
  ],
  exports: [BaseAuthenticationService, TokenService],
})
export class AuthenticationModule {}
