import { Module } from '@nestjs/common';
import { CouponController } from './coupon.controller';
import { CouponService } from './coupon.service';

import { AdminNotificationModule } from '../admin-notification/admin-notification.module';

@Module({
  imports: [AdminNotificationModule],
  controllers: [CouponController],
  providers: [CouponService],
  exports: [CouponService],
})
export class CouponModule {}
