import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { SessionType } from '@prisma/client';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from 'src/globals/services/prisma.service';
import { extractJWT } from '../helpers/extract-token';

export type Payload = {
  exp: number;
  iat: number;
} & CurrentUser;

@Injectable()
export class VerifyTokenStrategy extends PassportStrategy(Strategy, 'VERIFY') {
  constructor(private prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([extractJWT]),
      secretOrKey: env('VERIFY_TOKEN_SECRET'),
      jsonWebTokenOptions: {
        maxAge: +env('FORGET_PASSWORD_TOKEN_EXPIRE_TIME'),
      },
    });
  }

  async validate(payload: Payload) {
    const { id, jti } = payload;

    if (!id || !jti) return false;

    const userExist = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        Sessions: {
          where: { jti, type: SessionType.VERIFY },
        },
      },
    });

    if (userExist) {
      const serializedUser = {
        id: userExist.id,
        jti,
      };
      return serializedUser;
    }
    return false;
  }
}
