import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { RolesKeys } from 'src/_modules/authorization/providers/roles';
import { getClientIp } from 'src/globals/helpers/getIp.helper';
import { PrismaService } from 'src/globals/services/prisma.service';

export type Payload = {
  exp: number;
  iat: number;
} & CurrentUser;

@Injectable()
export class VisitorStrategy extends PassportStrategy(Strategy, 'VISITOR') {
  constructor(private prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: process.env.ACCESS_TOKEN_SECRET,
      ignoreExpiration: true,
    });
  }
  async validate(request: Request, payload: Payload) {
    if (!payload) {
      const serializedUser = {
        id: null,
        Role: {
          id: 2,
          roleKey: RolesKeys.CUSTOMER,
        },
        Sessions: [],
        active: true,
        permissions: [],
      };
      return serializedUser; // Passport attaches this to `req.user`
    }

    const { id, jti } = payload;
    const clientIp = getClientIp(request);
    if (!id || !jti) {
      const serializedUser = {
        id: null,
        Role: {
          id: 2,
          roleKey: RolesKeys.CUSTOMER,
        },
        Sessions: [],
        active: true,
        permissions: [],
      };
      return serializedUser; // Passport attaches this to `req.user`
    }
    const session = await this.prisma.session.findUnique({
      where: { jti },
    });
    if (clientIp !== session?.ipAddress) {
      return false; // IP mismatch, invalidate the session
    }
    const userExist = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        Role: {
          select: {
            id: true,
            roleKey: true,
          },
        },
        Sessions: { where: { jti } },
        active: true,
        Branch: {
          include: {
            Store: {
              select: {
                id: true,
                name: true,
                cover: true,
                logo: true,
              },
            },
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
        storeId: userExist?.Branch.Store.id,
      };

      return serializedUser;
    }
    return false;
  }
}
