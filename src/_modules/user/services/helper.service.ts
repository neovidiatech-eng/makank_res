import {
  ConflictException,
  Injectable,
  PreconditionFailedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { OTPType, SessionType, User } from '@prisma/client';
import { TokenService } from 'src/_modules/authentication/services/jwt.service';
import { OTPService } from 'src/_modules/authentication/services/otp.service';
import { validateUserPassword } from 'src/globals/helpers/password.helpers';

import { PrismaService } from 'src/globals/services/prisma.service';

@Injectable()
export class HelperService {
  constructor(
    private prisma: PrismaService,
    private Token: TokenService,
    private OTPService: OTPService,
  ) {}

  async getUserById(id: Id) {
    const user = await this.prisma.user.findUnique({
      where: { id, deletedAt: null },
    });
    if (!user) throw new UnprocessableEntityException('user_not_found');
    delete user.password;
    return user;
  }

  async userExist({
    message,
    id,
    phone,
    email,
    password,
    roleKey,
    checkVerified = true,
  }: {
    message?: string;
    id?: Id;
    phone?: string;
    email?: string;
    password?: string;
    roleKey?: string;
    checkVerified?: boolean;
    ValidatePassword?: boolean;
  }): Promise<User> {
    message = message ?? 'user_not_found';
    const isFound = await this.prisma.user.findFirst({
      where: {
        id,
        email,
        phone,
        roleKey,
        deletedAt: null,
      },
    });

    if (!isFound) throw new UnprocessableEntityException(message);

    if (password) validateUserPassword(password, isFound.password);

    await this.userCanLogin(isFound, checkVerified);

    delete isFound.password;
    return isFound;
  }

  async userExistOrThrow({
    id,
    email,
    phone,
    roleKey,
  }: {
    id?: Id;
    email?: string;
    phone?: string;
    roleKey?: string;
  }) {
    const isFound = await this.prisma.user.findFirst({
      where: {
        id,
        OR: [{ email }, { phone }],
        roleKey,
        deletedAt: null,
      },
    });

    if (isFound) throw new ConflictException('user_already_exist');
  }

  async userCanLogin(user: User, checkVerified = true, ip?: string) {
    if (!user) {
      throw new UnprocessableEntityException('invalid credentials');
    }
    if (!user.verified && checkVerified) {
      await this.OTPService.generateOTP(user.id, OTPType.EMAIL_VERIFICATION);
      const token = await this.Token.generateToken(
        user.id,
        ip,
        undefined,
        SessionType.VERIFY,
      );

      throw new PreconditionFailedException('NOT_VERIFIED', {
        ...({
          data: {
            user: {
              id: user.id,
              name: user.name,
              email: user.email,
              phone: user.phone,
            },
            token,
          },
        } as any),
      });
    }
    if (!user.active) {
      throw new UnprocessableEntityException('DISABLED_ACCOUNT');
    }
  }
}
