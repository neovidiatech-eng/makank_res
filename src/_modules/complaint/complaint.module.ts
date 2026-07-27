import { Module } from '@nestjs/common';
import { NotificationService } from 'src/globals/services/notification.service';
import { ComplaintController } from './complaint.controller';
import { ComplaintService } from './complaint.service';

@Module({
  controllers: [ComplaintController],
  providers: [ComplaintService, NotificationService],
  exports: [ComplaintService],
})
export class ComplaintModule {}
