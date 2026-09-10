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
      include: {
        Branch: { include: { Store: true } },
        Address: true,
        Zone: true,
      },
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

    // Resolve the order's city from the branch store or the resolved zone.
    // Used to prefer drivers in the same city; falls back to the global pool
    // when no city can be resolved so single-city deployments are unaffected.
    const orderCityId: number | null =
      order.Branch?.Store?.cityId ?? order.Zone?.cityId ?? null;

    let cityBounds: { lat: number | null; lng: number | null; radius: number | null } | null = null;
    if (orderCityId != null) {
      cityBounds = await this.prisma.city.findUnique({
        where: { id: orderCityId },
        select: { lat: true, lng: true, radius: true },
      });
    }

    // Degree delta for the city radius (1 degree ≈ 111 km).
    const delta = cityBounds?.radius != null ? cityBounds.radius / 111 : null;

    // Find deliveries who are:
    // 1. Available now (set by Cron based on schedule)
    // 2. User account is active
    // 3. Admin has manually verified them
    // 4. Don't have an active order already
    // 5. Don't have another pending assignment awaiting response
    // 6. (When resolvable) Located within the order's city bounds
    const deliveries = await this.prisma.deliveryDetails.findMany({
      where: {
        availableNow: true,
        User: {
          active: true,
          verified: true,
        },
        // Skip drivers who just let this order lapse.
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
        // City-scoped filter: only include drivers whose last-known position
        // falls within the order city's bounding box. When no city can be
        // resolved the filter is omitted so the legacy global pool is used.
        ...(delta != null && cityBounds?.lat != null && cityBounds?.lng != null
          ? {
              lat: { gte: cityBounds.lat - delta, lte: cityBounds.lat + delta },
              lng: { gte: cityBounds.lng - delta, lte: cityBounds.lng + delta },
            }
          : {}),
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
      const orderData = await this.prisma.order.findUnique({
        where: { id: orderId },
        select: { totalPriceAfterDiscount: true },
      });
      const orderTotal = orderData?.totalPriceAfterDiscount ?? 0;

      await this.notificationService.sendLocalizedNotification(
        deliveryId,
        { ar: 'طلب جديد', en: 'New Order' },
        {
          ar: `لديك طلب جديد (#${orderId}) بقيمة ${orderTotal} ج.م في انتظار القبول`,
          en: `You have a new order (#${orderId}) total ${orderTotal} EGP waiting for acceptance`,
        },
        {
          resourceId: `${orderId}`,
          orderId: `${orderId}`,
          totalPriceAfterDiscount: `${orderTotal}`,
          total: `${orderTotal}`,
          type: 'NEW_ORDER_ASSIGNMENT',
        },
      );
    }

    return assignment;
  }
}
