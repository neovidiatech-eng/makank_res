import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { PrismaService } from 'src/globals/services/prisma.service';

@Injectable()
export class WsJwtGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}
  async canActivate(context: ExecutionContext) {
    const client = context?.switchToWs()?.getClient();
    try {
      const token = client.handshake.headers.authorization?.split(' ')[1];
      if (typeof token === 'undefined') {
        return false;
      }
      const payload = jwt.verify(token, env('ACCESS_TOKEN_SECRET'));
      if (!payload) {
        return false;
      }

      const { jti } = JSON.parse(JSON.stringify(payload));
      const session = await this.prisma.session.findUnique({
        where: { jti },
      });
      if (!session) {
        return false;
      }

      if (client.id == session.socketId) {
        return true;
      }

      await this.prisma.session.update({
        where: { jti },
        data: {
          socketId: client.id,
        },
      });
      client.user = session;
      return true;
    } catch (ex) {
      client.disconnect();
      if (ex.name != 'TokenExpiredError') catchHandler(ex);
      return false;
    }
  }
}
