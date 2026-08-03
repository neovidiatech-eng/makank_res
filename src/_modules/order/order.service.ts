import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  forwardRef,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/globals/services/prisma.service';
import { randomUUID } from 'crypto';
import { redisClient } from 'src/redis/redis.provider';

import {
  AssignmentStatus,
  CustomDeliveryKind,
  NotificationType,
  OrderCategory,
  OrderStatus,
  OrderType,
  PaymentMethod,
  PaymentStatus,
  Prisma,
  StationStatus,
  StationType,
  TransactionType,
  TransferType,
} from '@prisma/client';
import { NotificationMessages } from 'src/configs/notification.messages';
import { calculateNewAverageRating } from 'src/globals/helpers/calculateAverageRating.helper';
import { calculateDistance } from 'src/globals/helpers/calculateDistance.helper';
import { formatEgypt } from 'src/globals/helpers/egypt-time.helper';
import { firstOrMany } from 'src/globals/helpers/first-or-many';
import { prismaPagination } from 'src/globals/helpers/pagination-params';
import { AfkBreakService } from 'src/globals/services/afk-break.service';
import { MapService } from 'src/globals/services/map.service';
import { NotificationService } from 'src/globals/services/notification.service';
import { PrivateSettingService } from 'src/globals/services/settings.service';
import { RolesKeys } from '../authorization/providers/roles';
import { validBundleWhere } from '../bundle/prisma-args/bundle.prisma.args';
import { LanguagesService } from '../languages/languages.service';
import { LogsService } from '../logs/logs.service';
import { KashierService } from '../payment/kashier/kashier.service';
import { PaymentService } from '../payment/payment.service';
import { ServiceModuleHelper } from '../serviceModule/services/serviceModule.helper.service';
import { TransactionService } from '../transaction/service/transaction.service';
import { WalletService } from '../wallet/wallet.service';
import { ZoneService } from '../zone/zone.service';
import {
  CalculateCustomDeliveryOrderDTO,
  CreateCustomDeliveryOrderDTO,
} from './dto/custom-delivery-order.dto';
import {
  CalculateOnlineDeliveryOrderDTO,
  CreateOnlineDeliveryOrderDTO,
} from './dto/online-delivery-order.dto';
import {
  FilterStoreWalletDTO,
  OrderStatusCountFilterDTO,
} from './dto/order.countStatus.filter.dto';
import {
  AssignOrderDTO,
  BundleLineDTO,
  BundleSelectionDTO,
  CalculateOrderDTO,
  CreateOrderDTO,
  FilterOrderDTO,
  OrderItemDTO,
} from './dto/order.dto';
import { PaymentDetailDTO } from './dto/order.payment.dto';
import { RateDTO } from './dto/order.rate.dto';
import { ReorderDTO } from './dto/reorder.dto';
import {
  getOrderArgs,
  getOrderArgsWithSelect,
  selectOrderOBJ,
} from './prisma-args/order.prisma.args';
import { getOrderStatisticsArgs } from './prisma-args/orderStatistics.prisma.args';
import { getOrderStatusCountFilterArgs } from './prisma-args/orderStatusCountFilter.prisma.args';
import { OrderTrackingGateway } from './gateways/order-tracking.gateway';
import { AssignmentService } from './services/assignment.service';
import { HelpersService } from './services/helpers.service';

@Injectable()
export class OrderService {
  private readonly logger = new Logger(OrderService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly languages: LanguagesService,
    private readonly helpers: HelpersService,
    private readonly walletService: WalletService,
    private readonly paymentService: PaymentService,
    private readonly transactionService: TransactionService,
    private readonly notificationService: NotificationService,
    private readonly mapService: MapService,
    private readonly settingService: PrivateSettingService,
    private readonly assignmentService: AssignmentService,
    private readonly serviceHelper: ServiceModuleHelper,
    @Inject(forwardRef(() => KashierService))
    private readonly kashierService: KashierService,
    private readonly zoneService: ZoneService,
    private readonly afkBreakService: AfkBreakService,
    private readonly logsService: LogsService,
    private readonly orderTrackingGateway: OrderTrackingGateway,
  ) {}

  // Admin-only bulk cleanup. Order has no deletedAt column, so tx.order.delete()
  // is a REAL delete (not converted to a soft delete by the global Prisma
  // middleware) and the schema's onDelete: Cascade FKs remove every child row
  // (OrderItem, OrderBundle, OrderStation, OrderDeliveryAssignment, Complaint,
  // DeliveryRating, StoreRating) automatically. Whatever money the order
  // actually moved is reversed first, otherwise deleting a test order would
  // leave phantom balances behind:
  //   - DELIVERED  -> admin/branch/driver earnings (see distributeEarnings)
  //   - CANCELLED, but paid + refunded to the customer (same trigger
  //     condition changeStatus() uses for refundOrder()) -> the customer's
  //     wallet credit
  // Every other status never moved any money, so there's nothing to reverse.
  // Each order is its own transaction so one bad id can't abort the whole
  // batch; failures are collected and returned, never thrown.
  async bulkDeleteOrders(orderIds: Id[]) {
    const deletedIds: Id[] = [];
    const failed: { id: Id; reason: string }[] = [];

    for (const id of orderIds) {
      try {
        await this.prisma.$transaction(async (tx) => {
          const order = await tx.order.findUnique({ where: { id } });
          if (!order) {
            throw new NotFoundException(`Order ${id} not found`);
          }
          if (order.status === OrderStatus.DELIVERED) {
            await this.walletService.reverseEarnings(order, tx);
          } else if (
            order.status === OrderStatus.CANCELLED &&
            order.paymentStatus === PaymentStatus.PAID &&
            (order.paidWithWallet || order.paymentMethod !== PaymentMethod.CASH)
          ) {
            await this.walletService.reverseCustomerRefund(order, tx);
          }
          await tx.order.delete({ where: { id } });
        });
        deletedIds.push(id);
      } catch (error) {
        failed.push({ id, reason: error.message });
      }
    }

    return { deletedCount: deletedIds.length, deletedIds, failed };
  }

  // The zone actually shown to the admin/driver (Order.zoneId, via the
  // Order.Zone relation) must match what the customer explicitly picked from
  // the dropdown when they picked one — otherwise an address that happens to
  // sit inside a different/overlapping zone polygon silently displays that
  // zone's name instead, even though pricing already prioritizes the
  // customer's pick (see the "Reverse zone pricing priority" change). Falls
  // back to the address/GPS-resolved zone if the picked id doesn't correspond
  // to a real zone.
  async resolveDisplayZoneId(
    tx: Prisma.TransactionClient,
    addressResolvedZoneId: number | null,
    customerPickedZoneId?: number | null,
  ): Promise<number | null> {
    if (customerPickedZoneId == null) return addressResolvedZoneId;
    const pickedZoneExists = await tx.zone.findUnique({
      where: { id: customerPickedZoneId },
      select: { id: true },
    });
    return pickedZoneExists ? customerPickedZoneId : addressResolvedZoneId;
  }

  // The 20s idempotency checks in create()/createCustomDeliveryOrder()/
  // createOnlineDeliveryOrder() only look at data already committed to the
  // DB — two near-simultaneous submits from the same user (a double-tap, or
  // the app silently retrying a slow request) can both run that check before
  // either has actually inserted its order, so both pass it and two real
  // orders get created. This serializes order creation per user: only one of
  // this user's create calls runs the check-then-insert at a time, so the
  // second one always sees the first's just-created row and dedupes
  // correctly. Fails OPEN (proceeds without the lock) if Redis is unreachable
  // or the lock can't be acquired in time, so an infra hiccup here degrades
  // back to the pre-existing behavior rather than blocking real orders.
  // ioredis's default reconnect strategy retries indefinitely and never
  // rejects on its own, so an unreachable/misconfigured Redis would otherwise
  // hang every single Redis call forever — not just fail to catch. Every
  // Redis call the lock makes is wrapped in this so "Redis is unreachable"
  // always resolves in boundMs, never hangs the request.
  private async withRedisTimeout<T>(
    promise: Promise<T>,
    boundMs: number,
  ): Promise<T> {
    let timer: NodeJS.Timeout;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`Redis call exceeded ${boundMs}ms`)),
        boundMs,
      );
    });
    try {
      return await Promise.race([promise, timeout]);
    } finally {
      clearTimeout(timer!);
    }
  }

  private async withUserOrderLock<T>(
    userId: Id | undefined,
    fn: () => Promise<T>,
  ): Promise<T> {
    if (userId == null) return fn();

    const lockKey = `order-create-lock:${userId}`;
    const token = randomUUID();
    const ttlMs = 15000;
    const maxWaitMs = 5000;
    const redisCallBoundMs = 300;
    const pollIntervalMs = 100;
    const deadline = Date.now() + maxWaitMs;
    let acquired = false;

    while (Date.now() < deadline) {
      let result: string | null;
      try {
        result = await this.withRedisTimeout(
          redisClient.set(lockKey, token, 'PX', ttlMs, 'NX'),
          redisCallBoundMs,
        );
      } catch (error) {
        // Redis unreachable/too slow — fail open rather than keep retrying
        // against a connection that will just keep timing out.
        this.logger.warn(
          `[order-lock] Redis unavailable, proceeding without the lock: ${error.message}`,
        );
        break;
      }
      if (result === 'OK') {
        acquired = true;
        break;
      }
      // Lock is genuinely held by another in-flight request from this same
      // user — wait briefly and retry until it's free or we give up.
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }

    try {
      return await fn();
    } finally {
      if (acquired) {
        try {
          // Atomic compare-and-delete (Lua) — only remove the lock if it's
          // still the token we set, so a lock some later request already
          // re-acquired (after our TTL expired) can never be deleted by us.
          await this.withRedisTimeout(
            redisClient.eval(
              `if redis.call("get", KEYS[1]) == ARGV[1] then
                 return redis.call("del", KEYS[1])
               else
                 return 0
               end`,
              1,
              lockKey,
              token,
            ),
            redisCallBoundMs,
          );
        } catch (error) {
          this.logger.warn(`[order-lock] Failed to release lock: ${error.message}`);
        }
      }
    }
  }

  async calculateOrder(data: CalculateOrderDTO) {
    if (data.type === OrderType.PICKUP) {
      const { pickupEnabled } = await this.settingService.getSettings([
        'pickupEnabled',
      ]);
      if (pickupEnabled === false) {
        throw new BadRequestException('خدمة الاستلام من الفرع مغلقة حالياً');
      }
    }

    const {
      items = [],
      couponCode,
      userId,
      branchId,
      bundleSelections = [],
    } = data;
    if (bundleSelections.length && (couponCode || data.fortuneRewardId))
      throw new BadRequestException(
        'Bundles cannot be combined with other discounts',
      );

    if (
      data.type !== OrderType.PICKUP &&
      data.addressId &&
      this.prisma.address?.findUnique
    ) {
      const address = await this.prisma.address.findUnique({
        where: { id: data.addressId },
        select: { lat: true, lng: true },
      });
      if (address && this.helpers?.validateBranchCityCoverage) {
        await this.helpers.validateBranchCityCoverage(
          branchId,
          address.lat,
          address.lng,
        );
      }
    }

    // Auto-stop cap: once maxActiveOrders orders are simultaneously "in the
    // kitchen" for this branch (not yet handed off to a driver), new orders
    // are rejected until one clears — shared by both the price-preview and
    // the actual order-creation path since create() calls calculateOrder().
    const branchForCap = await this.prisma.branch.findUnique({
      where: { id: branchId },
      select: { maxActiveOrders: true },
    });
    if (branchForCap?.maxActiveOrders != null) {
      const activeOrdersCount = await this.prisma.order.count({
        where: {
          branchId,
          status: {
            in: [
              OrderStatus.PENDING,
              OrderStatus.PENDING_PAYMENT,
              OrderStatus.PREPARING,
              OrderStatus.READY_PICKUP,
            ],
          },
        },
      });
      if (activeOrdersCount >= branchForCap.maxActiveOrders) {
        throw new BadRequestException(
          'المطعم وصل للحد الأقصى من الطلبات حاليًا، حاول مرة أخرى بعد شوية',
        );
      }
    }

    // Resolve the branch's store only when bundles are present — bundle validation
    // needs it, but normal (non-bundle) checkout must not pay this extra roundtrip.
    let bundleStoreId: Id | undefined;
    if (bundleSelections.length) {
      const branch = await this.prisma.branch.findUnique({
        where: { id: branchId },
        select: { storeId: true },
      });
      if (!branch) throw new BadRequestException('Branch not found');
      bundleStoreId = branch.storeId;
    }

    let totalPrice = 0;
    let totalStoreCommission = 0;
    const validatedItems = [];

    for (const item of items) {
      const service = await this.helpers.validateServiceAvailability(
        item.serviceId,
        branchId,
      );
      const selected = await this.helpers.validateSizeAndAddons(
        item.serviceId,
        item.sizeId,
        item.addonIds,
      );

      // Store commission is baked into the per-unit base price (selected size price,
      // or service price when no size). Add-ons are additive and receive NO commission.
      const { clientFacingPrice, storeCommissionPerUnit } =
        this.serviceHelper.applyStoreCommission(
          selected.basePrice,
          service.Store,
        );
      const unitPrice = clientFacingPrice + selected.addonsPrice;

      const itemStoreCommission = storeCommissionPerUnit * item.quantity;
      const finalItemPrice = unitPrice * item.quantity;

      totalPrice += finalItemPrice; // Subtotal includes store commission, excludes global.
      totalStoreCommission += itemStoreCommission;

      validatedItems.push({
        ...item,
        itemTotalPrice: finalItemPrice, // Price displayed to the user and stored on the order item.
        selected,
        service,
        isFree: false,
      });
    }

    const pricedBundles = await this.helpers.validateAndPriceBundles(
      bundleSelections,
      branchId,
      bundleStoreId,
    );
    for (const bundle of pricedBundles) {
      for (const paidItem of bundle.paidItems) {
        totalPrice += paidItem.itemTotalPrice;
        totalStoreCommission += paidItem.storeCommission;
        validatedItems.push({
          ...paidItem,
          bundleSelectionIndex: bundle.selectionIndex,
        });
      }
      for (const freeItem of bundle.freeItems) {
        totalPrice += freeItem.itemTotalPrice;
        validatedItems.push({
          ...freeItem,
          bundleSelectionIndex: bundle.selectionIndex,
        });
      }
    }

    const firstPaidItem = validatedItems.find(
      (validatedItem) => !validatedItem.isFree,
    );
    if (!firstPaidItem) {
      throw new BadRequestException('Order must have at least one item');
    }

    // Professional Sequence: Total -> Tax -> Delivery -> Discount

    // 1. Subtotal (Items only)
    const subtotal = totalPrice;

    // Per-store minimum order — checked on the items subtotal, before
    // tax/delivery/discount, and applies to every order type (delivery or
    // pickup alike). Shared by both the price-preview and the actual
    // order-creation path since create() calls calculateOrder() internally.
    const minOrderAmount = firstPaidItem.service.Store.minOrderAmount;
    if (minOrderAmount != null && subtotal < minOrderAmount) {
      throw new BadRequestException(
        `الحد الأدنى للطلب من هذا المتجر ${minOrderAmount} جنيه (قيمة طلبك الحالية ${subtotal} جنيه)`,
      );
    }

    // 2. Tax (e.g. 7% or from settings)
    const { tax, priceAfterTax: subtotalWithTax } = await this.helpers.getTax(
      subtotal,
      firstPaidItem.service.Store.tax,
    );

    // 3. Delivery
    const deliveryPrice =
      data.type === OrderType.PICKUP
        ? 0
        : (await this.helpers.getDeliveryPrice(
            data.addressId,
            branchId,
            subtotal,
            data.zoneId,
          )) + (data.tip ?? 0);

    // Resolve the delivery-destination zone from the address coords so coupon
    // zone restrictions can be enforced here — the single validation chokepoint
    // for both the checkout preview and order creation. PICKUP / no address /
    // a point outside every active zone all resolve to null (→ zone-restricted
    // coupons reject, global coupons still pass).
    const zoneId = await this.resolveOrderZoneId(data.type, data.addressId);

    // 4. Discount (Applied to items subtotal)
    const { totalAfterDiscount, discountValue, couponId } =
      await this.helpers.verifyCoupon(
        couponCode,
        userId,
        firstPaidItem.service.storeId,
        subtotal,
        zoneId,
      );

    // Global commission: applied ONCE per order on the items subtotal (pre-discount,
    // excludes delivery). Fully independent from the per-store commission above.
    const globalCommissionSettings =
      await this.serviceHelper.getGlobalCommissionSettings();
    const globalCommission = this.serviceHelper.calculateGlobalCommission(
      subtotal,
      globalCommissionSettings,
    );

    // Fortune reward (applied to post-coupon subtotal)
    let rewardDiscount = 0;
    let rewardId: Id | undefined;
    let adjustedDeliveryPrice = deliveryPrice;

    if (data.fortuneRewardId) {
      const deliveryFeeExclTip =
        data.type === OrderType.PICKUP ? 0 : deliveryPrice - (data.tip ?? 0);
      const fortuneResult = await this.helpers.verifyFortuneReward(
        data.fortuneRewardId,
        userId,
        totalAfterDiscount,
        data.type,
        deliveryFeeExclTip,
      );
      rewardDiscount = fortuneResult.rewardDiscount;
      rewardId = fortuneResult.rewardId;

      if (fortuneResult.freeDelivery) {
        // Zero the delivery portion but preserve tip
        adjustedDeliveryPrice = data.tip ?? 0;
      }
    }

    const combinedDiscount = discountValue + rewardDiscount;
    const discountedSubtotal = Math.max(0, subtotal - combinedDiscount);

    // Global commission is added ON TOP of the subtotal; store commission is already inside it.
    const finalTotal =
      discountedSubtotal + tax + adjustedDeliveryPrice + globalCommission;

    // Admin/platform earning = global commission + the store-commission markup.
    const adminCommission = globalCommission + totalStoreCommission;

    return {
      price: subtotal,
      subtotal,
      totalPrice: finalTotal,
      priceAfterDiscount: Math.max(0, totalAfterDiscount - rewardDiscount),
      priceAfterTax: subtotal + tax,
      discountValue: combinedDiscount,
      globalCommission,
      storeCommission: totalStoreCommission,
      adminCommission,
      commission: adminCommission, // backward-compat alias (= admin earning)
      tax,
      shipping: adjustedDeliveryPrice,
      couponId,
      rewardId,
      zoneId,
      items: validatedItems,
      bundles: pricedBundles,
    };
  }

  // Resolve the delivery-destination zone for an order from its address coords.
  // Returns null for PICKUP, a missing address, or a point outside every active
  // zone. Fail-soft (resolveZoneId never throws) — used in pricing + creation.
  private async resolveOrderZoneId(
    type: OrderType | undefined,
    addressId: Id | undefined,
  ): Promise<number | null> {
    if (type === OrderType.PICKUP || !addressId) return null;
    const address = await this.prisma.address.findUnique({
      where: { id: addressId },
      select: { lat: true, lng: true },
    });
    return this.zoneService.resolveZoneId(address?.lat, address?.lng);
  }
  async create(data: CreateOrderDTO, skipArchiving = false) {
    return this.withUserOrderLock(data.userId, () =>
      this.createInternal(data, skipArchiving),
    );
  }

  private async createInternal(data: CreateOrderDTO, skipArchiving = false) {
    if (
      data.category === OrderCategory.SCHEDULED &&
      data.bundleSelections?.length
    )
      throw new BadRequestException(
        'Bundles are not supported for scheduled orders',
      );
    if (data.paymentMethod === PaymentMethod.WALLET && !data.paidWithWallet) {
      if (!data.transferImage) {
        throw new BadRequestException('صورة إيصال التحويل مطلوبة لإتمام الطلب');
      }
      // transferType (Vodafone Cash / InstaPay / Bank Transfer) is no longer
      // required from the customer — only BANK_TRANSFER (an explicit IBAN
      // transfer) still needs its own field; every other case just needs the
      // phone number the transfer was made from, regardless of which wallet
      // provider was actually used.
      if (data.transferType === TransferType.BANK_TRANSFER) {
        if (!data.transferAccountNumber) {
          throw new BadRequestException('رقم الحساب البنكي أو الآيبان مطلوب');
        }
      } else {
        if (!data.transferNumber) {
          throw new BadRequestException(
            'رقم الهاتف الذي قمت بالتحويل منه مطلوب',
          );
        }
        const egyptianPhoneRegex = /^01[0125][0-9]{8}$/;
        if (!egyptianPhoneRegex.test(data.transferNumber)) {
          throw new BadRequestException(
            'رقم الهاتف غير صالح. يجب أن يكون رقم جوال مصري صحيح مكون من 11 رقماً ويبدأ بـ 010 أو 011 أو 012 أو 015',
          );
        }
      }
    }
    const { userId, addressId, branchId } = data;
    const branch = branchId
      ? await this.prisma.branch.findUnique({ where: { id: branchId } })
      : null;
    if (data.type !== OrderType.PICKUP) {
      await this.helpers.validateUserAddress(userId, addressId);
    }

    const calc = await this.calculateOrder(data);
    const {
      price: subtotal,
      totalPrice,
      discountValue,
      commission,
      globalCommission,
      storeCommission,
      adminCommission,
      tax,
      couponId,
      rewardId,
      items,
      shipping,
      // Delivery-destination zone, resolved from the address coords inside
      // calculateOrder (null for PICKUP / no match). Reused here so the stored
      // Order.zoneId is the exact zone the coupon was validated against.
      zoneId,
      bundles,
    } = calc;

    // Pre-check wallet balance before starting transaction
    if (data.paidWithWallet) {
      await this.walletService.checkWalletBalance(userId, totalPrice);
    }

    // Idempotency check: prevent duplicate orders within a short time (20 seconds)
    const recentOrder = await this.prisma.order.findFirst({
      where: {
        userId,
        branchId,
        type: data.type || OrderType.DELIVERY,
        isGift: data.isGift ?? false,
        createdAt: { gte: new Date(Date.now() - 20 * 1000) },
        totalPriceAfterDiscount: totalPrice,
      },
    });

    if (recentOrder) {
      return recentOrder;
    }

    if (data.category === OrderCategory.SCHEDULED && !skipArchiving) {
      return await this.createArchivedOrder(data, calc);
    }

    const { order, invoice } = await this.prisma.$transaction(async (tx) => {
      if (couponId) {
        const couponUpdateResult = await tx.coupon.updateMany({
          where: {
            id: couponId,
            active: true,
            startDate: { lte: new Date() },
            endDate: { gte: new Date() },
            usageCount: { lt: tx.coupon.fields.maxUsage },
          },
          data: {
            usageCount: {
              increment: 1,
            },
          },
        });

        if (!couponUpdateResult.count) {
          throw new ConflictException('Coupon is no longer available');
        }
      }

      // Deduct wallet balance if paying with wallet
      if (data.paidWithWallet) {
        await this.walletService.deductUserBalance(userId, totalPrice, tx);
      }

      const displayZoneId = await this.resolveDisplayZoneId(
        tx,
        zoneId,
        data.zoneId,
      );

      const order = await tx.order.create({
        data: {
          tip: data.tip ?? 0,
          price: subtotal,
          totalPriceAfterDiscount: totalPrice,
          discountAmount: discountValue,
          adminCommission: adminCommission,
          globalCommission: globalCommission,
          storeCommission: storeCommission,
          shipping: shipping,
          tax: tax,
          couponId,
          addressId,
          userId,
          branchId,
          zoneId: displayZoneId,
          customerSelectedZoneId: data.zoneId ?? null,
          type: data.type || OrderType.DELIVERY,
          paidWithWallet: data.paidWithWallet,
          isGift: data.isGift ?? false,
          // paidWithWallet debits the customer's real in-app balance immediately
          // (verified via deductUserBalance above), so it's genuinely PAID. A
          // WALLET transferNumber/transferImage is just an unverified claim — it
          // starts UNPAID and only flips to PAID once an admin/store approves it
          // via PATCH /orders/:id/verify-payment.
          paymentStatus: data.paidWithWallet
            ? PaymentStatus.PAID
            : PaymentStatus.UNPAID,
          paymentMethod: data.paymentMethod,
          transferNumber: data.transferNumber,
          transferImage: data.transferImage,
          transferType: data.transferType,
          transferAccountNumber: data.transferAccountNumber,
          // WALLET (transfer + proof image) orders wait for that proof to be
          // reviewed before the store ever sees them — see verifyPayment()
          // below, which flips PENDING_PAYMENT -> PENDING and only then runs
          // notifyStore(). Everything else notifies the store right below;
          // driver assignment itself only starts once the store accepts
          // (-> PREPARING), see changeStatus()'s PREPARING branch — never in
          // parallel with the store's decision.
          status:
            data.paymentMethod === PaymentMethod.WALLET && !data.paidWithWallet
              ? OrderStatus.PENDING_PAYMENT
              : OrderStatus.PENDING,
          category: data.category || OrderCategory.IMMEDIATE,
          scheduledAt: data.scheduledAt,
          note: data.note,
          invoice: {}, // Initial empty invoice
        },
        include: {
          Branch: true,
        },
      });

      // Consume fortune reward atomically inside the order transaction
      if (rewardId) {
        await this.helpers.consumeFortuneReward(tx, rewardId, userId, order.id);
      }

      // Re-validate every applied bundle inside the transaction: it may have been
      // deactivated, expired, or soft-deleted between calculateOrder() and commit.
      if (bundles.length) {
        const bundleIds = bundles.map((bundle) => bundle.bundle.id);
        const stillValid = await tx.bundle.findMany({
          where: { id: { in: bundleIds }, ...validBundleWhere() },
          select: { id: true },
        });
        const validIds = new Set(stillValid.map((bundle) => bundle.id));
        if (bundleIds.some((id) => !validIds.has(id)))
          throw new ConflictException('Bundle is no longer available');
      }

      const orderBundles = new Map<number, number>();
      for (const bundle of bundles) {
        const orderBundle = await tx.orderBundle.create({
          data: {
            orderId: order.id,
            bundleId: bundle.bundle.id,
            title: bundle.bundle.title,
            type: bundle.bundle.type,
            requiredPaidQuantity: bundle.bundle.requiredPaidQuantity,
            freeQuantity: bundle.bundle.freeQuantity,
            freeDiscountAmount: bundle.freeDiscountAmount,
            snapshot: bundle.snapshot,
          },
        });
        orderBundles.set(bundle.selectionIndex, orderBundle.id);
      }

      const orderItems = [];
      for (const item of items) {
        const orderItem = await tx.orderItem.create({
          data: {
            orderId: order.id,
            serviceId: item.serviceId,
            sizeId: item?.selected?.size?.id,
            quantity: item.quantity,
            price: item.itemTotalPrice,
            orderBundleId:
              item.bundleSelectionIndex === undefined
                ? undefined
                : orderBundles.get(item.bundleSelectionIndex),
            isFree: item.isFree,
          },
          include: {
            Service: {
              include: {
                Store: true,
              },
            },
            Size: true,
          },
        });

        const addons = [];
        if (item.addonIds?.length) {
          for (const addon of item.selected.addons) {
            const orderAddon = await tx.orderItemAddon.create({
              data: {
                orderItemId: orderItem.id,
                addonId: addon.id,
              },
              include: {
                Addon: true,
              },
            });
            addons.push(orderAddon);
          }
        }
        orderItems.push({ ...orderItem, addons });
      }

      const estimatedArrivalMinutes =
        data.type !== OrderType.PICKUP
          ? await this.calculateEstimatedArrival({
              ...order,
              Address: await this.prisma.address.findUnique({
                where: { id: addressId },
              }),
              Branch: await this.prisma.branch.findUnique({
                where: { id: branchId },
              }),
              OrderItems: orderItems,
            })
          : 0;

      const invoice = {
        orderId: order.id,
        customer: userId,
        branchId: branchId,
        store: {
          id: items[0].service.Store.id,
          name: items[0].service.Store.name,
          logo: items[0].service.Store.logo,
          address: branch?.address,
        },
        items: orderItems.map((item) => ({
          service: item.Service.name,
          size: item?.Size?.name,
          quantity: item.quantity,
          price: item.price,
          addons: item.addons.map((a) => a.Addon.name),
        })),
        bundles: bundles.map((bundle) => ({
          bundleId: bundle.bundle.id,
          title: bundle.bundle.title,
          type: bundle.bundle.type,
          requiredPaidQuantity: bundle.bundle.requiredPaidQuantity,
          freeQuantity: bundle.bundle.freeQuantity,
          freeDiscountAmount: bundle.freeDiscountAmount,
          ...bundle.snapshot,
        })),
        summary: {
          subtotal,
          tax,
          shipping,
          discount: discountValue,
          globalCommission,
          storeCommission,
          commission: adminCommission,
          total: totalPrice,
        },
        estimatedArrivalMinutes,
        paymentMethod: data.paymentMethod,
        orderType: data.type || OrderType.DELIVERY,
        date: new Date(),
      };

      // Paying with the customer's in-app wallet debits them immediately, so log
      // their side of the ledger now. Branch/admin earnings are recognized once,
      // at DELIVERED, via distributeEarnings() — crediting them here too (as this
      // used to) double-counted every wallet-paid order that completed normally.
      // Omitting branchId/adminCommission keeps this a customer-only entry.
      if (data.paidWithWallet) {
        await this.transactionService.createTransactionWithinTx(
          {
            userId,
            referenceId: order.id,
            type: TransactionType.ORDER_CREATED,
            balance: totalPrice,
          },
          tx,
        );
      }

      return { invoice, order };
    });

    await this.prisma.order.update({
      where: { id: order.id },
      data: { invoice },
      include: {
        OrderItems: {
          include: {
            Service: true,
            Size: true,
            OrderItemAddons: {
              include: {
                Addon: true,
              },
            },
          },
        },
      },
    });
    // WALLET (transfer + proof) orders stay quiet until the proof is reviewed —
    // see verifyPayment(), which calls notifyStore() itself once approved.
    if (data.paymentMethod !== PaymentMethod.WALLET || data.paidWithWallet) {
      await this.notifyStore(order);
    }

    return order;
  }

  // Re-submits a past order's items/bundles as a brand-new order — re-priced from
  // scratch (menu prices/addons/commission may have changed since), not a copy of
  // the old invoice. Only regular store orders can be reordered; custom-delivery
  // orders have no reorderable "items" concept.
  async reorder(orderId: number, userId: number, body: ReorderDTO) {
    const oldOrder = await this.prisma.order.findFirst({
      where: { id: orderId, userId },
      include: {
        OrderItems: { include: { OrderItemAddons: true, OrderBundle: true } },
      },
    });
    if (!oldOrder) {
      throw new BadRequestException('الطلب غير موجود');
    }
    if (oldOrder.type === OrderType.CUSTOM_DELIVERY) {
      throw new BadRequestException('لا يمكن إعادة طلب توصيل خاص');
    }
    if (!oldOrder.branchId) {
      throw new BadRequestException('لا يمكن إعادة هذا الطلب');
    }

    const items: OrderItemDTO[] = [];
    const bundleGroups = new Map<
      number,
      { bundleId: Id; paidItems: BundleLineDTO[]; freeItems: BundleLineDTO[] }
    >();

    for (const item of oldOrder.OrderItems) {
      const addonIds = item.OrderItemAddons.map((a) => a.addonId);
      if (item.orderBundleId) {
        // A bundle whose parent Bundle offer was itself deleted can't be re-priced
        // (validateAndPriceBundles requires a live Bundle row) — its items are
        // silently dropped from the reorder rather than failing the whole thing.
        if (!item.OrderBundle?.bundleId) continue;
        let group = bundleGroups.get(item.orderBundleId);
        if (!group) {
          group = {
            bundleId: item.OrderBundle.bundleId,
            paidItems: [],
            freeItems: [],
          };
          bundleGroups.set(item.orderBundleId, group);
        }
        const line: BundleLineDTO = {
          serviceId: item.serviceId,
          sizeId: item.sizeId ?? undefined,
          addonIds,
          quantity: item.quantity,
        };
        (item.isFree ? group.freeItems : group.paidItems).push(line);
      } else {
        items.push({
          serviceId: item.serviceId,
          sizeId: item.sizeId ?? undefined,
          addonIds,
          quantity: item.quantity,
        } as OrderItemDTO);
      }
    }

    const bundleSelections: BundleSelectionDTO[] = Array.from(
      bundleGroups.values(),
    ).map((g) => ({
      bundleId: g.bundleId,
      paidItems: g.paidItems,
      freeItems: g.freeItems,
    }));

    if (items.length === 0 && bundleSelections.length === 0) {
      throw new BadRequestException(
        'تعذرت إعادة هذا الطلب — العناصر لم تعد متاحة',
      );
    }

    return this.create({
      userId,
      branchId: oldOrder.branchId,
      addressId: body.addressId ?? oldOrder.addressId ?? undefined,
      items,
      bundleSelections,
      type: oldOrder.type,
      paymentMethod: body.paymentMethod,
      paidWithWallet: body.paidWithWallet,
      note: body.note,
    } as CreateOrderDTO);
  }

  // Shared first-visibility step for an order: alerts the store's staff only.
  // Runs immediately for CASH/paidWithWallet orders (right after create()), or
  // once a WALLET transfer proof is approved (see verifyPayment()). Driver
  // assignment is intentionally NOT triggered here — the store must accept the
  // order first (see changeStatus()'s PREPARING branch), so a driver is never
  // notified/dispatched before the store has even seen the order.
  private async notifyStore(order: any) {
    // Guard on a non-null branchId: querying `{ where: { branchId: null } }` matches every
    // branch-less user (all customers/admins/drivers) and would broadcast a NEW_ORDER push to
    // them. Branch-less orders (e.g. CUSTOM_DELIVERY) have no store staff to notify on this path.
    if (order.branchId != null) {
      const [storeUsers, branch] = await Promise.all([
        this.prisma.user.findMany({
          where: { branchId: order.branchId },
          select: { id: true },
        }),
        this.prisma.branch.findUnique({
          where: { id: order.branchId },
          select: { storeId: true, Store: { select: { managedByAdmin: true } } },
        }),
      ]);

      // Live push to any store dashboard/app connected to the WebSocket
      // gateway — lets the UI show a new order instantly without polling,
      // on top of (not instead of) the FCM push below.
      if (branch?.storeId != null) {
        this.orderTrackingGateway.broadcastNewOrder(branch.storeId, {
          id: order.id,
          status: order.status,
          type: order.type,
        });
      }

      const notifyUserIds = new Set(storeUsers.map((user) => user.id));

      // No staff use the store app for this store — the admin team runs its
      // order flow instead, so route the notification to every Admin too.
      if (branch?.Store?.managedByAdmin) {
        const admins = await this.prisma.user.findMany({
          where: { roleKey: RolesKeys.ADMIN },
          select: { id: true },
        });
        admins.forEach((admin) => notifyUserIds.add(admin.id));
      }

      for (const userId of notifyUserIds) {
        await this.notificationService.sendLocalizedNotification(
          userId,
          NotificationMessages.newOrderCreated.title,
          NotificationMessages.newOrderCreated.body,
          undefined,
          NotificationType.NEW_ORDER,
          order.id,
        );
      }
    }
  }

  // Admin/store review of a WALLET-payment transfer proof (transferNumber/
  // transferAccountNumber + transferImage — any TransferType). Approving is the
  // only thing that turns a PENDING_PAYMENT order into a real, actionable one —
  // first time the store ever sees it. Rejecting marks it PAYMENT_FAILD and
  // tells the customer why. Payment-method-agnostic: no changes needed here for
  // new transfer sub-methods (bank transfer included).
  async verifyPayment(id: Id, approved: boolean, reason?: string) {
    const order = await this.helpers.getOrderById(id);
    if (order.status !== OrderStatus.PENDING_PAYMENT) {
      throw new BadRequestException(
        'This order is not awaiting payment verification',
      );
    }

    if (approved) {
      const updatedOrder = await this.prisma.order.update({
        where: { id },
        data: {
          status: OrderStatus.PENDING,
          paymentStatus: PaymentStatus.PAID,
        },
      });
      await this.notifyStore(updatedOrder);
      await this.notificationService.sendLocalizedNotification(
        order.userId,
        { ar: 'تم تأكيد الدفع', en: 'Payment confirmed' },
        {
          ar: 'تم تأكيد تحويلك، جاري تجهيز طلبك',
          en: 'Your transfer has been confirmed — your order is being processed',
        },
        { resourceId: `${id}` },
        NotificationType.ORDER,
        id,
      );
    } else {
      await this.prisma.order.update({
        where: { id },
        data: { status: OrderStatus.PAYMENT_FAILD },
      });
      await this.notificationService.sendLocalizedNotification(
        order.userId,
        { ar: 'فشل تأكيد الدفع', en: 'Payment verification failed' },
        {
          ar: reason || 'لم نتمكن من تأكيد تحويلك، برجاء التواصل معنا',
          en:
            reason ||
            'We could not verify your transfer — please contact support',
        },
        { resourceId: `${id}` },
        NotificationType.ORDER,
        id,
      );
    }

    return { success: true };
  }

  async rateOrder(id: Id, body: RateDTO, userId: Id) {
    const order = await this.helpers.getOrderById(id);
    await this.helpers.canUserRate(userId, order.id);

    // At least one rating target must be supplied.
    if (!body.storeRate && !body.deliveryRate) {
      throw new BadRequestException('Provide a store or delivery rating');
    }

    // Driver target must exist — never silently succeed when there is nothing to rate.
    if (body.deliveryRate && !order.deliveryId) {
      throw new BadRequestException('This order has no driver to rate');
    }

    // Store target must exist: a branch with a parent store. StoreRating.storeId is
    // nullable in the schema, but we do not allow branch-only ratings.
    let branch: { rating: number; review: number; storeId: number | null } =
      null;
    if (body.storeRate) {
      if (!order.branchId) {
        throw new BadRequestException('This order has no store to rate');
      }
      branch = await this.prisma.branch.findUnique({
        where: { id: order.branchId },
        select: { rating: true, review: true, storeId: true },
      });
      if (!branch || !branch.storeId) {
        throw new BadRequestException('This order has no store to rate');
      }
    }

    await this.prisma.$transaction(async (tx) => {
      // 1. Store rating (branch + parent store + ordered services), validated above.
      if (body.storeRate) {
        const newBranchRating = calculateNewAverageRating(
          branch.rating,
          branch.review,
          body.storeRate,
        );
        await tx.branch.update({
          where: { id: order.branchId },
          data: {
            rating: newBranchRating,
            review: { increment: 1 },
          },
        });

        // 1.1 Update Store Rating
        const store = await tx.store.findUnique({
          where: { id: branch.storeId },
          select: { rating: true, review: true },
        });
        const newStoreRating = calculateNewAverageRating(
          store.rating,
          store.review,
          body.storeRate,
        );
        await tx.store.update({
          where: { id: branch.storeId },
          data: {
            rating: newStoreRating,
            review: { increment: 1 },
          },
        });
        await tx.storeRating.create({
          data: {
            userId,
            branchId: order.branchId,
            storeId: branch.storeId,
            orderId: order.id,
            rating: body.storeRate,
            comment: body.storeComment,
          },
        });

        // 1.2 Update Service Ratings (only when a store rating was given)
        const orderItems = await tx.orderItem.findMany({
          where: { orderId: order.id },
          include: {
            Service: { select: { id: true, rating: true, review: true } },
          },
        });

        for (const item of orderItems) {
          const service = item.Service;
          const newServiceRating = calculateNewAverageRating(
            service.rating,
            service.review,
            body.storeRate,
          );
          await tx.service.update({
            where: { id: service.id },
            data: {
              rating: newServiceRating,
              review: { increment: 1 },
            },
          });
        }
      }

      // 2. Delivery rating, validated above (order.deliveryId guaranteed non-null).
      if (body.deliveryRate) {
        const delivery = await tx.deliveryDetails.findUnique({
          where: { userId: order.deliveryId },
          select: { rating: true, review: true },
        });
        const newDeliveryRating = calculateNewAverageRating(
          delivery.rating,
          delivery.review,
          body.deliveryRate,
        );
        await tx.deliveryDetails.update({
          where: { userId: order.deliveryId },
          data: {
            rating: newDeliveryRating,
            review: { increment: 1 },
          },
        });
        await tx.deliveryRating.create({
          data: {
            userId,
            deliveryId: order.deliveryId,
            orderId: order.id,
            rating: body.deliveryRate,
            comment: body.deliveryComment,
          },
        });
      }

      // 3. Mark Order as Rated
      await tx.order.update({
        where: { id: order.id },
        data: { rated: true },
      });
    });

    // 6. Recalculate Top 10s (Async)
    this.calculateBestRatedStore().catch(console.error);
    this.calculateBestRatedBranch().catch(console.error);
    this.calculateBestRatedDelivery().catch(console.error);
    this.calculateBestRatedService().catch(console.error);
  }

  private async calculateBestRatedStore() {
    const topStores = await this.prisma.store.findMany({
      where: { review: { gt: 0 } },
      orderBy: [{ rating: 'desc' }, { review: 'desc' }],
      take: 10,
    });

    await this.prisma.store.updateMany({
      where: { bestRated: true },
      data: { bestRated: false },
    });

    for (const store of topStores) {
      await this.prisma.store.update({
        where: { id: store.id },
        data: { bestRated: true },
      });
    }
  }

  private async calculateBestRatedBranch() {
    const topBranches = await this.prisma.branch.findMany({
      where: { review: { gt: 0 } },
      orderBy: [{ rating: 'desc' }, { review: 'desc' }],
      take: 10,
    });

    await this.prisma.branch.updateMany({
      where: { bestRated: true },
      data: { bestRated: false },
    });

    for (const branch of topBranches) {
      await this.prisma.branch.update({
        where: { id: branch.id },
        data: { bestRated: true },
      });
    }
  }

  private async calculateBestRatedDelivery() {
    const topDelivery = await this.prisma.deliveryDetails.findMany({
      where: { review: { gt: 0 } },
      orderBy: [{ rating: 'desc' }, { review: 'desc' }],
      take: 10,
    });

    await this.prisma.deliveryDetails.updateMany({
      where: { bestRated: true },
      data: { bestRated: false },
    });

    for (const delivery of topDelivery) {
      await this.prisma.deliveryDetails.update({
        where: { userId: delivery.userId },
        data: { bestRated: true },
      });
    }
  }

  private async calculateBestRatedService() {
    const topServices = await this.prisma.service.findMany({
      where: { review: { gt: 0 } },
      orderBy: [{ rating: 'desc' }, { review: 'desc' }],
      take: 10,
    });

    await this.prisma.service.updateMany({
      where: { bestRated: true },
      data: { bestRated: false },
    });

    for (const service of topServices) {
      await this.prisma.service.update({
        where: { id: service.id },
        data: { bestRated: true },
      });
    }
  }
  async findAll(filters: FilterOrderDTO, user: CurrentUser) {
    const languages = await this.languages.getCashedLanguages();
    if (user && filters.id && user.Role.roleKey === RolesKeys.DELIVERY) {
      filters.userId = undefined;
    }
    if (user && !filters.id && user.Role.roleKey === RolesKeys.DELIVERY) {
      filters.deliveryId = user.id;
      filters.userId = undefined;
    }

    const args = getOrderArgs(filters, languages);

    const argsWithSelect = getOrderArgsWithSelect(
      filters,
      user && user?.Role?.roleKey === RolesKeys.CUSTOMER ? user.id : undefined,
    );

    const data = await this.prisma.order[firstOrMany(filters?.id)]({
      ...argsWithSelect,
      ...args,
    });

    const settings = await this.settingService.getSettings([
      'storeNearestByKM',
    ]);
    const storeNearestByKM = settings.storeNearestByKM || 50;

    if (data) {
      const orders = Array.isArray(data) ? data : [data];
      await Promise.all(
        orders.map(async (order) => {
          const deliveryDetailsRaw =
            order.Delivery?.['User']?.['DeliveryDetails'];
          const deliveryDetails = Array.isArray(deliveryDetailsRaw)
            ? deliveryDetailsRaw[0]
            : deliveryDetailsRaw;
          const estimatedTime =
            order.Delivery &&
            deliveryDetails?.lat !== undefined &&
            deliveryDetails?.lng !== undefined
              ? await this.calculateDeliveryLiveETA(
                  order.id,
                  deliveryDetails.lat,
                  deliveryDetails.lng,
                )
              : 0;

          let canDeliver = true;
          if (
            filters.lat &&
            filters.lng &&
            order.Branch?.lat &&
            order.Branch?.lng
          ) {
            const distance =
              calculateDistance(
                filters.lat,
                filters.lng,
                order.Branch.lat,
                order.Branch.lng,
              ) / 1000;
            canDeliver = distance <= storeNearestByKM;
          }

          Object.assign(order, {
            estimatedArrivalMinutes: estimatedTime,
            canDeliver: canDeliver,
            ratingEligibility: this.buildRatingEligibility(order as any),
            ...(order.type === OrderType.CUSTOM_DELIVERY && {
              customDeliveryProgress: this.buildStationProgress(
                ((order as any).Stations ?? []) as {
                  sequence: number;
                  status: StationStatus;
                }[],
              ),
            }),
          });
        }),
      );
    }

    return data;
  }

  async calculateEstimatedArrival(order: any): Promise<number> {
    if (!order || !order.Address || !order.Branch) return 0;

    const { status, OrderItems, Address, Branch } = order;

    // Check if status implies delivery is pending or active
    // Assuming status flow: PENDING -> PREPARING -> READY -> ON_THE_WAY -> DELIVERED
    if (
      [
        OrderStatus.DELIVERED,
        OrderStatus.CANCELLED,
        OrderStatus.REJECTED,
      ].includes(status)
    ) {
      return 0;
    }

    // Calculate travel time from MapService
    // Origin: Branch, Destination: Customer Address
    let travelTimeMinutes = 0;
    try {
      const tripDetails = await this.mapService.getTripDetails(
        `${Branch.lat},${Branch.lng}`,
        `${Address.lat},${Address.lng}`,
      );

      if (tripDetails?.rows?.[0]?.elements?.[0]?.status === 'OK') {
        const durationValue = tripDetails.rows[0].elements[0].duration.value; // seconds
        travelTimeMinutes = Math.ceil(durationValue / 60);
      }
    } catch (error) {
      console.error('Error calculating estimated time:', error);
      // Fallback or ignore
    }

    if (order.type === OrderType.PICKUP) {
      // For pickup, travel time is 0 (or we could estimate the customer's travel, but usually ETA for pickup is prep time)
      travelTimeMinutes = 0;
    }

    if (status === OrderStatus.ON_THE_WAY) {
      // Only road time
      return travelTimeMinutes;
    } else {
      // Preparation time + road time
      // Find max duration from products
      const maxProductDuration =
        OrderItems?.reduce((max, item) => {
          const duration = item.Service?.durationMinutes || 0;
          return duration > max ? duration : max;
        }, 0) || 0;

      return maxProductDuration + travelTimeMinutes;
    }
  }

  async calculateDeliveryLiveETA(
    orderId: number,
    deliveryLat: number,
    deliveryLng: number,
  ): Promise<number> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        Address: {
          select: { lat: true, lng: true },
        },
      },
    });

    if (!order || !order.Address) return 0;

    let travelTimeMinutes = 0;
    try {
      const tripDetails = await this.mapService.getTripDetails(
        `${deliveryLat},${deliveryLng}`,
        `${order.Address.lat},${order.Address.lng}`,
      );

      if (tripDetails?.rows?.[0]?.elements?.[0]?.status === 'OK') {
        const durationValue = tripDetails.rows[0].elements[0].duration.value;
        travelTimeMinutes = Math.ceil(durationValue / 60);
      }
    } catch (error) {
      console.error('Error calculating live delivery ETA:', error);
    }

    return travelTimeMinutes;
  }

  async getTracking(orderId: number) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        deliveryId: true,
        Delivery: {
          select: {
            lat: true,
            lng: true,
            bearing: true,
            lastLocationUpdate: true,
          },
        },
      },
    });

    if (!order) {
      throw new BadRequestException('Order not found');
    }

    if (!order.deliveryId || !order.Delivery) {
      return {
        order_id: order.id,
        delivery_boy: null,
      };
    }

    return {
      order_id: order.id,
      delivery_boy: {
        id: order.deliveryId,
        lat: order.Delivery.lat,
        lng: order.Delivery.lng,
        bearing: order.Delivery.bearing,
        last_seen: order.Delivery.lastLocationUpdate,
      },
    };
  }

  async count(filters: FilterOrderDTO) {
    const languages = await this.languages.getCashedLanguages();
    const args = getOrderArgs(filters, languages);
    const total = await this.prisma.order.count({ where: args.where });

    return total;
  }
  async changeStatus(
    id: Id,
    status: OrderStatus,
    user: CurrentUser,
    lat?: number,
    lng?: number,
  ) {
    this.logger.log(
      `[geofence-debug] changeStatus called: orderId=${id} status=${status} userId=${user.id} roleKey=${user.Role?.roleKey} coordinates=(${lat}, ${lng})`,
    );
    const order = await this.helpers.getOrderById(id);
    await this.helpers.canUserAccessOrderId(user, order);
    this.helpers.assertStatusTransitionAllowed(user, order, status);

    // --- Location Checks for Delivery Drivers ---
    if (user.Role?.roleKey === RolesKeys.DELIVERY) {
      const geofenceSettings = await this.settingService.getSettings([
        'pickupGeofenceRadiusMeters',
        'deliveryGeofenceRadiusMeters',
      ]);
      const pickupRadius = geofenceSettings.pickupGeofenceRadiusMeters || 1500;
      const deliveryRadius =
        geofenceSettings.deliveryGeofenceRadiusMeters || 1500;

      if (status === OrderStatus.ON_THE_WAY) {
        if (!lat || !lng) {
          throw new BadRequestException(
            'Location coordinates are required to pick up the order',
          );
        }
        const branch = await this.prisma.branch.findUnique({
          where: { id: order.branchId },
        });
        if (branch?.lat && branch?.lng) {
          const distance = calculateDistance(lat, lng, branch.lat, branch.lng);
          const withinRange = distance <= pickupRadius;
          this.logger.log(
            `[geofence-debug] ON_THE_WAY check: Distance between driver and restaurant: ${Math.round(distance)}m. Within range? ${withinRange ? 'YES' : 'NO'}. Allowed Threshold: ${pickupRadius}m. Driver: (${lat}, ${lng}), Restaurant/Branch: (${branch.lat}, ${branch.lng})`,
          );
          if (!withinRange) {
            this.logger.warn(
              `[geofence-debug] ON_THE_WAY BLOCKED: Driver is outside the geofence. Distance: ${Math.round(distance)}m. Threshold: ${pickupRadius}m. Driver: (${lat}, ${lng}), Restaurant/Branch: (${branch.lat}, ${branch.lng})`,
            );
            throw new BadRequestException(
              `You must be at the store to pick up the order. Current distance: ${Math.round(distance)}m (Driver: ${lat},${lng} | Branch: ${branch.lat},${branch.lng} | Allowed: ${pickupRadius}m)`,
            );
          }
        }
      }

      if (status === OrderStatus.DELIVERED) {
        if (!lat || !lng) {
          throw new BadRequestException(
            'Location coordinates are required to deliver the order',
          );
        }
        // Get customer location (address). Only delivery orders carry an addressId;
        // PICKUP / CUSTOM_DELIVERY orders have none (addressId is nullable), so skip the
        // proximity check for them instead of issuing an invalid findUnique on a null id.
        if (order.addressId) {
          const address = await this.prisma.address.findUnique({
            where: { id: order.addressId },
          });
          if (address?.lat && address?.lng) {
            const distance = calculateDistance(
              lat,
              lng,
              address.lat,
              address.lng,
            );
            const withinRange = distance <= deliveryRadius;
            this.logger.log(
              `[geofence-debug] DELIVERED check: Distance between driver and customer: ${Math.round(distance)}m. Within range? ${withinRange ? 'YES' : 'NO'}. Allowed Threshold: ${deliveryRadius}m. Driver: (${lat}, ${lng}), Customer address: (${address.lat}, ${address.lng})`,
            );
            if (!withinRange) {
              this.logger.warn(
                `[geofence-debug] DELIVERED BLOCKED: Driver is outside the geofence. Distance: ${Math.round(distance)}m. Threshold: ${deliveryRadius}m. Driver: (${lat}, ${lng}), Customer address: (${address.lat}, ${address.lng})`,
              );
              throw new BadRequestException(
                `You must be at the customer location to deliver the order. Current distance: ${Math.round(distance)}m (Driver: ${lat},${lng} | Address: ${address.lat},${address.lng} | Allowed: ${deliveryRadius}m)`,
              );
            }
          }
        }
      }
    }

    let updatedStatus = status;
    // Removed ACCEPTED to PENDING_PAYMENT logic as ACCEPTED is removed.
    // Removed SCHEDULED logic as SCHEDULED is removed.

    let deliveryLat = lat;
    let deliveryLng = lng;

    // Store accepting (-> PREPARING) is the first point a driver may be searched
    // for — never at order creation. In AUTO assignment mode we don't search
    // immediately either: we schedule it `driverAssignmentDelaySeconds` (default
    // 8min) out via assignmentReadyAt, and AssignmentTimerService's cron picks it
    // up then. In MANUAL mode we schedule nothing — the admin assigns directly via
    // the existing /orders/assign flow, unaffected by any of this. Only applies to
    // regular in-app store orders (DELIVERY); PICKUP has no driver to assign, and
    // CUSTOM_DELIVERY/ONLINE never reach this status via changeStatus at all (they
    // have their own creation-time assignment flow).
    let scheduledAssignmentReadyAt: Date | null = null;
    if (
      status === OrderStatus.PREPARING &&
      order.type === OrderType.DELIVERY &&
      !order.deliveryId
    ) {
      const { deliveryAssignmentMode } = await this.settingService.getSettings([
        'deliveryAssignmentMode',
      ]);
      if (deliveryAssignmentMode === 'AUTO') {
        const { driverAssignmentDelaySeconds } =
          await this.settingService.getSettings([
            'driverAssignmentDelaySeconds',
          ]);
        const delaySeconds = Number(driverAssignmentDelaySeconds) || 480;
        scheduledAssignmentReadyAt = new Date(Date.now() + delaySeconds * 1000);
      }
    }

    if (updatedStatus === OrderStatus.ON_THE_WAY && order.deliveryId) {
      if (
        user?.Role?.roleKey === RolesKeys.ADMIN ||
        !deliveryLat ||
        !deliveryLng
      ) {
        const deliveryDetails = await this.prisma.deliveryDetails.findUnique({
          where: { userId: order.deliveryId },
        });
        if (deliveryDetails) {
          deliveryLat = deliveryDetails.lat;
          deliveryLng = deliveryDetails.lng;
        }
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: {
          id: id,
        },
        data: {
          status: updatedStatus,
          paymentStatus:
            updatedStatus === OrderStatus.DELIVERED
              ? PaymentStatus.PAID
              : order.paymentStatus,
          ...(updatedStatus === OrderStatus.ON_THE_WAY &&
            deliveryLat &&
            deliveryLng && {
              deliveryLat: deliveryLat,
              deliveryLng: deliveryLng,
            }),
          ...(scheduledAssignmentReadyAt && {
            assignmentReadyAt: scheduledAssignmentReadyAt,
          }),
          ...(updatedStatus === OrderStatus.PREPARING && {
            preparingAt: new Date(),
            ...(user.Role?.roleKey === RolesKeys.STORE && {
              acceptedByUserId: user.id,
            }),
          }),
          ...(updatedStatus === OrderStatus.REJECTED &&
            user.Role?.roleKey === RolesKeys.STORE && {
              rejectedByUserId: user.id,
            }),
          ...(updatedStatus === OrderStatus.READY_PICKUP && {
            readyAt: new Date(),
            ...(user.Role?.roleKey === RolesKeys.STORE && {
              readyMarkedByUserId: user.id,
            }),
          }),
        },
      });

      if (
        status === OrderStatus.DELIVERED &&
        order.status !== OrderStatus.DELIVERED
      ) {
        // Distribute earnings to Admin, Branch, and Delivery
        await this.walletService.distributeEarnings(order, tx);

        // Log multi-party transaction
        await this.transactionService.createTransactionWithinTx(
          {
            userId: order.userId,
            branchId: order.branchId,
            deliveryId: order.deliveryId,
            referenceId: order.id,
            type: TransactionType.ORDER_COMPLETED,
            balance: order.totalPriceAfterDiscount,
            adminCommission: order.adminCommission,
            shipping: order.shipping,
          } as any,
          tx,
        );
      }

      // Refund to the customer's wallet only when:
      //  (1) the order is not already CANCELLED — guards against a double cancel re-running the
      //      refund (observed in prod: order 151 refunded twice), and
      //  (2) the money was actually taken from the customer by the platform — i.e. paid with
      //      wallet or an online method. CASH orders are collected by the driver on delivery
      //      (paymentStatus only flips to PAID at DELIVERED), so the platform never held that
      //      cash; crediting the wallet on a cash cancellation mints money that was never paid.
      if (
        status === OrderStatus.CANCELLED &&
        order.status !== OrderStatus.CANCELLED &&
        order.paymentStatus === PaymentStatus.PAID &&
        (order.paidWithWallet || order.paymentMethod !== PaymentMethod.CASH)
      ) {
        await this.walletService.refundOrder(order, tx);

        await this.transactionService.createTransactionWithinTx(
          {
            userId: order.userId,
            branchId: order.branchId,
            referenceId: order.id,
            type: TransactionType.ORDER_REFUND,
            balance: order.totalPriceAfterDiscount,
            adminCommission: order.adminCommission,
          } as any,
          tx,
        );
      }
    });

    // Live push to any store dashboard/app connected to the WebSocket gateway
    // — instant status update without polling, alongside the FCM/in-app
    // notifications below.
    const broadcastStoreId = (order as any).OrderItems?.[0]?.Service?.storeId;
    if (broadcastStoreId != null) {
      this.orderTrackingGateway.broadcastOrderStatusChanged(
        broadcastStoreId,
        id,
        updatedStatus,
      );
    }

    // Audit trail + employee-performance data source — only store-employee
    // actions on these three transitions (accept/reject/ready) are logged
    // here; driver/admin/customer transitions aren't part of this store
    // audit view.
    const auditedStatuses: OrderStatus[] = [
      OrderStatus.PREPARING,
      OrderStatus.REJECTED,
      OrderStatus.READY_PICKUP,
    ];
    if (
      user.Role?.roleKey === RolesKeys.STORE &&
      auditedStatuses.includes(status)
    ) {
      const storeId = (order as any).OrderItems?.[0]?.Service?.storeId;
      const actingUser = await this.prisma.user.findUnique({
        where: { id: user.id },
        select: { name: true },
      });
      const actionByStatus: Partial<Record<OrderStatus, string>> = {
        [OrderStatus.PREPARING]: 'ORDER_ACCEPTED',
        [OrderStatus.REJECTED]: 'ORDER_REJECTED',
        [OrderStatus.READY_PICKUP]: 'ORDER_READY',
      };
      await this.logsService.createLog({
        userId: String(user.id),
        userName: actingUser?.name ?? '',
        userRole: user.Role.roleKey,
        action: actionByStatus[status] ?? 'ORDER_STATUS_CHANGED',
        details: `Order #${order.id} marked as ${status}`,
        storeId,
      });
    }

    if (status === OrderStatus.DELIVERED) {
      for (const item of (order as any).OrderItems) {
        await this.calculateBestSeller(item.serviceId);
      }
    }

    // --- Refined Notification Logic ---
    const recipients = new Set<Id>();

    // 1. Notify Customer (if not the triggerer)
    if (user.id !== order.userId) {
      recipients.add(order.userId);
    }

    // 2. Notify Store (important cases only)
    // Guard on a non-null branchId: `findMany({ where: { branchId: null } })` compiles to
    // `WHERE branch_id IS NULL`, which matches every branch-less user (all customers, admins,
    // and drivers) and would broadcast a customer-facing ORDER notification to the whole base.
    // Branch-less orders (e.g. CUSTOM_DELIVERY) have no store staff to notify on this path.
    const storeImportantStatuses: OrderStatus[] = [
      OrderStatus.ON_THE_WAY,
      OrderStatus.DELIVERED,
      OrderStatus.CANCELLED,
    ];
    if (order.branchId != null && storeImportantStatuses.includes(status)) {
      const storeUsers = await this.prisma.user.findMany({
        where: { branchId: order.branchId, id: { not: user.id } },
        select: { id: true },
      });
      storeUsers.forEach((u) => recipients.add(u.id));
    }

    // 3. Notify Admin (critical cases only)
    const adminImportantStatuses: OrderStatus[] = [
      OrderStatus.CANCELLED,
      OrderStatus.REJECTED,
    ];
    if (adminImportantStatuses.includes(status)) {
      const adminUsers = await this.prisma.user.findMany({
        where: { roleKey: RolesKeys.ADMIN, id: { not: user.id } },
        select: { id: true },
      });
      adminUsers.forEach((u) => recipients.add(u.id));
    }

    // No automatic refund on REJECTED (unlike CANCELLED) — an admin decides
    // case-by-case. If the platform already took the payment, make sure the
    // admin actually gets told there's money to send back.
    if (
      status === OrderStatus.REJECTED &&
      order.paymentStatus === PaymentStatus.PAID &&
      (order.paidWithWallet || order.paymentMethod !== PaymentMethod.CASH)
    ) {
      const refundOwedMessage = NotificationMessages.orderRejectedRefundOwed(
        order.id,
        order.totalPriceAfterDiscount,
      );
      const adminUsersToNotify = await this.prisma.user.findMany({
        where: { roleKey: RolesKeys.ADMIN, id: { not: user.id } },
        select: { id: true },
      });
      for (const admin of adminUsersToNotify) {
        await this.notificationService.sendLocalizedNotification(
          admin.id,
          refundOwedMessage.title,
          refundOwedMessage.body,
          { resourceId: `${order.id}` },
          NotificationType.ADMIN,
          order.id,
        );
      }
    }

    // 4. Notify Delivery (if assigned and order is ready)
    if (status === OrderStatus.READY_PICKUP && order.deliveryId) {
      recipients.add(order.deliveryId);
    }

    const { title, body } = NotificationMessages.orderStatusChanged(status);
    for (const recipientId of recipients) {
      // Phase 1 passive guard: a customer-facing ORDER notification must belong to the order
      // owner. We still SEND to non-owners here (store/admin/driver clients may rely on it
      // today), but log it so the residual role-leak stays observable until Phase 2 re-types
      // those audiences off the customer ORDER contract.
      if (recipientId !== order.userId) {
        this.logger.warn(
          `ORDER notification to non-owner: orderId=${order.id} ownerId=${order.userId} ` +
            `recipientId=${recipientId} status=${status} context=changeStatus`,
        );
      }
      await this.notificationService.sendLocalizedNotification(
        recipientId,
        title,
        body,
        { resourceId: `${order.id}` },
        NotificationType.ORDER,
        order.id,
      );
    }

    // Fallback: assign a driver at READY_PICKUP if none is assigned yet. Skipped
    // while a PREPARING-triggered AUTO-mode delay (assignmentReadyAt) is still in
    // the future — the cron in AssignmentTimerService owns that window and this
    // fallback would otherwise defeat the intentional 8-minute wait by assigning
    // early whenever the store races through to READY_PICKUP quickly. If
    // assignmentReadyAt is null (e.g. MANUAL mode was active at acceptance time)
    // or already past, this still fires as the safety net it always was.
    const stillWaitingForScheduledAutoAssign =
      (order as any).assignmentReadyAt &&
      (order as any).assignmentReadyAt > new Date();
    if (
      status === OrderStatus.READY_PICKUP &&
      !order.deliveryId &&
      order.type !== OrderType.PICKUP &&
      !stillWaitingForScheduledAutoAssign
    ) {
      await this.assignmentService.handleOrderAssignment(order.id);
    }

    // Apply a deferred AFK break once the driver finishes their last active trip.
    if (status === OrderStatus.DELIVERED && order.deliveryId) {
      const deliveryId = order.deliveryId;
      if (await this.afkBreakService.hasPending(deliveryId)) {
        const remainingActive = await this.prisma.order.count({
          where: {
            deliveryId,
            id: { not: order.id },
            status: {
              in: [
                OrderStatus.PREPARING,
                OrderStatus.READY_PICKUP,
                OrderStatus.ON_THE_WAY,
              ],
            },
          },
        });

        if (remainingActive === 0) {
          const driver = await this.prisma.user.findUnique({
            where: { id: deliveryId },
            select: { name: true },
          });
          await this.applyAfkBreakNow(deliveryId, driver?.name ?? '');
          await this.afkBreakService.clearPending(deliveryId);
        }
      }
    }
  }

  async unassignDelegate(id: number, user: CurrentUser) {
    const order = await this.helpers.getOrderById(id);
    await this.helpers.canUserAccessOrderId(user, order);

    await this.prisma.$transaction(async (tx) => {
      // 1. Remove the driver and put the order back in the state it was in right
      // before acceptOrderAssignment() flipped READY_PICKUP -> ON_THE_WAY (true for
      // both DELIVERY and CUSTOM_DELIVERY, since both go through that same transition).
      await tx.order.update({
        where: { id },
        data: {
          deliveryId: null,
          status: OrderStatus.READY_PICKUP,
        },
      });

      // 2. Cancel any pending assignments
      await tx.orderDeliveryAssignment.updateMany({
        where: {
          orderId: id,
          status: AssignmentStatus.PENDING,
        },
        data: {
          status: AssignmentStatus.REJECTED,
          respondedAt: new Date(),
        },
      });
    });

    return { success: true };
  }
  async getOrderStatusCount(filters: OrderStatusCountFilterDTO) {
    const languages = await this.languages.getCashedLanguages();
    const count = await this.prisma.order.groupBy({
      by: ['status'],
      ...getOrderStatusCountFilterArgs(filters, languages),
    });
    return count;
  }
  private async calculateBestSeller(serviceId: Id) {
    if (!serviceId) return;
    await this.prisma.service.update({
      where: {
        id: serviceId,
      },
      data: {
        totalOrders: {
          increment: 1,
        },
      },
    });
    const best10 = await this.prisma.service.findMany({
      where: { available: true, status: 'ACTIVE' },
      orderBy: { totalOrders: 'desc' },
      take: 10,
    });
    await this.prisma.service.updateMany({
      where: {
        mostSeller: true,
      },
      data: {
        mostSeller: false,
      },
    });
    for (let i = 0; i < best10.length; i += 1) {
      await this.prisma.service.update({
        where: {
          id: best10[i].id,
        },
        data: {
          mostSeller: true,
        },
      });
    }
  }
  async assign(body: AssignOrderDTO) {
    // Don't assign anything to a driver who is currently serving a forced AFK break.
    if (await this.afkBreakService.isOnBreak(body.specialistId)) {
      const breakUntil = await this.afkBreakService.getBreakUntil(
        body.specialistId,
      );
      // Egypt wall-clock (server runs UTC); raw getHours() would be off by the Cairo offset.
      const until = breakUntil ? formatEgypt(breakUntil) : '';
      throw new BadRequestException(`Driver is on a break until ${until}`);
    }

    const succeeded: number[] = [];
    const failed: Array<{ orderId: number; reason: string }> = [];

    const single = body.orderIds.length === 1;
    for (const orderId of body.orderIds) {
      try {
        const order = await this.helpers.getOrderById(orderId);
        if (order.type === OrderType.PICKUP) {
          throw new BadRequestException('Order type is pickup');
        }
        // Manual assignment usually goes to deliveryId in this module's context
        // If AssignOrderDTO has specialistId, we treat it as delivery person for this context
        await this.assignmentService.createAssignment(
          order.id,
          body.specialistId,
          { notify: single },
        );
        succeeded.push(orderId);
      } catch (error) {
        failed.push({ orderId, reason: error?.message ?? 'Assignment failed' });
      }
    }

    // Bulk requests suppress the per-order push (notify: single). Make sure the
    // driver is still notified when a bulk request ends up assigning exactly one
    // order (the rest failed): send the normal single-order push for it.
    if (!single && succeeded.length === 1) {
      await this.notificationService.sendLocalizedNotification(
        body.specialistId,
        { ar: 'طلب جديد', en: 'New Order' },
        {
          ar: 'لديك طلب جديد في انتظار القبول',
          en: 'You have a new order waiting for acceptance',
        },
        { resourceId: `${succeeded[0]}`, type: 'NEW_ORDER_ASSIGNMENT' },
      );
    } else if (succeeded.length > 1) {
      const count = succeeded.length;
      await this.notificationService.sendLocalizedNotification(
        body.specialistId,
        { ar: 'طلبات جديدة', en: 'New Orders' },
        {
          ar: `لديك ${count} طلبات جديدة في انتظار القبول`,
          en: `You have ${count} new orders`,
        },
        { type: 'NEW_ORDERS_BATCH', count: `${count}` },
      );
    }

    return { succeeded, failed };
  }

  async orderStatistics(filters: FilterStoreWalletDTO) {
    const args = getOrderStatisticsArgs(filters);
    const allOrdersPromise = await this.prisma.order.count({
      where: args.where,
    });
    const statusPromises = Object.values(OrderStatus).map(
      async (status) =>
        await this.prisma.order.count({
          where: {
            ...args.where,
            status,
          },
        }),
    );
    const [allOrders, ...statusCounts] = await Promise.all([
      allOrdersPromise,
      ...statusPromises,
    ]);

    const statusResults = Object.fromEntries(
      Object.keys(OrderStatus).map((key, index) => [key, statusCounts[index]]),
    );
    return {
      allOrders,
      ...statusResults,
    };
  }

  async paymentOrder(id: Id, body: PaymentDetailDTO) {
    const order = await this.helpers.getOrderById(id);
    if (order.paymentStatus === PaymentStatus.PAID) {
      throw new BadRequestException('Order is already paid');
    }
    const isFound = await this.paymentService.getPaymentDetails(
      body.paymentId,
      (order as any).totalPriceAfterDiscount,
    );
    if (!isFound.status) {
      await this.prisma.order.update({
        where: {
          id: id,
        },
        data: {
          paymentStatus: PaymentStatus.FAILED,
        },
      });
      throw new BadRequestException(isFound.message);
    }
    await this.prisma.order.update({
      where: {
        id: id,
      },
      data: {
        status: OrderStatus.PENDING,
        paymentStatus: PaymentStatus.PAID,
      },
    });

    // Branch/admin earnings are recognized once, at DELIVERED, via
    // distributeEarnings() — crediting them here too double-counted every order
    // paid through this gateway path. Omitting branchId/adminCommission below
    // keeps this a customer-only ledger entry (payment received).
    await this.transactionService.createTransaction({
      userId: order.Customer.id,
      referenceId: order.id,
      type: TransactionType.ORDER_CREATED,
      balance: (order as any).totalPriceAfterDiscount,
    });
  }

  async handleKashierSuccess(orderId: number) {
    const order = await this.helpers.getOrderById(orderId);
    if (order.paymentStatus === PaymentStatus.PAID) {
      return order;
    }

    const updatedOrder = await this.prisma.order.update({
      where: { id: orderId },
      data: {
        status:
          order.type === OrderType.CUSTOM_DELIVERY
            ? OrderStatus.READY_PICKUP
            : OrderStatus.PENDING,
        paymentStatus: PaymentStatus.PAID,
      },
    });

    // See paymentOrder() above — branch/admin earnings are recognized once, at
    // DELIVERED, via distributeEarnings(); crediting them here as well
    // double-counted every order paid through this gateway path.
    await this.transactionService.createTransaction({
      userId: order.userId,
      referenceId: order.id,
      type: TransactionType.ORDER_CREATED,
      balance: (order as any).totalPriceAfterDiscount,
    });

    return updatedOrder;
  }

  // zoneId is mandatory on every stop, but lat/lng are optional — a stop with
  // no map pin gets its zone's centroid as a stand-in location, exactly like
  // Online delivery already does (ZoneService.getZoneCentroid). Everything
  // downstream (geofence coverage, pricing, station rows, Order.pickupLat/
  // deliveryLat) keeps working unmodified because every stop always has a
  // concrete lat/lng by the time it reaches them.
  private async resolveStopCoordinates<
    T extends { lat?: number; lng?: number; zoneId: Id },
  >(stops: T[]): Promise<(T & { lat: number; lng: number })[]> {
    return Promise.all(
      stops.map(async (stop) => {
        if (stop.lat != null && stop.lng != null) {
          return stop as T & { lat: number; lng: number };
        }
        const centroid = await this.zoneService.getZoneCentroid(stop.zoneId);
        return { ...stop, lat: centroid.lat, lng: centroid.lng };
      }),
    );
  }

  async calculateCustomDeliveryOrder(data: CalculateCustomDeliveryOrderDTO) {
    const { customDeliveryEnabled } = await this.settingService.getSettings([
      'customDeliveryEnabled',
    ]);
    // getSettings() converts BOOLEAN-type settings to a real JS boolean, not the
    // string 'false' — comparing against the string here meant this check could
    // never fire, so the toggle silently never blocked anything.
    if (customDeliveryEnabled === false) {
      throw new BadRequestException('خدمة المندوب الخاص مغلقة حالياً');
    }

    const stops = await this.resolveStopCoordinates(data.stops);
    const { estimatedItemsCost } = data;

    if (data.cityId) {
      for (const stop of stops) {
        if (stop.lat != null && stop.lng != null) {
          await this.helpers.validateCityCoverage(
            data.cityId,
            stop.lat,
            stop.lng,
          );
        }
      }
    }

    const outsideIndex =
      await this.zoneService.firstPointOutsideActiveZones(stops);
    if (outsideIndex !== -1) {
      throw new BadRequestException(
        this.outsideServiceZoneMessage(outsideIndex, stops.length),
      );
    }

    // Calculate delivery price across all stops (sum of all segments)
    const deliveryPrice = await this.helpers.getCustomDeliveryPrice(stops);

    // Items cost = sum of per-station estimates. Fall back to the order-level
    // estimatedItemsCost when stations carry no per-station cost.
    const stationsCost = stops.reduce(
      (sum, s) => sum + (s.estimatedCost ?? 0),
      0,
    );
    const itemsCost =
      stationsCost > 0 ? stationsCost : (estimatedItemsCost ?? 0);

    // Custom delivery's own commission, applied ONCE on the estimated items cost
    // (excludes delivery) — independent of the store-order global commission settings.
    // Kept in the `globalCommission` response field for API/frontend compatibility.
    const globalCommission =
      await this.helpers.getCustomDeliveryCommission(itemsCost);

    // Extra-stop fee (beyond the first two stops) — the driver's money, not
    // admin revenue: it's compensation for physically handling the extra
    // stop(s), so it's added to `shipping` (which distributeEarnings credits
    // 100% to the driver), not to adminCommission.
    const settings = await this.settingService.getSettings([
      'customDeliveryExtraStopPrice',
    ]);
    const extraStopsCount = Math.max(0, stops.length - 2);
    const extraStopPrice = Number(settings.customDeliveryExtraStopPrice) || 0;
    const extraStopFee = extraStopsCount * extraStopPrice;

    // Custom delivery has no store, so no store commission.
    const adminCommission = globalCommission;

    let adjustedBaseShipping = deliveryPrice;
    let rewardId: Id | undefined;
    let freeDelivery = false;

    if (data.fortuneRewardId) {
      if (!data.userId) {
        throw new BadRequestException('Login required to apply a reward');
      }

      const reward = await this.helpers.verifyCustomDeliveryReward(
        data.fortuneRewardId,
        data.userId,
        itemsCost,
        deliveryPrice,
      );
      rewardId = reward.rewardId;
      freeDelivery = true;
      adjustedBaseShipping = 0;
    }

    const deliveryDiscount = deliveryPrice - adjustedBaseShipping;
    // A free-delivery reward discounts the customer's base delivery fee only —
    // it never eliminates the driver's earned extra-stop compensation.
    const shipping = adjustedBaseShipping + extraStopFee;

    // Calculate total
    const total = itemsCost + adminCommission + shipping + (data.tip ?? 0);

    return {
      stops,
      estimatedItemsCost: Number(itemsCost.toFixed(2)),
      globalCommission: Number(globalCommission.toFixed(2)),
      extraStopFee: Number(extraStopFee.toFixed(2)),
      adminCommission: Number(adminCommission.toFixed(2)),
      shipping: Number(shipping.toFixed(2)),
      tip: Number((data.tip ?? 0).toFixed(2)),
      rewardId,
      freeDelivery,
      deliveryDiscount: Number(deliveryDiscount.toFixed(2)),
      total: Number(total.toFixed(2)),
    };
  }

  // Persists one unconsumed OrderStationImage row per uploaded file path (owned by
  // the uploader, stationId null) and returns their ids. The physical files are
  // made permanent by the success response; an abandoned upload's rows are reaped
  // by OrderCronService.cleanupOrphanStationImages. Rows are created BEFORE the
  // success response, so a failure here throws and the uploaded temp files are
  // cleaned up by the global exception filter (no permanent files without rows).
  async createStationImageUploads(
    userId: number,
    images: string[],
  ): Promise<number[]> {
    if (!images?.length) {
      throw new BadRequestException('لم يتم إرفاق أي صورة');
    }
    const created = await this.prisma.$transaction(
      images.map((image) =>
        this.prisma.orderStationImage.create({
          data: { userId, image },
          select: { id: true },
        }),
      ),
    );
    return created.map((row) => row.id);
  }

  // Validates and attaches each stop's imageIds onto its station. Ownership,
  // existence and single-use are enforced atomically by the `userId` +
  // `stationId: null` predicate on updateMany: an id that is foreign, missing or
  // already consumed simply isn't matched, so a short count means an invalid id.
  // Throws on any violation so the surrounding order transaction rolls back.
  private async consumeStationImages(
    tx: Prisma.TransactionClient,
    userId: number,
    stops: { imageIds?: number[] }[],
    stations: { id: number; sequence: number }[],
  ): Promise<void> {
    const allIds = stops.flatMap((s) => s.imageIds ?? []);
    if (allIds.length === 0) return;

    if (new Set(allIds).size !== allIds.length) {
      throw new BadRequestException('لا يمكن استخدام نفس الصورة أكثر من مرة');
    }
    if (allIds.length > 20) {
      throw new BadRequestException(
        'لا يمكن إرفاق أكثر من 20 صورة للطلب الواحد',
      );
    }

    const stationIdBySequence = new Map(
      stations.map((s) => [s.sequence, s.id]),
    );

    for (let idx = 0; idx < stops.length; idx++) {
      const ids = stops[idx].imageIds ?? [];
      if (ids.length === 0) continue;
      if (ids.length > 5) {
        throw new BadRequestException('لا يمكن إرفاق أكثر من 5 صور لكل محطة');
      }
      const stationId = stationIdBySequence.get(idx + 1);
      const { count } = await tx.orderStationImage.updateMany({
        where: { id: { in: ids }, userId, stationId: null },
        data: { stationId },
      });
      if (count !== ids.length) {
        throw new BadRequestException('بعض الصور غير صالحة أو مستخدمة من قبل');
      }
    }
  }

  private outsideServiceZoneMessage(index: number, total: number): string {
    if (index === 0) {
      return 'Pickup location is outside our service zones';
    }
    if (index === total - 1) {
      return 'Delivery destination is outside our service zones';
    }
    const stopNumber = index + 1;
    return `*${stopNumber}*0Stop is outside our service zones0`;
  }

  async createCustomDeliveryOrder(data: CreateCustomDeliveryOrderDTO) {
    return this.withUserOrderLock(data.userId, () =>
      this.createCustomDeliveryOrderInternal(data),
    );
  }

  private async createCustomDeliveryOrderInternal(
    data: CreateCustomDeliveryOrderDTO,
  ) {
    const { customDeliveryEnabled } = await this.settingService.getSettings([
      'customDeliveryEnabled',
    ]);
    // getSettings() converts BOOLEAN-type settings to a real JS boolean, not the
    // string 'false' — comparing against the string here meant this check could
    // never fire, so the toggle silently never blocked anything.
    if (customDeliveryEnabled === false) {
      throw new BadRequestException('خدمة المندوب الخاص مغلقة حالياً');
    }

    if (data.paymentMethod === PaymentMethod.WALLET && !data.paidWithWallet) {
      if (!data.transferImage) {
        throw new BadRequestException('صورة إيصال التحويل مطلوبة لإتمام الطلب');
      }
      // transferType (Vodafone Cash / InstaPay / Bank Transfer) is no longer
      // required from the customer — only BANK_TRANSFER (an explicit IBAN
      // transfer) still needs its own field; every other case just needs the
      // phone number the transfer was made from, regardless of which wallet
      // provider was actually used.
      if (data.transferType === TransferType.BANK_TRANSFER) {
        if (!data.transferAccountNumber) {
          throw new BadRequestException('رقم الحساب البنكي أو الآيبان مطلوب');
        }
      } else {
        if (!data.transferNumber) {
          throw new BadRequestException(
            'رقم الهاتف الذي قمت بالتحويل منه مطلوب',
          );
        }
        const egyptianPhoneRegex = /^01[0125][0-9]{8}$/;
        if (!egyptianPhoneRegex.test(data.transferNumber)) {
          throw new BadRequestException(
            'رقم الهاتف غير صالح. يجب أن يكون رقم جوال مصري صحيح مكون من 11 رقماً ويبدأ بـ 010 أو 011 أو 012 أو 015',
          );
        }
      }
    }
    const { userId } = data;
    const stops = await this.resolveStopCoordinates(data.stops);

    // First stop = pickup, last stop = final delivery
    const pickupStop = stops[0];
    const deliveryStop = stops[stops.length - 1];

    // Coverage gate: every stop — pickup, drop-off and each intermediate station —
    // must fall inside an active service zone (points may live in different zones).
    // Enforced before any DB write so an out-of-area request (e.g. a point in
    // another country) never creates a partial order or its station rows.
    const outsideIndex =
      await this.zoneService.firstPointOutsideActiveZones(stops);
    if (outsideIndex !== -1) {
      throw new BadRequestException(
        this.outsideServiceZoneMessage(outsideIndex, stops.length),
      );
    }

    // Resolve the delivery-destination zone from the final stop. Coverage is
    // guaranteed above, so this now always resolves to a concrete zone.
    const zoneId = await this.zoneService.resolveZoneId(
      deliveryStop?.lat,
      deliveryStop?.lng,
    );

    // Calculate pricing
    const calc = await this.calculateCustomDeliveryOrder(data);
    const {
      estimatedItemsCost,
      globalCommission,
      extraStopFee,
      adminCommission,
      shipping,
      total,
      rewardId,
      freeDelivery,
      deliveryDiscount,
    } = calc;

    // Pre-check wallet balance before starting transaction
    if (data.paidWithWallet) {
      await this.walletService.checkWalletBalance(userId, total);
    }

    // Idempotency check: prevent duplicate orders within a short time (20 seconds)
    const recentOrder = await this.prisma.order.findFirst({
      where: {
        userId,
        type: OrderType.CUSTOM_DELIVERY,
        customDeliveryKind: data.kind ?? CustomDeliveryKind.PURCHASE,
        createdAt: { gte: new Date(Date.now() - 20 * 1000) },
        pickupLat: pickupStop.lat,
        pickupLng: pickupStop.lng,
        deliveryLat: deliveryStop.lat,
        deliveryLng: deliveryStop.lng,
        totalPriceAfterDiscount: total,
      },
    });

    if (recentOrder) {
      // Known edge case: a near-simultaneous *distinct* request that happens to
      // match this idempotency key (same coords + total within 20s) returns the
      // earlier order without consuming any imageIds it carried — those upload
      // rows stay unconsumed (stationId null) and are reaped by
      // OrderCronService.cleanupOrphanStationImages. We intentionally do not widen
      // the idempotency key to preserve its existing semantics; true double-submits
      // (same images) are unaffected.
      return recentOrder;
    }

    const { order, invoice } = await this.prisma.$transaction(async (tx) => {
      // Deduct wallet balance if paying with wallet
      if (data.paidWithWallet) {
        await this.walletService.deductUserBalance(userId, total, tx);
      }

      const order = await tx.order.create({
        data: {
          tip: data.tip ?? 0,
          price: estimatedItemsCost,
          totalPriceAfterDiscount: total,
          discountAmount: 0,
          adminCommission: adminCommission,
          globalCommission: globalCommission,
          storeCommission: 0,
          shipping: shipping,
          tax: 0,
          userId,
          status: OrderStatus.READY_PICKUP,
          branchId: null,
          zoneId,
          type: OrderType.CUSTOM_DELIVERY,
          customDeliveryKind: data.kind ?? CustomDeliveryKind.PURCHASE,
          paidWithWallet: data.paidWithWallet || false,
          isGift: data.isGift ?? false,
          paymentStatus:
            data.paidWithWallet || data.paymentMethod === PaymentMethod.WALLET
              ? PaymentStatus.PAID
              : PaymentStatus.UNPAID,
          paymentMethod: data.paymentMethod,
          transferNumber: data.transferNumber,
          transferImage: data.transferImage,
          transferType: data.transferType,
          transferAccountNumber: data.transferAccountNumber,
          note: data.note,
          // Store first and last stop as the primary pickup/delivery coords
          pickupLat: pickupStop.lat,
          pickupLng: pickupStop.lng,
          deliveryLat: deliveryStop.lat,
          deliveryLng: deliveryStop.lng,
          itemsDescription: data.itemsDescription,
          estimatedItemsCost: estimatedItemsCost,
          driverInstructions: data.driverInstructions,
          invoice: {}, // Initial empty invoice
          // Persist each stop as a station row (1-based, last = DROPOFF). All
          // start WAITING; the first moves to GOING when a driver accepts.
          Stations: {
            create: stops.map((s, idx) => ({
              sequence: idx + 1,
              type:
                idx === stops.length - 1
                  ? StationType.DROPOFF
                  : StationType.PICKUP,
              name: s.name ?? s.label ?? null,
              lat: s.lat,
              lng: s.lng,
              purchaseList: s.purchaseList ?? null,
              estimatedCost: s.estimatedCost ?? 0,
              notes: s.notes ?? null,
              status: StationStatus.WAITING,
              zoneId: s.zoneId ?? null,
            })),
          },
        },
      });

      if (rewardId) {
        await this.helpers.consumeFortuneReward(tx, rewardId, userId, order.id);
      }

      // Attach any per-stop images to their station. Stations are fetched
      // separately (not via an `include` on the create) so the order returned to
      // the client keeps its original shape — no partial Stations leak into the
      // response, and it matches the idempotency early-return shape. Mapping is by
      // `sequence`, which equals each stop's 1-based index. Skipped when no images.
      if (stops.some((s) => s.imageIds?.length)) {
        const stations = await tx.orderStation.findMany({
          where: { orderId: order.id },
          select: { id: true, sequence: true },
        });
        await this.consumeStationImages(tx, userId, stops, stations);
      }

      const invoice = {
        orderId: order.id,
        customer: userId,
        orderType: OrderType.CUSTOM_DELIVERY,
        customDelivery: {
          // Full ordered list of stops (pickup → waypoints → delivery)
          stops: stops.map((s, idx) => ({
            order: idx + 1,
            type:
              idx === stops.length - 1
                ? StationType.DROPOFF
                : StationType.PICKUP,
            lat: s.lat,
            lng: s.lng,
            label: s.label ?? null,
            name: s.name ?? null,
            purchaseList: s.purchaseList ?? null,
            estimatedCost: s.estimatedCost ?? 0,
            notes: s.notes ?? null,
            imageIds: s.imageIds ?? [],
          })),
          itemsDescription: data.itemsDescription,
          // Summed per-station value actually charged (matches the column +
          // summary); data.estimatedItemsCost is empty on the per-station flow.
          estimatedItemsCost: estimatedItemsCost,
          driverInstructions: data.driverInstructions,
        },
        summary: {
          estimatedItemsCost,
          globalCommission,
          extraStopFee,
          commission: adminCommission,
          shipping,
          rewardId,
          freeDelivery,
          deliveryDiscount,
          total,
        },
        paymentMethod: data.paymentMethod,
        date: new Date(),
      };

      // If paid with wallet, create transaction records
      if (data.paidWithWallet) {
        await this.transactionService.createTransactionWithinTx(
          {
            userId,
            branchId: 1, // Default branch
            referenceId: order.id,
            type: TransactionType.ORDER_CREATED,
            balance: total,
            adminCommission: adminCommission,
          },
          tx,
        );
      }

      return { invoice, order };
    });
    await this.prisma.order.update({
      where: { id: order.id },
      data: { invoice },
    });

    await this.assignmentService.handleOrderAssignment(order.id);

    return order;
  }

  async getOnlineSellerProfile(userId: number) {
    return this.prisma.onlineSellerProfile.findUnique({ where: { userId } });
  }

  // Resolves sender name/phone/pickup zone either from the request body (and, if
  // `isOnlineSeller` is set, saves them as this user's profile for next time) or,
  // when the body omits them, from a previously-saved OnlineSellerProfile — this
  // is what lets a seller's "طلب جديد +" follow-up orders skip retyping sender info.
  private async resolveOnlineSender(
    data: {
      isOnlineSeller?: boolean;
      senderName?: string;
      senderPhone?: string;
      pickupZoneId?: Id;
    },
    userId: number,
  ): Promise<{ senderName: string; senderPhone: string; pickupZoneId: Id }> {
    if (data.senderName && data.senderPhone && data.pickupZoneId) {
      if (data.isOnlineSeller) {
        await this.prisma.onlineSellerProfile.upsert({
          where: { userId },
          update: {
            senderName: data.senderName,
            senderPhone: data.senderPhone,
            pickupZoneId: data.pickupZoneId,
          },
          create: {
            userId,
            senderName: data.senderName,
            senderPhone: data.senderPhone,
            pickupZoneId: data.pickupZoneId,
          },
        });
      }
      return {
        senderName: data.senderName,
        senderPhone: data.senderPhone,
        pickupZoneId: data.pickupZoneId,
      };
    }

    const profile = await this.prisma.onlineSellerProfile.findUnique({
      where: { userId },
    });
    if (!profile?.pickupZoneId) {
      throw new BadRequestException(
        'بيانات المرسل (الاسم والهاتف ومنطقة الاستلام) مطلوبة',
      );
    }
    return {
      senderName: profile.senderName,
      senderPhone: profile.senderPhone,
      pickupZoneId: profile.pickupZoneId,
    };
  }

  // Per-recipient shipping fee: the recipient's zone price if an admin set one;
  // else, if BOTH the sender and the first recipient dropped a real map pin,
  // the actual distance between them (same km formula as purchase/restaurant);
  // else the flat onlineRepresentativeBaseFee. A zone centroid substitute never
  // counts as a "real pin" here — only genuine client-provided coordinates
  // trigger distance pricing, so an unpinned order always gets the flat rate
  // rather than a distance guessed from two zone centroids. Shared by
  // calculate/create so preview and creation can never disagree.
  private async priceOnlineRecipients(
    pickup: { lat?: number; lng?: number },
    recipients: {
      deliveryZoneId: Id;
      lat?: number;
      lng?: number;
      packagingRequested?: boolean;
    }[],
    settings: {
      onlineDeliveryCommission: any;
      packagingFee: any;
      onlineRepresentativeBaseFee: any;
      onlineRepresentativeExtraStopPrice: any;
      customDeliveryKMCharge: any;
      customDeliveryBaseFee: any;
    },
  ) {
    const baseFee = Number(settings.onlineRepresentativeBaseFee) || 0;
    const extraStopPrice = Number(settings.onlineRepresentativeExtraStopPrice) || 0;
    const perRecipientCommission =
      Number(settings.onlineDeliveryCommission) || 0;
    const packagingFeeSetting = Number(settings.packagingFee) || 0;

    const firstRecipient = recipients[0];
    const zonePrice = firstRecipient
      ? await this.zoneService.getZoneDeliveryPrice(firstRecipient.deliveryZoneId)
      : null;

    let baseDeliveryPrice: number;
    if (zonePrice != null) {
      baseDeliveryPrice = zonePrice;
    } else if (
      pickup.lat != null &&
      pickup.lng != null &&
      firstRecipient?.lat != null &&
      firstRecipient?.lng != null
    ) {
      let distance = 0;
      try {
        const details = await this.mapService.getBatchDetails(
          pickup.lat,
          pickup.lng,
          [{ lat: firstRecipient.lat, lng: firstRecipient.lng }],
        );
        if (details[0]?.distance !== undefined) {
          distance = details[0].distance;
        } else {
          distance =
            calculateDistance(
              pickup.lat,
              pickup.lng,
              firstRecipient.lat,
              firstRecipient.lng,
            ) / 1000;
        }
      } catch (e) {
        distance =
          calculateDistance(
            pickup.lat,
            pickup.lng,
            firstRecipient.lat,
            firstRecipient.lng,
          ) / 1000;
      }
      const kmCharge = Number(settings.customDeliveryKMCharge) || 10;
      const kmBaseFee = Number(settings.customDeliveryBaseFee) || 0;
      baseDeliveryPrice = distance * kmCharge + kmBaseFee;
    } else {
      baseDeliveryPrice = baseFee;
    }

    const extraStopsCount = Math.max(0, recipients.length - 1);
    const extraStopFee = extraStopsCount * extraStopPrice;
    const shipping = baseDeliveryPrice + extraStopFee;

    let packagingFee = 0;
    for (const recipient of recipients) {
      if (recipient.packagingRequested) packagingFee += packagingFeeSetting;
    }
    const globalCommission = perRecipientCommission;
    return { shipping, packagingFee, globalCommission, extraStopFee };
  }

  async calculateOnlineDeliveryOrder(data: CalculateOnlineDeliveryOrderDTO) {
    const { onlineDeliveryEnabled } = await this.settingService.getSettings([
      'onlineDeliveryEnabled',
    ]);
    if (onlineDeliveryEnabled === false) {
      throw new BadRequestException(
        'خدمة توصيل البائعين الأونلاين مغلقة حالياً',
      );
    }
    if (!data.recipients?.length) {
      throw new BadRequestException('يجب إضافة طلب واحد على الأقل');
    }

    const settings = await this.settingService.getSettings([
      'onlineDeliveryBaseFee',
      'onlineDeliveryCommission',
      'packagingFee',
      'onlineDeliveryPackagingEnabled',
      'onlineRepresentativeBaseFee',
      'onlineRepresentativeExtraStopPrice',
      'customDeliveryKMCharge',
      'customDeliveryBaseFee',
    ]);
    if (
      settings.onlineDeliveryPackagingEnabled === false &&
      data.recipients.some((r) => r.packagingRequested)
    ) {
      throw new BadRequestException('خدمة التغليف غير متاحة حالياً');
    }
    const { shipping, packagingFee, globalCommission, extraStopFee } =
      await this.priceOnlineRecipients(
        { lat: data.pickupLat, lng: data.pickupLng },
        data.recipients,
        settings,
      );
    // extraStopFee is already folded into `shipping` above (the driver's
    // money, matching the purchase/restaurant custom-delivery convention) —
    // it must NOT be added again here, or the customer is charged for it
    // twice and the total no longer matches what's actually paid out.
    const adminCommission = globalCommission + packagingFee;
    const tip = data.tip ?? 0;
    const total = shipping + adminCommission + tip;

    return {
      shipping: Number(shipping.toFixed(2)),
      globalCommission: Number(globalCommission.toFixed(2)),
      packagingFee: Number(packagingFee.toFixed(2)),
      extraStopFee: Number(extraStopFee.toFixed(2)),
      adminCommission: Number(adminCommission.toFixed(2)),
      tip: Number(tip.toFixed(2)),
      total: Number(total.toFixed(2)),
    };
  }

  async createOnlineDeliveryOrder(data: CreateOnlineDeliveryOrderDTO) {
    return this.withUserOrderLock(data.userId, () =>
      this.createOnlineDeliveryOrderInternal(data),
    );
  }

  private async createOnlineDeliveryOrderInternal(
    data: CreateOnlineDeliveryOrderDTO,
  ) {
    const { onlineDeliveryEnabled } = await this.settingService.getSettings([
      'onlineDeliveryEnabled',
    ]);
    if (onlineDeliveryEnabled === false) {
      throw new BadRequestException(
        'خدمة توصيل البائعين الأونلاين مغلقة حالياً',
      );
    }
    if (!data.recipients?.length) {
      throw new BadRequestException('يجب إضافة طلب واحد على الأقل');
    }

    const { userId } = data;
    const recipients = data.recipients.map((r) => ({
      ...r,
      itemsDescription: r.itemsDescription ?? r.orderDescription,
      estimatedCost: r.estimatedCost ?? r.orderValue,
      collectionAmount: r.collectionAmount ?? r.cashCollection,
      packagingRequested: r.packagingRequested ?? r.packaging,
    }));
    const sender = await this.resolveOnlineSender(data, userId);

    // The map pin is optional here — zone dropdowns cover the case where the
    // sender/recipient skips it. When a real lat/lng is given it's used as-is
    // (and is what makes distance-based pricing kick in above); otherwise we
    // resolve the zone to a representative centroid so the existing lat/lng-
    // based assignment/geofence machinery keeps working unchanged.
    const [pickupPoint, ...deliveryPoints] = await Promise.all([
      data.pickupLat != null && data.pickupLng != null
        ? Promise.resolve({ lat: data.pickupLat, lng: data.pickupLng })
        : this.zoneService.getZoneCentroid(sender.pickupZoneId),
      ...recipients.map((r) =>
        r.lat != null && r.lng != null
          ? Promise.resolve({ lat: r.lat, lng: r.lng })
          : this.zoneService.getZoneCentroid(r.deliveryZoneId),
      ),
    ]);

    const calc = await this.calculateOnlineDeliveryOrder({
      ...data,
      recipients,
    });
    const {
      shipping,
      globalCommission,
      packagingFee,
      extraStopFee,
      adminCommission,
      tip,
      total,
    } = calc;

    if (data.paidWithWallet) {
      await this.walletService.checkWalletBalance(userId, total);
    }

    // Idempotency check: prevent duplicate orders within a short time (20 seconds),
    // mirroring the same guard on the purchase custom-delivery flow. Recipient
    // count + total stand in for matching the exact batch content (a batch is
    // now multi-recipient, so there's no single recipientPhone/zoneId to match).
    const recentOrder = await this.prisma.order.findFirst({
      where: {
        userId,
        type: OrderType.CUSTOM_DELIVERY,
        customDeliveryKind: CustomDeliveryKind.ONLINE,
        createdAt: { gte: new Date(Date.now() - 20 * 1000) },
        totalPriceAfterDiscount: total,
        Stations: {
          some: { type: StationType.PICKUP, zoneId: sender.pickupZoneId },
        },
      },
    });
    if (recentOrder) {
      return recentOrder;
    }

    // Last recipient's zone stands in for the order's overall delivery zone
    // (city filtering etc.) — same convention purchase custom-delivery uses
    // (resolves from the final stop).
    const lastZoneId = recipients[recipients.length - 1].deliveryZoneId;

    const { order, invoice } = await this.prisma.$transaction(async (tx) => {
      if (data.paidWithWallet) {
        await this.walletService.deductUserBalance(userId, total, tx);
      }

      const order = await tx.order.create({
        data: {
          tip,
          price: shipping,
          totalPriceAfterDiscount: total,
          discountAmount: 0,
          adminCommission,
          globalCommission,
          storeCommission: 0,
          shipping,
          tax: 0,
          userId,
          status: OrderStatus.READY_PICKUP,
          branchId: null,
          zoneId: lastZoneId,
          type: OrderType.CUSTOM_DELIVERY,
          customDeliveryKind: CustomDeliveryKind.ONLINE,
          paidWithWallet: data.paidWithWallet || false,
          paymentStatus:
            data.paidWithWallet || data.paymentMethod === PaymentMethod.WALLET
              ? PaymentStatus.PAID
              : PaymentStatus.UNPAID,
          paymentMethod: data.paymentMethod,
          note: data.note,
          pickupLat: pickupPoint.lat,
          pickupLng: pickupPoint.lng,
          deliveryLat: deliveryPoints[deliveryPoints.length - 1].lat,
          deliveryLng: deliveryPoints[deliveryPoints.length - 1].lng,
          packagingFee,
          invoice: {},
          Stations: {
            create: [
              {
                sequence: 1,
                type: StationType.PICKUP,
                name: sender.senderName,
                contactPhone: sender.senderPhone,
                lat: pickupPoint.lat,
                lng: pickupPoint.lng,
                status: StationStatus.WAITING,
                zoneId: sender.pickupZoneId,
              },
              ...recipients.map((r, i) => ({
                sequence: i + 2,
                type: StationType.DROPOFF,
                name: r.recipientName,
                contactPhone: r.recipientPhone,
                lat: deliveryPoints[i].lat,
                lng: deliveryPoints[i].lng,
                purchaseList: r.itemsDescription ?? null,
                estimatedCost: r.estimatedCost ?? 0,
                collectionAmount: r.collectionAmount ?? null,
                addressDetails: r.addressDetails,
                packagingRequested: r.packagingRequested ?? false,
                notes: r.notes ?? null,
                status: StationStatus.WAITING,
                zoneId: r.deliveryZoneId,
              })),
            ],
          },
        },
      });

      // Attach any per-recipient images to their DROPOFF station. Same
      // sequence-based mapping as the purchase/restaurant flow — sequence 1 is
      // the sender's PICKUP stop (no images), sequence i+2 is recipient i.
      if (recipients.some((r) => r.imageIds?.length)) {
        const stations = await tx.orderStation.findMany({
          where: { orderId: order.id },
          select: { id: true, sequence: true },
        });
        await this.consumeStationImages(
          tx,
          userId,
          [{ imageIds: undefined }, ...recipients],
          stations,
        );
      }

      const invoice = {
        orderId: order.id,
        customer: userId,
        orderType: OrderType.CUSTOM_DELIVERY,
        onlineDelivery: {
          sender,
          // Plain-object copies — recipients arrives as DTO class instances,
          // which Prisma's Json input type rejects.
          recipients: recipients.map((r) => ({ ...r })),
        },
        summary: {
          shipping,
          globalCommission,
          packagingFee,
          extraStopFee,
          adminCommission,
          tip,
          total,
        },
        paymentMethod: data.paymentMethod,
        date: new Date(),
      };

      if (data.paidWithWallet) {
        await this.transactionService.createTransactionWithinTx(
          {
            userId,
            branchId: 1, // Default branch
            referenceId: order.id,
            type: TransactionType.ORDER_CREATED,
            balance: total,
            adminCommission,
          },
          tx,
        );
      }

      return { invoice, order };
    });

    await this.prisma.order.update({
      where: { id: order.id },
      data: { invoice },
    });

    await this.assignmentService.handleOrderAssignment(order.id);

    return order;
  }

  async acceptOrderAssignment(orderId: number, deliveryId: number) {
    const assignment = await this.prisma.orderDeliveryAssignment.findFirst({
      where: {
        orderId,
        deliveryId,
        status: AssignmentStatus.PENDING,
      },
    });

    if (!assignment) {
      throw new BadRequestException(
        'No pending assignment found or it has expired',
      );
    }

    if (new Date() > assignment.expiresAt) {
      await this.prisma.orderDeliveryAssignment.update({
        where: { id: assignment.id },
        data: { status: AssignmentStatus.TIMEOUT },
      });
      throw new BadRequestException('Assignment has expired');
    }

    // Assignment search starts in parallel with the store's own accept/reject
    // decision, so the store may have already rejected/cancelled the order by
    // the time the driver responds to their offer — don't let them accept a dead order.
    const terminalStatuses: OrderStatus[] = [
      OrderStatus.REJECTED,
      OrderStatus.CANCELLED,
      OrderStatus.DELIVERED,
    ];
    const currentOrder = await this.prisma.order.findUnique({
      where: { id: orderId },
    });
    if (!currentOrder) {
      throw new BadRequestException('Order not found');
    }
    if (terminalStatuses.includes(currentOrder.status)) {
      throw new BadRequestException('This order is no longer available');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.orderDeliveryAssignment.update({
        where: { id: assignment.id },
        data: {
          status: AssignmentStatus.ACCEPTED,
          respondedAt: new Date(),
        },
      });
      const order = await tx.order.findUnique({
        where: { id: orderId },
      });

      const nextStatus =
        order.status === OrderStatus.READY_PICKUP
          ? OrderStatus.ON_THE_WAY
          : order.status;

      this.logger.log(
        `[geofence-debug] acceptOrderAssignment: orderId=${orderId} deliveryId=${deliveryId} currentOrderStatus=${order.status} -> nextOrderStatus=${nextStatus}`,
      );

      await tx.order.update({
        where: { id: orderId },
        data: {
          deliveryId,
          status: nextStatus,
        },
      });

      // Custom-delivery orders begin their station journey: the first stop
      // becomes the active step the moment a driver takes the order.
      if (order.type === OrderType.CUSTOM_DELIVERY) {
        const firstStation = await tx.orderStation.findFirst({
          where: { orderId },
          orderBy: { sequence: 'asc' },
        });
        if (firstStation && firstStation.status === StationStatus.WAITING) {
          await tx.orderStation.update({
            where: { id: firstStation.id },
            data: { status: StationStatus.GOING },
          });
        }
      }
    });

    return { success: true };
  }

  // --- Custom-delivery station progress (strict sequential) ---

  // Loads a custom-delivery order, asserts the requester is the assigned driver
  // and the order is mid-journey, and returns the order plus its ordered stations.
  private async getCustomDeliveryForProgress(
    orderId: number,
    user: CurrentUser,
  ) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { Stations: { orderBy: { sequence: 'asc' } } },
    });

    if (!order || order.type !== OrderType.CUSTOM_DELIVERY) {
      throw new BadRequestException('Custom delivery order not found');
    }

    const isAssignedDriver =
      user.Role?.roleKey === RolesKeys.DELIVERY && order.deliveryId === user.id;
    if (!isAssignedDriver) {
      throw new ForbiddenException(
        'Only the assigned driver can update this order',
      );
    }

    if (order.status !== OrderStatus.ON_THE_WAY) {
      throw new BadRequestException('Order is not in progress');
    }

    if (!order.Stations.length) {
      throw new BadRequestException('This order has no stations');
    }

    return order;
  }

  private buildStationProgress(
    stations: { sequence: number; status: StationStatus }[],
  ) {
    const totalSteps = stations.length;
    const current = stations.find((s) => s.status !== StationStatus.REACHED);
    const finished = !current;
    return {
      currentStep: finished ? totalSteps : current.sequence,
      totalSteps,
      finished,
    };
  }

  // "Move to next location": complete the active (GOING) station and advance the
  // next one to GOING. Rejected on the final station — that goes through finish().
  // Geofence check for custom-delivery stations (Purchase/Restaurant/Online):
  // the driver's reported position must resolve to the SAME zone as the
  // station they're completing. Reuses resolveZoneId rather than a radius
  // check because a station's stored lat/lng may be a real pin OR a zone
  // centroid substitute (when the customer only picked a zone) — a fixed
  // radius around a centroid would wrongly reject drivers in large zones and
  // wrongly accept ones near an arbitrary centroid in small zones. Checking
  // zone membership works correctly in both cases and is consistent with the
  // same zone-coverage check already enforced at order-creation time.
  private async assertDriverInStationZone(
    lat: number,
    lng: number,
    station: { zoneId: number | null; type: StationType },
  ): Promise<void> {
    if (station.zoneId == null) return;
    const driverZoneId = await this.zoneService.resolveZoneId(lat, lng);
    this.logger.log(
      `[geofence-debug] Custom delivery check: driver=(${lat},${lng}) resolvedZoneId=${driverZoneId} stationZoneId=${station.zoneId}`,
    );
    if (driverZoneId !== station.zoneId) {
      const label =
        station.type === StationType.PICKUP ? 'الاستلام' : 'التسليم';
      this.logger.warn(
        `[geofence-debug] Custom delivery step BLOCKED: driver=(${lat},${lng}) resolvedZoneId=${driverZoneId} stationZoneId=${station.zoneId}`,
      );
      throw new BadRequestException(
        `يجب أن تكون داخل منطقة ${label} لإتمام هذه الخطوة (منطقة المندوب الحالية: ${driverZoneId || 'غير معروفة'} | منطقة المحطة: ${station.zoneId})`,
      );
    }
  }

  async advanceCustomDeliveryStation(
    orderId: number,
    user: CurrentUser,
    lat: number,
    lng: number,
  ) {
    const order = await this.getCustomDeliveryForProgress(orderId, user);
    const stations = order.Stations;

    const current = stations.find((s) => s.status === StationStatus.GOING);
    if (!current) {
      throw new BadRequestException('No active station to complete');
    }

    const isLast = current.sequence === stations.length;
    if (isLast) {
      throw new BadRequestException(
        'Last station must be completed via finish',
      );
    }

    await this.assertDriverInStationZone(lat, lng, current);

    const next = stations.find((s) => s.sequence === current.sequence + 1);

    await this.prisma.$transaction(async (tx) => {
      await tx.orderStation.update({
        where: { id: current.id },
        data: { status: StationStatus.REACHED, reachedAt: new Date() },
      });
      if (next) {
        await tx.orderStation.update({
          where: { id: next.id },
          data: { status: StationStatus.GOING },
        });
      }
    });

    // Keep the order's live driver position roughly in sync for tracking.
    await this.prisma.order.update({
      where: { id: orderId },
      data: { deliveryLat: lat, deliveryLng: lng },
    });

    // Notify the customer that the driver finished a station.
    await this.notificationService.sendLocalizedNotification(
      order.userId,
      { ar: 'تم الوصول لمحطة', en: 'Station reached' },
      {
        ar: `أنهى السائق المحطة ${current.sequence} من ${stations.length}`,
        en: `The driver completed station ${current.sequence} of ${stations.length}`,
      },
      { resourceId: `${orderId}` },
      NotificationType.ORDER,
      orderId,
    );

    const updatedStations = stations.map((s) =>
      s.id === current.id
        ? { ...s, status: StationStatus.REACHED }
        : next && s.id === next.id
          ? { ...s, status: StationStatus.GOING }
          : s,
    );

    return {
      ...this.buildStationProgress(updatedStations),
      stations: updatedStations,
    };
  }

  // "Finish Task": only valid on the final station and once every earlier station
  // is REACHED. Marks the last station REACHED, then runs the shared DELIVERED
  // path for earnings/transactions/notifications.
  async finishCustomDelivery(
    orderId: number,
    user: CurrentUser,
    lat: number,
    lng: number,
  ) {
    const order = await this.getCustomDeliveryForProgress(orderId, user);
    const stations = order.Stations;

    const lastStation = stations[stations.length - 1];
    const earlierUnreached = stations.some(
      (s) =>
        s.sequence < lastStation.sequence && s.status !== StationStatus.REACHED,
    );
    if (earlierUnreached) {
      throw new BadRequestException(
        'Cannot finish before completing all stations',
      );
    }

    // changeStatus's own geofence check skips custom-delivery orders (they have
    // no addressId), so the last station's zone check has to happen here.
    await this.assertDriverInStationZone(lat, lng, lastStation);

    // Run the DELIVERED transition FIRST. changeStatus validates the driver's
    // location (it rejects a delivery without lat/lng) and runs wallet
    // distribution / transactions / notifications / AFK break. Doing it before we
    // touch station state means any failure aborts cleanly — we never leave the
    // last station REACHED on an order that didn't actually get delivered.
    await this.changeStatus(orderId, OrderStatus.DELIVERED, user, lat, lng);

    await this.prisma.orderStation.update({
      where: { id: lastStation.id },
      data: { status: StationStatus.REACHED, reachedAt: new Date() },
    });

    return { success: true, finished: true };
  }

  async rejectOrderAssignment(orderId: number, deliveryId: number) {
    const assignment = await this.prisma.orderDeliveryAssignment.findFirst({
      where: {
        orderId,
        deliveryId,
        status: AssignmentStatus.PENDING,
      },
      include: {
        Delivery: { include: { User: true } },
      },
    });

    if (!assignment) {
      throw new BadRequestException('No pending assignment found');
    }

    await this.prisma.orderDeliveryAssignment.update({
      where: { id: assignment.id },
      data: {
        status: AssignmentStatus.REJECTED,
        respondedAt: new Date(),
      },
    });

    // Notify admin
    const adminUsers = await this.prisma.user.findMany({
      where: { roleKey: RolesKeys.ADMIN },
    });

    for (const admin of adminUsers) {
      await this.notificationService.sendLocalizedNotification(
        admin.id,
        { ar: 'رفض طلب', en: 'Order Rejected' },
        {
          ar: `الديلفري رفض الطلب رقم ${orderId}`,
          en: `Delivery rejected order ${orderId}`,
        },
        { resourceId: `${orderId}`, type: 'DELIVERY_REJECTED' },
      );
    }

    // An explicit reject must behave exactly like a silent timeout: bench the
    // driver (or defer until their current trip ends), then hand the order to
    // the next-nearest driver in AUTO mode — or leave it unassigned for the
    // admin to pick manually in MANUAL mode (handleOrderAssignment respects
    // deliveryAssignmentMode internally).
    await this.applyOrDeferAfkBreak(
      deliveryId,
      assignment.Delivery?.User?.name ?? '',
    );
    await this.reassignAfterTimeout(orderId, deliveryId);

    return { success: true };
  }

  async getCurrentAssignment(deliveryId: number) {
    // 1. Check for pending assignment (invitation)
    const pendingAssignment =
      await this.prisma.orderDeliveryAssignment.findFirst({
        where: {
          deliveryId,
          status: AssignmentStatus.PENDING,
          expiresAt: { gt: new Date() },
        },
        include: {
          Order: {
            select: selectOrderOBJ({} as any),
          },
        },
      });

    if (pendingAssignment) {
      return {
        type: 'PENDING_ASSIGNMENT',
        assignment: pendingAssignment,
        order: this.attachCustomProgress(pendingAssignment.Order),
      };
    }

    // 2. Check for active order
    const activeOrder = await this.prisma.order.findFirst({
      where: {
        deliveryId,
        status: {
          in: [
            OrderStatus.PREPARING,
            OrderStatus.READY_PICKUP,
            OrderStatus.ON_THE_WAY,
          ],
        },
      },
      select: selectOrderOBJ({} as any),
    });

    if (activeOrder) {
      return {
        type: 'ACTIVE_ORDER',
        order: this.attachCustomProgress(activeOrder),
      };
    }

    return null;
  }

  // Server-authoritative rating eligibility for an order, so the mobile rate page
  // does not re-derive the rules from branchId/deliveryId. Mirrors the validation
  // enforced by rateOrder(): a store rating needs a branch with a parent store, a
  // driver rating needs an assigned driver, and either is only allowed once the
  // order is DELIVERED and not yet rated (single submission via `rated`).
  // See docs/order-rating-mobile-guide.md for the intended client flow.
  private buildRatingEligibility(order: {
    status: OrderStatus;
    rated: boolean;
    branchId?: number | null;
    deliveryId?: number | null;
    Branch?: { storeId?: number | null } | null;
  }) {
    const open = order.status === OrderStatus.DELIVERED && !order.rated;
    const canRateStore = open && !!order.branchId && !!order.Branch?.storeId;
    const canRateDriver = open && !!order.deliveryId;
    return {
      canRateStore,
      canRateDriver,
      canSubmitRating: canRateStore || canRateDriver,
      alreadyRated: order.rated,
    };
  }

  // Attaches the custom-delivery progress block to an order (no-op for other types).
  private attachCustomProgress<T extends { type?: OrderType; Stations?: any }>(
    order: T,
  ): T {
    if (order && order.type === OrderType.CUSTOM_DELIVERY) {
      Object.assign(order, {
        customDeliveryProgress: this.buildStationProgress(
          (order.Stations ?? []) as {
            sequence: number;
            status: StationStatus;
          }[],
        ),
      });
    }
    return order;
  }

  async getPendingAssignments(deliveryId: number, type?: OrderType) {
    const assignments = await this.prisma.orderDeliveryAssignment.findMany({
      where: {
        deliveryId,
        status: AssignmentStatus.PENDING,
        expiresAt: { gt: new Date() },
        // The driver "New" tab is per-surface: filter invitations by order type
        // (e.g. CUSTOM_DELIVERY for the special-delivery tab).
        ...(type ? { Order: { type } } : {}),
      },
      include: {
        Order: {
          select: selectOrderOBJ({} as any),
        },
      },
    });

    assignments.forEach((a) => this.attachCustomProgress(a.Order));
    return assignments;
  }

  async acceptAllPendingAssignments(deliveryId: number) {
    const pending = await this.prisma.orderDeliveryAssignment.findMany({
      where: {
        deliveryId,
        status: AssignmentStatus.PENDING,
        expiresAt: { gt: new Date() },
      },
      select: { orderId: true },
    });

    const succeeded: number[] = [];
    const failed: Array<{ orderId: number; reason: string }> = [];

    for (const { orderId } of pending) {
      try {
        await this.acceptOrderAssignment(orderId, deliveryId);
        succeeded.push(orderId);
      } catch (error) {
        failed.push({ orderId, reason: error?.message ?? 'Accept failed' });
      }
    }

    return { succeeded, failed };
  }

  /**
   * Re-assign an order to the next-nearest available driver after the previous
   * assignment timed out, excluding the driver who just let it lapse so it does
   * not bounce straight back to them. Goes through handleOrderAssignment, so it
   * honors the AUTO/MANUAL assignment mode (no re-assignment in MANUAL mode).
   * No-op if the order already has a driver, is a PICKUP, or is in a terminal state.
   */
  async reassignAfterTimeout(orderId: number, timedOutDriverId: number) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, deliveryId: true, status: true, type: true },
    });
    if (!order) return;
    if (order.deliveryId) return; // someone already took / re-assigned it
    if (order.type === OrderType.PICKUP) return;

    const terminal: OrderStatus[] = [
      OrderStatus.DELIVERED,
      OrderStatus.CANCELLED,
      OrderStatus.REJECTED,
      OrderStatus.PAYMENT_FAILD,
      OrderStatus.PENDING_PAYMENT,
    ];
    if (terminal.includes(order.status)) return;

    await this.assignmentService.handleOrderAssignment(order.id, [
      timedOutDriverId,
    ]);
  }

  /**
   * Decide whether a timed-out driver should be benched now or after finishing
   * their current trip. If they have an active order, defer (mark pending) so the
   * break is applied on DELIVERED; otherwise apply the break immediately.
   */
  async applyOrDeferAfkBreak(deliveryId: number, userName: string) {
    // Feature switched off from the dashboard — never bench or defer.
    if (!(await this.afkBreakService.isEnabled())) {
      return;
    }

    // Already benched — don't stack breaks.
    if (await this.afkBreakService.isOnBreak(deliveryId)) {
      return;
    }

    const activeCount = await this.prisma.order.count({
      where: {
        deliveryId,
        status: {
          in: [
            OrderStatus.PREPARING,
            OrderStatus.READY_PICKUP,
            OrderStatus.ON_THE_WAY,
          ],
        },
      },
    });

    if (activeCount > 0) {
      // Defer: apply the break once the current trip(s) are delivered.
      await this.afkBreakService.markPending(deliveryId);
      return;
    }

    await this.applyAfkBreakNow(deliveryId, userName);
  }

  /**
   * Suspend a driver right now: record the break in Redis, flip availableNow off,
   * notify the driver + admins, and write an audit log.
   */
  async applyAfkBreakNow(deliveryId: number, userName: string) {
    // Guard the direct path too: a driver marked pending before the feature was
    // switched off must not be benched when their deferred trip is DELIVERED.
    if (!(await this.afkBreakService.isEnabled())) {
      return;
    }

    const breakUntil = await this.afkBreakService.suspend(deliveryId);
    const minutes = await this.afkBreakService.getBreakMinutes();

    await this.prisma.deliveryDetails.update({
      where: { userId: deliveryId },
      data: { availableNow: false },
    });

    await this.notificationService.sendLocalizedNotification(
      deliveryId,
      { ar: 'استراحة إجبارية', en: 'Forced Break' },
      {
        ar: `تم وضعك في استراحة لمدة ${minutes} دقيقة لعدم الرد على الطلبات.`,
        en: `You have been placed on a ${minutes}-minute break for not responding to assignment(s).`,
      },
      { type: 'AFK_BREAK' },
    );

    await this.logsService.createLog({
      userId: String(deliveryId),
      userName,
      userRole: 'DELIVERY',
      action: 'AFK_BREAK',
      details: `Driver placed on a ${minutes}-minute break for not responding to assignment(s)`,
    });

    const adminUsers = await this.prisma.user.findMany({
      where: { roleKey: RolesKeys.ADMIN },
      select: { id: true },
    });
    for (const admin of adminUsers) {
      await this.notificationService.sendLocalizedNotification(
        admin.id,
        { ar: 'استراحة سائق', en: 'Driver Break' },
        {
          ar: `تم وضع السائق ${userName} في استراحة إجبارية لعدم الرد على الطلبات.`,
          en: `Driver ${userName} was placed on a forced break for not responding to assignment(s).`,
        },
        { type: 'AFK_BREAK', resourceId: String(deliveryId) },
      );
    }

    return breakUntil;
  }

  async findAllArchived(filters: FilterOrderDTO, user: CurrentUser) {
    const where: any = {};
    if (filters.userId) where.userId = filters.userId;
    if (filters.branchId) where.branchId = filters.branchId;
    if (filters.id) where.id = filters.id;

    // Authorization: If customer, only show their own archived orders
    if (user?.Role?.roleKey === RolesKeys.CUSTOMER) {
      where.userId = user.id;
    }
    // If store/branch user, only show their branch archived orders
    if (user?.Role?.roleKey === RolesKeys.STORE) {
      where.branchId = user.branchId;
    }

    return await this.prisma.archivedOrder.findMany({
      where,
      include: {
        ArchivedOrderItems: {
          include: {
            Service: true,
            Size: true,
            ArchivedOrderItemAddons: {
              include: {
                Addon: true,
              },
            },
          },
        },
        Customer: true,
        Branch: true,
        Address: true,
      },
      orderBy: { createdAt: 'desc' },
      ...prismaPagination(filters),
    });
  }

  async countArchived(filters: FilterOrderDTO, user: CurrentUser) {
    const where: any = {};
    if (filters.userId) where.userId = filters.userId;
    if (filters.branchId) where.branchId = filters.branchId;

    if (user?.Role?.roleKey === RolesKeys.CUSTOMER) {
      where.userId = user.id;
    }
    if (user?.Role?.roleKey === RolesKeys.STORE) {
      where.branchId = user.branchId;
    }

    return await this.prisma.archivedOrder.count({ where });
  }

  async realizeArchivedOrder(archivedOrderId: number) {
    const archivedOrder = await this.prisma.archivedOrder.findUnique({
      where: { id: archivedOrderId },
      include: {
        Coupon: true,
        ArchivedOrderItems: {
          include: {
            ArchivedOrderItemAddons: true,
          },
        },
      },
    });

    if (!archivedOrder) {
      throw new BadRequestException('Archived order not found');
    }

    const createData: CreateOrderDTO = {
      userId: archivedOrder.userId,
      addressId: archivedOrder.addressId,
      branchId: archivedOrder.branchId,
      items: archivedOrder.ArchivedOrderItems.map((item) => ({
        serviceId: item.serviceId,
        sizeId: item.sizeId,
        addonIds: item.ArchivedOrderItemAddons.map((addon) => addon.addonId),
        quantity: item.quantity,
      })),
      type: archivedOrder.type,
      tip: archivedOrder.tip,
      note: archivedOrder.note,
      paymentMethod: archivedOrder.paymentMethod,
      paidWithWallet: archivedOrder.paidWithWallet,
      isGift: archivedOrder.isGift,
      transferNumber: archivedOrder.transferNumber,
      transferImage: archivedOrder.transferImage,
      transferType: archivedOrder.transferType,
      transferAccountNumber: archivedOrder.transferAccountNumber,
      category: OrderCategory.SCHEDULED,
      scheduledAt: archivedOrder.scheduledAt,
      zoneId: archivedOrder.customerSelectedZoneId ?? undefined,
      couponCode: archivedOrder.Coupon?.code ?? undefined,
    };

    // Bypass the archive branch: this order already sat in ArchivedOrder and its
    // scheduled time has arrived, so this call must produce a real Order, not
    // recreate another archived row (which would otherwise loop forever).
    const result = await this.create(createData, true);

    await this.prisma.archivedOrder.delete({
      where: { id: archivedOrderId },
    });

    return result;
  }

  private async createArchivedOrder(data: CreateOrderDTO, calc: any) {
    const { userId, addressId, branchId } = data;
    const {
      price: subtotal,
      totalPrice,
      discountValue,
      globalCommission,
      storeCommission,
      adminCommission,
      tax,
      couponId,
      rewardId,
      items,
      shipping,
    } = calc;

    return await this.prisma.$transaction(async (tx) => {
      const archivedOrder = await tx.archivedOrder.create({
        data: {
          tip: data.tip ?? 0,
          price: subtotal,
          totalPriceAfterDiscount: totalPrice,
          discountAmount: discountValue,
          adminCommission: adminCommission,
          globalCommission: globalCommission,
          storeCommission: storeCommission,
          shipping: shipping,
          tax: tax,
          couponId,
          addressId,
          userId,
          branchId,
          zoneId: calc.zoneId,
          customerSelectedZoneId: data.zoneId ?? null,
          type: data.type || OrderType.DELIVERY,
          paidWithWallet: data.paidWithWallet ?? false,
          isGift: data.isGift ?? false,
          paymentMethod: data.paymentMethod,
          transferNumber: data.transferNumber,
          transferImage: data.transferImage,
          transferType: data.transferType,
          transferAccountNumber: data.transferAccountNumber,
          note: data.note,
          category: OrderCategory.SCHEDULED,
          scheduledAt: data.scheduledAt,
        },
      });

      // Consume fortune reward atomically inside the archived order transaction
      if (rewardId) {
        await this.helpers.consumeFortuneReward(
          tx,
          rewardId,
          userId,
          archivedOrder.id,
        );
      }

      for (const item of items) {
        const archivedOrderItem = await tx.archivedOrderItem.create({
          data: {
            archivedOrderId: archivedOrder.id,
            serviceId: item.serviceId,
            sizeId: item?.selected?.size?.id,
            quantity: item.quantity,
            price: item.itemTotalPrice,
          },
        });

        if (item.addonIds?.length) {
          for (const addon of item.selected.addons) {
            await tx.archivedOrderItemAddon.create({
              data: {
                archivedOrderItemId: archivedOrderItem.id,
                addonId: addon.id,
              },
            });
          }
        }
      }

      return archivedOrder;
    });
  }

  async addAdminNote(orderId: Id, adminNote: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        deliveryId: true,
        adminNote: true,
      },
    });

    if (!order) {
      throw new BadRequestException('Order not found');
    }

    // Update the admin note
    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: { adminNote },
      select: { id: true, adminNote: true },
    });

    // Send notification to delivery if assigned
    if (order.deliveryId) {
      await this.notificationService.sendLocalizedNotification(
        order.deliveryId,
        { ar: 'ملاحظة من الإدارة', en: 'Note from Admin' },
        { ar: adminNote, en: adminNote },
        { resourceId: `${orderId}` },
        NotificationType.ORDER,
        orderId,
      );
    }

    return updated;
  }
}
