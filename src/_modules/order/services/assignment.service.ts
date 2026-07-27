import { Injectable, Logger } from '@nestjs/common';
import { AssignmentStatus, OrderType } from '@prisma/client';
import { calculateDistance } from 'src/globals/helpers/calculateDistance.helper';
import { NotificationService } from 'src/globals/services/notification.service';
import { PrismaService } from 'src/globals/services/prisma.service';
import { PrivateSettingService } from 'src/globals/services/settings.service';

@Injectable()
export class AssignmentService {
  private readonly logger = new Logger(AssignmentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settingService: PrivateSettingService,
    private readonly notificationService: NotificationService,
  ) {}

  async handleOrderAssignment(
    orderId: number,
    excludeDeliveryIds: number[] = [],
  ) {
    const settings = await this.settingService.getSettings(
      'deliveryAssignmentMode',
    );
    const mode = settings['deliveryAssignmentMode'] || 'AUTO';
    console.log('mode', mode);

    if (mode === 'MANUAL') {
      this.logger.log(`Manual assignment mode for order ${orderId}`);
      return;
    }

    await this.assignToNearestDelivery(orderId, excludeDeliveryIds);
  }

  async assignToNearestDelivery(
    orderId: number,
    excludeDeliveryIds: number[] = [],
  ) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { Branch: true, Address: true },
    });

    if (!order) return;

    const isCustomDelivery = order.type === OrderType.CUSTOM_DELIVERY;
    const pickupLat = isCustomDelivery ? order.pickupLat : order.Branch?.lat;
    const pickupLng = isCustomDelivery ? order.pickupLng : order.Branch?.lng;

    if (
      pickupLat === null ||
      pickupLng === null ||
      pickupLat === undefined ||
      pickupLng === undefined
    ) {
      this.logger.warn(
        `No valid pickup location found for order ${orderId} (Type: ${order.type})`,
      );
      return;
    }

    // Find deliveries who are:
    // 1. Available now (set by Cron based on schedule)
    // 2. User account is active
    // 3. Admin has manually verified them (see UpdateDeliveryDTO.verified —
    //    no longer set automatically by the driver's own OTP verification)
    // 4. Don't have an active order already
    // 5. Don't have another pending assignment awaiting response

    const deliveries = await this.prisma.deliveryDetails.findMany({
      where: {
        //back again
        availableNow: true,
        User: {
          active: true,
          verified: true,
        },
        // Skip drivers who just let this order lapse (avoids bouncing it back to them).
        ...(excludeDeliveryIds.length
          ? { userId: { notIn: excludeDeliveryIds } }
          : {}),

        Assignments: {
          none: {
            status: AssignmentStatus.PENDING,
            expiresAt: {
              gt: new Date(),
            },
          },
        },
      },
    });
    console.log(deliveries);

    if (deliveries.length === 0) {
      this.logger.warn(
        `No active and available deliveries found for order ${orderId}`,
      );
      return;
    }

    // Sort by distance
    const sortedDeliveries = deliveries.sort((a, b) => {
      const distA = calculateDistance(pickupLat, pickupLng, a.lat, a.lng);
      const distB = calculateDistance(pickupLat, pickupLng, b.lat, b.lng);
      return distA - distB;
    });

    const nearest = sortedDeliveries[0];
    if (nearest) {
      await this.createAssignment(orderId, nearest.userId);
    }
  }

  async createAssignment(
    orderId: number,
    deliveryId: number,
    options?: { notify?: boolean },
  ) {
    const notify = options?.notify ?? true;
    const settings = await this.settingService.getSettings(
      'deliveryAcceptanceTimer',
    );
    const timerSeconds = parseInt(settings['deliveryAcceptanceTimer'] || '90');
    const expiresAt = new Date();
    expiresAt.setSeconds(expiresAt.getSeconds() + timerSeconds);

    const assignment = await this.prisma.orderDeliveryAssignment.create({
      data: {
        orderId,
        deliveryId,
        expiresAt,
        status: AssignmentStatus.PENDING,
      },
    });

    // Notify delivery person (skipped for bulk assigns, which send one aggregated push)
    if (notify) {
      await this.notificationService.sendLocalizedNotification(
        deliveryId,
        { ar: 'طلب جديد', en: 'New Order' },
        {
          ar: 'لديك طلب جديد في انتظار القبول',
          en: 'You have a new order waiting for acceptance',
        },
        { resourceId: `${orderId}`, type: 'NEW_ORDER_ASSIGNMENT' },
      );
    }

    return assignment;
  }
}
