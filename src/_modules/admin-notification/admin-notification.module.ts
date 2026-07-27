import { Module } from '@nestjs/common';
import { NotificationService } from 'src/globals/services/notification.service';
import { PrismaService } from 'src/globals/services/prisma.service';
import { AdminNotificationController } from './controllers/admin-notification.controller';
import { AdminNotificationService } from './services/admin-notification.service';

@Module({
  controllers: [AdminNotificationController],
  providers: [AdminNotificationService, PrismaService, NotificationService],
  exports: [AdminNotificationService, NotificationService],
})
export class AdminNotificationModule {}
