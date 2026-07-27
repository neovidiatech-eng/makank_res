import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from 'src/globals/services/prisma.service';
import { extractJWT } from '../helpers/extract-token';

export type Payload = {
  exp: number;
  iat: number;
} & CurrentUser;

@Injectable()
export class AccessTokenStrategy extends PassportStrategy(Strategy, 'ACCESS') {
  constructor(private prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (request: Request) => {
          const token = extractJWT(request);
          return token;
        },
      ]),
      secretOrKey: env('ACCESS_TOKEN_SECRET'),
      jsonWebTokenOptions: {
        maxAge: +env('ACCESS_TOKEN_EXPIRE_TIME'),
      },
      passReqToCallback: true,
    });
  }

  async validate(request: Request, payload: Payload) {
    const { id, jti } = payload;
    if (!id || !jti) return false;
    const session = await this.prisma.session.findUnique({
      where: { jti },
    });
    if (!session) return false;
    const userExist = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        Role: {
          select: {
            id: true,
            roleKey: true,
            default: true,
          },
        },
        Sessions: { where: { jti } },
        active: true,
        Branch: {
          select: {
            id: true,
            storeId: true,
          },
        },
      },
    });

    if (userExist && userExist.Sessions.length) {
      if (!userExist.active) return false;

      const Role = userExist.Role;
      const permissions = await this.prisma.rolePermission.findMany({
        where: { roleId: Role.id },
        select: { Permission: true },
      });
      const serializedUser: CurrentUser = {
        id: userExist.id,
        jti,
        Role,
        permissions: permissions.map((p) => p.Permission),
        storeId: userExist.Branch?.storeId,
        branchId: userExist.Branch?.id,
      };

      return serializedUser;
    }
    return false;
  }
}
