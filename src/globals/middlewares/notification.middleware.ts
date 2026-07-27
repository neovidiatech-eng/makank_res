import { InjectQueue } from '@nestjs/bull';
import { Injectable, NestMiddleware } from '@nestjs/common';
import { SystemNotification, SystemNotificationStatus } from '@prisma/client';
import { Queue } from 'bull';
import { NextFunction, Request, Response } from 'express';
import * as jwt from 'jsonwebtoken';
import { localizedObject } from '../helpers/localized.return';
import { EmailService } from '../services/email.service';
import { NotificationService } from '../services/notification.service';
import { PrismaService } from '../services/prisma.service';
import { SMSService } from '../services/sms.service';

@Injectable()
export class NotificationMiddleware implements NestMiddleware {
  constructor(
    @InjectQueue('notification') private readonly notificationQueue: Queue,

    private readonly prisma: PrismaService,
    private readonly service: NotificationService,
    private readonly sms: SMSService,
    private readonly email: EmailService,
  ) {}

  async use(req: Request, res: Response, next: NextFunction) {
    const method = req.method.toLowerCase();
    const endpoint = req.originalUrl.split('/api/')[1];
    const eventName = `${endpoint}_${method}`;

    // Get auth token and user info
    const { userToken, user, locale } = await this.getUserInfo(req);
    // console.log(userToken, user, locale);
    if (!userToken || !user) return next();

    // Get all relevant notifications
    // const notifications = await this.prisma.systemNotification.findMany({
    //   where: {
    //     senderId: user.Role.roleKey,
    //     event: eventName,
    //   },
    // });

    // Process each notification
    // res.on('finish', async () => {
    //   if (res.statusCode === 200 || res.statusCode === 201) {
    //     for (const notification of notifications) {
    //       const targetUsers = await this.getTargetUsers(
    //         req,
    //         notification,
    //         user,
    //       );
    //       await this.notificationQueue.add('processNotification', {
    //         notification,
    //         languageId: locale.languageId,
    //         targetUsers,
    //       });
    //     }
    //   }
    // });

    next();
  }

  private async getUserInfo(req: Request) {
    const authHeader = req.headers['authorization'];
    if (!authHeader) return {};

    const token = authHeader.split(' ')[1];
    if (!token) return {};
    let userToken: any;

    try {
      userToken = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (_: any) {
      try {
        userToken = jwt.verify(token, process.env.VERIFY_TOKEN_SECRET);
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
      } catch (_: any) {
        // console.log('ssssss');
        return {};
      }
    }
    const user = await this.prisma.user.findUnique({
      where: { id: userToken['id'] },
      select: { id: true, Role: true, email: true, phone: true },
    });

    const locale = await this.prisma.session.findUnique({
      where: { jti: userToken['jti'] },
      select: { languageId: true },
    });

    return { userToken, user, locale };
  }

  private async getTargetUsers(
    req: Request,
    notification: SystemNotification,
    current: any,
  ) {
    // Case 1: Specific user target (from request params/body)
    if (this.shouldTargetSingleUser(notification)) {
      const userId = this.extractTargetUserId(req, current);
      if (!userId) return [];

      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true, phone: true, Role: true },
      });

      // return user?.Role.roleKey === notification.receiverId ? [user] : [];
    }
  }

  private shouldTargetSingleUser(notification: SystemNotification) {
    if (!notification.group) {
      return true;
    }
    return false;
  }

  private extractTargetUserId(req: Request, user: any) {
    // Extract user ID from different parts of request
    return req.params.id || req.body.userId || req.body.id || user.id;
  }

  private async sendNotifications(
    notification: any,
    languageId: string,
    targetUsers?: any[],
  ) {
    if (!notification.group) {
      await Promise.all(
        targetUsers.map(async (user) => {
          if (notification.notification === SystemNotificationStatus.ACTIVE) {
            await this.sendInAppNotification(notification, user, languageId);
          }
          if (
            notification.sms === SystemNotificationStatus.ACTIVE &&
            user.phone
          ) {
            await this.sendSMS(notification, user, languageId);
          }
          if (
            notification.email === SystemNotificationStatus.ACTIVE &&
            user.email
          ) {
            await this.sendEmail(notification, user, languageId);
          }
        }),
      );
    } else {
      await this.sendInAppNotification(notification, languageId);
    }
  }

  private async sendInAppNotification(
    notification: any,
    languageId: string,
    user?: any,
  ) {
    if (user) {
      const session = await this.prisma.session.findFirst({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
      });
      if (session) {
        await this.service.sendNotification(
          languageId,
          notification,
          session.jti,
        );
      }
    } else {
      await this.service.sendNotification(languageId, notification);
    }
  }

  private async sendSMS(notification: any, user: any, languageId: string) {
    const title = localizedObject(notification.title, languageId) as string;
    await this.sms.sendSMS(user.phone, title);
  }

  private async sendEmail(notification: any, user: any, languageId: string) {
    const title = localizedObject(notification.title, languageId) as string;
    await this.email.sendEmail(user.email, title);
  }
}
