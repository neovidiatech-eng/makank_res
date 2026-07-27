import { Process, Processor } from '@nestjs/bull';
import { SystemNotificationStatus } from '@prisma/client';
import { Job } from 'bull';
import { localizedObject } from 'src/globals/helpers/localized.return';
import { EmailService } from 'src/globals/services/email.service';
import { NotificationService } from 'src/globals/services/notification.service';
import { PrismaService } from 'src/globals/services/prisma.service';
import { SMSService } from 'src/globals/services/sms.service';

@Processor('notification')
export class NotificationQueueProcessor {
  constructor(
    private readonly service: NotificationService,
    private readonly prisma: PrismaService,
    private readonly sms: SMSService,
    private readonly email: EmailService,
  ) {}

  @Process('processNotification')
  async handleNotification(job: Job) {
    const { notification, languageId, targetUsers } = job.data;

    if (!notification.group && targetUsers?.length) {
      for (const user of targetUsers) {
        if (notification.notification === SystemNotificationStatus.ACTIVE) {
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
        }
        if (
          notification.sms === SystemNotificationStatus.ACTIVE &&
          user.phone
        ) {
          const title = localizedObject(
            notification.title,
            languageId,
          ) as string;
          await this.sms.sendSMS(user.phone, title);
        }
        if (
          notification.email === SystemNotificationStatus.ACTIVE &&
          user.email
        ) {
          const title = localizedObject(
            notification.title,
            languageId,
          ) as string;
          await this.email.sendEmail(user.email, title);
        }
      }
    } else {
      // Group notification (to all)
      await this.service.sendNotification(languageId, notification);
    }
  }
}
