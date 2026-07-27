import { Module } from '@nestjs/common';
import { SystemNotificationController } from './system-notification.controller';
import { SystemNotificationService } from './system-notification.service';

@Module({
  imports: [],
  controllers: [SystemNotificationController],
  providers: [SystemNotificationService],
})
export class SystemNotificationModule {}
