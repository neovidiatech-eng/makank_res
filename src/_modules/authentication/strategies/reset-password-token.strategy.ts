import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { SessionType } from '@prisma/client';
import { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { getClientIp } from 'src/globals/helpers/getIp.helper';
import { PrismaService } from 'src/globals/services/prisma.service';
import { extractJWT } from '../helpers/extract-token';

export type Payload = {
  exp: number;
  iat: number;
} & CurrentUser;

@Injectable()
export class ResetPasswordTokenStrategy extends PassportStrategy(
  Strategy,
  'PASSWORD_RESET',
) {
  constructor(private prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (request: Request) => {
          const token = extractJWT(request);
          return token;
        },
      ]),
      secretOrKey: env('RESET_PASSWORD_TOKEN_SECRET'),
      jsonWebTokenOptions: {
        maxAge: +env('FORGET_PASSWORD_TOKEN_EXPIRE_TIME'),
      },
      passReqToCallback: true,
    });
  }

  async validate(request: Request, payload: Payload) {
    const { id, jti } = payload;
    const clientIp = getClientIp(request);
    const foundedSession = await this.prisma.session.findUnique({
      where: { jti },
    });
    if (clientIp !== foundedSession?.ipAddress) {
      return false;
    }

    if (!id || !jti) return false;

    const userExist = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        Sessions: {
          where: { jti, type: SessionType.PASSWORD_RESET },
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
