import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { OTPType, SessionType, User } from '@prisma/client';
import { randomBytes } from 'crypto';
import { RolesKeys } from 'src/_modules/authorization/providers/roles';
import { CouponService } from 'src/_modules/coupon/coupon.service';
import { LogsService } from 'src/_modules/logs/logs.service';
import { HelperService } from 'src/_modules/user/services/helper.service';
import { UserService } from 'src/_modules/user/services/user.service';
import { hashPassword } from 'src/globals/helpers/password.helpers';
import { PrismaService } from 'src/globals/services/prisma.service';
import { ForgetPasswordDTO } from '../dto/forgot-password.dto';
import { GoogleLoginDTO } from '../dto/google-login.dto';
import { BioLoginDTO, EmailPasswordLoginDTO } from '../dto/login.dto';
import { ResetPasswordDTO } from '../dto/reset-password.dto';
import { VerifyOtpDTO } from '../dto/verify-otp.dto';
import { GoogleAuthService } from './google-auth.service';
import { TokenService } from './jwt.service';
import { OTPService } from './otp.service';

@Injectable()
export class BaseAuthenticationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenService: TokenService,
    private readonly userHelper: HelperService,
    private readonly userService: UserService,
    private readonly otpService: OTPService,
    private readonly couponService: CouponService,
    private readonly logsService: LogsService,
    private readonly googleAuthService: GoogleAuthService,
  ) {}

  async login(
    ip: string,
    dto: EmailPasswordLoginDTO,
  ): Promise<{
    user: User;
    AccessToken: string;
    RefreshToken: string;
    unReadNotifications: number;
  }> {
    const isLocaleFound = await this.prisma.language.findUnique({
      where: {
        key: dto.locale,
      },
    });
    if (!isLocaleFound) {
      throw new NotFoundException('Locale not found');
    }
    // Drivers and stores log in regardless of email/OTP verification status —
    // requiring a restaurant to click an email OTP link before they can even
    // open the store dashboard added friction with no product value, same
    // reasoning as the pre-existing driver exemption below. "verified" is
    // still tracked for both roles (e.g. AssignmentService gates order
    // assignment on a driver's verified flag), it's just no longer a login
    // precondition. Every other role keeps the existing OTP-required-to-login
    // behavior. RoleInterceptor sets dto.roleKey from the URL param before
    // this runs.
    const user = await this.userHelper.userExist({
      email: dto.email,
      password: dto.password,
      roleKey: dto.roleKey,
      message: 'invalid credentials',
      checkVerified: ![RolesKeys.DELIVERY, RolesKeys.STORE].includes(
        dto.roleKey,
      ),
    });
    const data = await this.userService.getProfile(user.id);
    const AccessToken = await this.tokenService.generateToken(
      user.id,
      ip,
      dto.fcm,
      SessionType.ACCESS,
      dto.locale,
    );
    const RefreshToken = await this.tokenService.generateToken(
      user.id,
      ip,
      dto.fcm,
      SessionType.REFRESH,
      dto.locale,
    );
    // Removed redundant expiredCoupons call as it is handled by a cron job.

    this.logsService
      .createLog({
        userId: String(user.id),
        userName: user.name,
        userRole: user.roleKey,
        action: 'LOGIN',
        details: 'دخل إلى لوحة التحكم',
      })
      .catch(() => {});

    return {
      user: data.user,
      unReadNotifications: data.unReadNotifications,
      AccessToken,
      RefreshToken,
    };
  }

  // "Sign in with Google" — customer-only. First login for a given Google
  // account creates the customer (pre-verified, since Google already verified
  // the email); a later login just links googleId onto a matching
  // email/roleKey account if one already exists from a password-based signup.
  async loginWithGoogle(
    ip: string,
    dto: GoogleLoginDTO,
  ): Promise<{
    user: User;
    AccessToken: string;
    RefreshToken: string;
    unReadNotifications: number;
  }> {
    const isLocaleFound = await this.prisma.language.findUnique({
      where: { key: dto.locale },
    });
    if (!isLocaleFound) {
      throw new NotFoundException('Locale not found');
    }

    const profile = await this.googleAuthService.verifyIdToken(dto.idToken);

    let user = await this.prisma.user.findFirst({
      where: { googleId: profile.googleId, roleKey: RolesKeys.CUSTOMER },
    });

    if (!user) {
      const existingByEmail = await this.prisma.user.findUnique({
        where: {
          email_roleKey: { email: profile.email, roleKey: RolesKeys.CUSTOMER },
        },
      });

      if (existingByEmail) {
        user = await this.prisma.user.update({
          where: { id: existingByEmail.id },
          data: { googleId: profile.googleId, verified: true },
        });
      } else {
        const role = await this.prisma.role.findFirst({
          where: { roleKey: RolesKeys.CUSTOMER },
        });
        // Unusable via email/password login (random, never shown to the user) —
        // the column is NOT NULL. The user can set a real one later via the
        // normal forget-password flow if they ever want email/password login too.
        const randomPassword = hashPassword(randomBytes(24).toString('hex'));
        user = await this.prisma.user.create({
          data: {
            name: profile.name,
            email: profile.email,
            password: randomPassword,
            googleId: profile.googleId,
            verified: true,
            roleId: role.id,
            roleKey: RolesKeys.CUSTOMER,
            Details: {
              create: { points: 0, wallet: 0.0 },
            },
          },
        });
      }
    }

    await this.userHelper.userCanLogin(user, true, ip);
    const data = await this.userService.getProfile(user.id);
    const AccessToken = await this.tokenService.generateToken(
      user.id,
      ip,
      dto.fcm,
      SessionType.ACCESS,
      dto.locale,
    );
    const RefreshToken = await this.tokenService.generateToken(
      user.id,
      ip,
      dto.fcm,
      SessionType.REFRESH,
      dto.locale,
    );

    this.logsService
      .createLog({
        userId: String(user.id),
        userName: user.name,
        userRole: user.roleKey,
        action: 'LOGIN',
        details: 'دخل باستخدام جوجل',
      })
      .catch(() => {});

    return {
      user: data.user,
      unReadNotifications: data.unReadNotifications,
      AccessToken,
      RefreshToken,
    };
  }

  async getBioInfo(dto: BioLoginDTO) {
    const { deviceId, roleKey } = dto;
    const user = await this.prisma.user.findFirst({
      where: {
        deviceId,
        roleKey,
      },
      select: {
        roleKey: true,
        email: true,
        phone: true,
      },
    });
    return user;
  }

  async validateDto(dto: EmailPasswordLoginDTO) {
    const { phone, email, roleKey } = dto;
    if (!email) {
      throw new NotFoundException('Phone or Email is required');
    }
  }

  async forgetPassword(ip: string, forgotPasswordDTO: ForgetPasswordDTO) {
    const { email, roleKey } = forgotPasswordDTO;
    const user = await this.userHelper.userExist({ email, roleKey });

    await this.userHelper.userCanLogin(user);
    await this.otpService.generateOTP(user.id, OTPType.PASSWORD_RESET);

    const token = await this.tokenService.generateToken(
      user.id,
      ip,
      undefined,
      SessionType.VERIFY,
    );

    return { user, token };
  }

  async resetPassword(userId: Id, dto: ResetPasswordDTO) {
    const hashedPassword = await hashPassword(dto.password);
    await this.prisma.user.update({
      data: { password: hashedPassword },
      where: { id: userId },
    });
  }

  async resendOtp(ip: string, userId: Id) {
    await this.otpService.generateOTP(userId, OTPType.EMAIL_VERIFICATION);
    const token = await this.tokenService.generateToken(
      userId,
      ip,
      undefined,
      SessionType.VERIFY,
    );
    return token;
  }

  async verify(ip: string, userId: Id, dto: VerifyOtpDTO, locale?: string) {
    const isFound = await this.prisma.user.findFirst({
      where: {
        id: userId,
        deletedAt: null,
      },
    });

    if (!isFound) throw new UnprocessableEntityException('user_not_found');
    await this.otpService.verifyOTP(
      userId,
      dto.otp,
      OTPType.EMAIL_VERIFICATION,
    );
    if (isFound.roleKey === RolesKeys.STORE) {
      await this.prisma.store.update({
        where: { id: isFound.storeId },
        data: { isVerified: true },
      });
    }
    // Drivers are never auto-verified by completing OTP — "verified" for them
    // is now an admin-only manual gate (PATCH /delivery/:id), independent of
    // email/OTP confirmation. Every other role keeps the previous behavior.
    if (isFound.roleKey !== RolesKeys.DELIVERY) {
      await this.prisma.user.update({
        where: { id: userId },
        data: { verified: true },
      });
    }
    const data = await this.userService.getProfile(userId);
    const AccessToken = await this.tokenService.generateToken(
      isFound.id,
      ip,
      undefined,
      SessionType.ACCESS,
      locale,
    );
    const RefreshToken = await this.tokenService.generateToken(
      isFound.id,
      ip,
      undefined,
      SessionType.REFRESH,
      locale,
    );
    return {
      user: data.user,
      unReadNotifications: data.unReadNotifications,
      AccessToken,
      RefreshToken,
    };
  }

  async verifyReset(userId: Id, dto: VerifyOtpDTO, ip: string) {
    const user = await this.userHelper.userExist({ id: userId });
    await this.otpService.verifyOTP(userId, dto.otp, OTPType.PASSWORD_RESET);
    const token = await this.tokenService.generateToken(
      userId,
      ip,
      undefined,
      SessionType.PASSWORD_RESET,
    );
    return { user, token };
  }

  async logout(jti: string) {
    const session = await this.prisma.session.findUnique({
      where: { jti },
      select: {
        User: {
          select: { id: true, name: true, roleKey: true },
        },
      },
    });

    await this.prisma.session.delete({ where: { jti } });

    if (session?.User) {
      this.logsService
        .createLog({
          userId: String(session.User.id),
          userName: session.User.name,
          userRole: session.User.roleKey,
          action: 'LOGOUT',
          details: 'خرج من لوحة التحكم',
        })
        .catch(() => {});
    }
  }

  async refreshToken(ip: string, userId: Id, locale?: string) {
    const data = await this.userService.getProfile(userId);
    const AccessToken = await this.tokenService.generateToken(
      userId,
      ip,
      undefined,
      SessionType.ACCESS,
      locale,
    );
    const RefreshToken = await this.tokenService.generateToken(
      userId,
      ip,
      undefined,
      SessionType.REFRESH,
      locale,
    );
    return {
      user: data,
      AccessToken,
      RefreshToken,
      accessToken: AccessToken,
      refreshToken: RefreshToken,
    };
  }
}
