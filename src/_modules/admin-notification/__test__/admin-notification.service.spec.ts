import { BadRequestException } from '@nestjs/common';
import { NotificationTargetType } from '@prisma/client';
import { buildClickTargetData } from 'src/globals/services/notification.service';
import { TargetType } from '../dto/create-admin-notification.dto';
import { AdminNotificationService } from '../services/admin-notification.service';

type AnyFn = jest.Mock;

const baseDto = {
  title: { ar: 'Title AR', en: 'Title' },
  body: { ar: 'Body AR', en: 'Body' },
  targetType: TargetType.CUSTOMER,
};

const buildPrisma = () => ({
  adminNotification: { create: jest.fn().mockResolvedValue({ id: 1 }) },
  user: { findMany: jest.fn().mockResolvedValue([]) },
  store: { findFirst: jest.fn() },
  category: { findFirst: jest.fn() },
  service: { findFirst: jest.fn() },
  zone: { findFirst: jest.fn() },
  order: { findFirst: jest.fn() },
  coupon: { findFirst: jest.fn() },
});

const buildService = (prisma: ReturnType<typeof buildPrisma>) =>
  new AdminNotificationService(
    prisma as any,
    { sendLocalizedNotification: jest.fn() } as any,
  );

describe('AdminNotificationService click target validation', () => {
  it.each([
    [NotificationTargetType.STORE, 'clickStoreId'],
    [NotificationTargetType.CATEGORY, 'clickCategoryId'],
    [NotificationTargetType.SERVICE, 'clickServiceId'],
    [NotificationTargetType.ZONE, 'clickZoneId'],
    [NotificationTargetType.ORDER, 'clickOrderId'],
    [NotificationTargetType.COUPON, 'clickCouponId'],
    [NotificationTargetType.EXTERNAL_URL, 'clickUrl'],
  ])('rejects %s when %s is missing', async (clickTargetType, field) => {
    const prisma = buildPrisma();

    await expect(
      buildService(prisma).createAndSend({
        ...baseDto,
        clickTargetType,
      } as any),
    ).rejects.toThrow(BadRequestException);

    expect(prisma.adminNotification.create).not.toHaveBeenCalled();
    expect(field).toBeDefined();
  });

  it.each([
    [
      NotificationTargetType.STORE,
      { clickStoreId: 1 },
      'store',
      'Invalid clickStoreId',
    ],
    [
      NotificationTargetType.SERVICE,
      { clickServiceId: 2 },
      'service',
      'Invalid clickServiceId',
    ],
    [
      NotificationTargetType.ZONE,
      { clickZoneId: 3 },
      'zone',
      'Invalid clickZoneId',
    ],
    [
      NotificationTargetType.ORDER,
      { clickOrderId: 4 },
      'order',
      'Invalid clickOrderId',
    ],
    [
      NotificationTargetType.COUPON,
      { clickCouponId: 5 },
      'coupon',
      'Invalid clickCouponId',
    ],
  ])(
    'rejects %s when referenced row does not exist',
    async (clickTargetType, refs, model, message) => {
      const prisma = buildPrisma();
      (prisma[model]!.findFirst as AnyFn).mockResolvedValue(null);

      await expect(
        buildService(prisma).createAndSend({
          ...baseDto,
          clickTargetType,
          ...refs,
        } as any),
      ).rejects.toThrow(message);

      expect(prisma.adminNotification.create).not.toHaveBeenCalled();
    },
  );

  it('rejects a missing category', async () => {
    const prisma = buildPrisma();
    (prisma.category.findFirst as AnyFn).mockResolvedValue(null);

    await expect(
      buildService(prisma).createAndSend({
        ...baseDto,
        clickTargetType: NotificationTargetType.CATEGORY,
        clickCategoryId: 10,
      } as any),
    ).rejects.toThrow('Invalid clickCategoryId');
  });

  it('rejects a category that does not belong to the supplied store', async () => {
    const prisma = buildPrisma();
    (prisma.category.findFirst as AnyFn).mockResolvedValue({
      id: 10,
      storeId: 99,
    });
    (prisma.store.findFirst as AnyFn).mockResolvedValue({ id: 1 });

    await expect(
      buildService(prisma).createAndSend({
        ...baseDto,
        clickTargetType: NotificationTargetType.CATEGORY,
        clickStoreId: 1,
        clickCategoryId: 10,
      } as any),
    ).rejects.toThrow(
      'Click category does not belong to the selected click store',
    );
  });

  it('persists and dispatches the click target on success', async () => {
    const prisma = buildPrisma();
    (prisma.store.findFirst as AnyFn).mockResolvedValue({ id: 1 });
    prisma.user.findMany.mockResolvedValue([{ id: 7 }]);
    const notificationService = { sendLocalizedNotification: jest.fn() };
    const service = new AdminNotificationService(
      prisma as any,
      notificationService as any,
    );

    await service.createAndSend({
      ...baseDto,
      clickTargetType: NotificationTargetType.STORE,
      clickStoreId: 1,
    } as any);

    expect(prisma.adminNotification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          clickTargetType: NotificationTargetType.STORE,
          clickStoreId: 1,
        }),
      }),
    );
    expect(notificationService.sendLocalizedNotification).toHaveBeenCalledWith(
      7,
      baseDto.title,
      baseDto.body,
      undefined,
      expect.any(String),
      undefined,
      { targetType: NotificationTargetType.STORE, storeId: 1 },
      undefined,
    );
  });
});

describe('buildClickTargetData', () => {
  it('omits GENERAL click targets', () => {
    expect(
      buildClickTargetData({ targetType: NotificationTargetType.GENERAL }),
    ).toBeUndefined();
  });

  it('builds string FCM keys for store targets', () => {
    expect(
      buildClickTargetData({
        targetType: NotificationTargetType.STORE,
        storeId: 123,
      }),
    ).toEqual({ targetType: 'STORE', storeId: '123' });
  });

  it.each([
    [
      NotificationTargetType.ORDER,
      { orderId: 11 },
      { targetType: 'ORDER', orderId: '11' },
    ],
    [
      NotificationTargetType.COUPON,
      { couponId: 12 },
      { targetType: 'COUPON', couponId: '12' },
    ],
    [
      NotificationTargetType.EXTERNAL_URL,
      { url: 'https://example.com/deal' },
      { targetType: 'EXTERNAL_URL', url: 'https://example.com/deal' },
    ],
    [
      NotificationTargetType.SPECIAL_DRIVER,
      {},
      { targetType: 'SPECIAL_DRIVER' },
    ],
  ])('builds %s payloads', (targetType, refs, expected) => {
    expect(buildClickTargetData({ targetType, ...refs })).toEqual(expected);
  });
});

// ---------------------------------------------------------------------------
// resolveRecipients — one test per TargetType branch
// ---------------------------------------------------------------------------
describe('AdminNotificationService resolveRecipients', () => {
  const makeService = (userRows: { id: number }[]) => {
    const prisma = buildPrisma();
    prisma.user.findMany.mockResolvedValue(userRows);
    const notifSvc = { sendLocalizedNotification: jest.fn() };
    return {
      prisma,
      notifSvc,
      service: new AdminNotificationService(prisma as any, notifSvc as any),
    };
  };

  it('ALL — queries every active user regardless of role', async () => {
    const { prisma, service } = makeService([{ id: 1 }, { id: 2 }, { id: 3 }]);

    const result = await service.createAndSend({
      ...baseDto,
      targetType: TargetType.ALL,
    } as any);

    const callArg = prisma.user.findMany.mock.calls[0][0];
    expect(callArg.where).not.toHaveProperty('roleKey');
    expect(result.dispatch.recipientCount).toBe(3);
  });

  it('CUSTOMER — filters by CUSTOMER roleKey', async () => {
    const { prisma, service } = makeService([{ id: 10 }]);

    await service.createAndSend({
      ...baseDto,
      targetType: TargetType.CUSTOMER,
    } as any);

    const callArg = prisma.user.findMany.mock.calls[0][0];
    expect(callArg.where.roleKey).toBe('Customer');
  });

  it('DELIVERY — filters by DELIVERY roleKey', async () => {
    const { prisma, service } = makeService([{ id: 20 }]);

    await service.createAndSend({
      ...baseDto,
      targetType: TargetType.DELIVERY,
    } as any);

    const callArg = prisma.user.findMany.mock.calls[0][0];
    expect(callArg.where.roleKey).toBe('Delivery');
  });

  it('STORE — filters by STORE roleKey without storeIds narrowing', async () => {
    const { prisma, service } = makeService([{ id: 30 }]);

    await service.createAndSend({
      ...baseDto,
      targetType: TargetType.STORE,
    } as any);

    const callArg = prisma.user.findMany.mock.calls[0][0];
    expect(callArg.where.roleKey).toBe('Store');
    expect(callArg.where).not.toHaveProperty('storeId');
  });

  it('STORE with targetUserIds — narrows by storeId IN list', async () => {
    const { prisma, service } = makeService([{ id: 31 }]);

    await service.createAndSend({
      ...baseDto,
      targetType: TargetType.STORE,
      targetUserIds: [5, 6],
    } as any);

    const callArg = prisma.user.findMany.mock.calls[0][0];
    expect(callArg.where.storeId).toEqual({ in: [5, 6] });
  });

  it('SELECTED_USERS — queries only the supplied ids', async () => {
    const { prisma, service } = makeService([{ id: 7 }, { id: 8 }]);

    const result = await service.createAndSend({
      ...baseDto,
      targetType: TargetType.SELECTED_USERS,
      targetUserIds: [7, 8],
    } as any);

    const callArg = prisma.user.findMany.mock.calls[0][0];
    expect(callArg.where.id).toEqual({ in: [7, 8] });
    expect(result.dispatch.recipientCount).toBe(2);
  });

  it('SELECTED_USERS with empty ids — sends to nobody', async () => {
    const { prisma, service } = makeService([]);

    const result = await service.createAndSend({
      ...baseDto,
      targetType: TargetType.SELECTED_USERS,
      targetUserIds: [],
    } as any);

    expect(prisma.user.findMany).not.toHaveBeenCalled();
    expect(result.dispatch.recipientCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// ALL customers dispatch — verifies notification is sent per user
// ---------------------------------------------------------------------------
describe('AdminNotificationService dispatch to ALL customers', () => {
  it('sends notification to every resolved recipient', async () => {
    const prisma = buildPrisma();
    prisma.user.findMany.mockResolvedValue([{ id: 1 }, { id: 2 }, { id: 3 }]);

    const notifSvc = {
      sendLocalizedNotification: jest.fn().mockResolvedValue(undefined),
    };
    const service = new AdminNotificationService(prisma as any, notifSvc as any);

    const result = await service.createAndSend({
      title: { ar: 'إعلان', en: 'Announcement' },
      body: { ar: 'محتوى الإعلان', en: 'Announcement body' },
      targetType: TargetType.ALL,
    } as any);

    expect(notifSvc.sendLocalizedNotification).toHaveBeenCalledTimes(3);
    expect(notifSvc.sendLocalizedNotification).toHaveBeenCalledWith(
      1,
      { ar: 'إعلان', en: 'Announcement' },
      { ar: 'محتوى الإعلان', en: 'Announcement body' },
      undefined,
      expect.any(String),
      undefined,
      undefined,
      undefined,
    );
    expect(result.dispatch.sentCount).toBe(3);
    expect(result.dispatch.failedCount).toBe(0);
  });

  it('counts failed sends separately and does not abort the batch', async () => {
    const prisma = buildPrisma();
    prisma.user.findMany.mockResolvedValue([{ id: 1 }, { id: 2 }, { id: 3 }]);

    let callCount = 0;
    const notifSvc = {
      sendLocalizedNotification: jest.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 2) return Promise.reject(new Error('FCM error'));
        return Promise.resolve(undefined);
      }),
    };
    const service = new AdminNotificationService(prisma as any, notifSvc as any);

    const result = await service.createAndSend({
      ...baseDto,
      targetType: TargetType.ALL,
    } as any);

    expect(result.dispatch.sentCount).toBe(2);
    expect(result.dispatch.failedCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Image field — forwarded through the full pipeline
// ---------------------------------------------------------------------------
describe('AdminNotificationService image forwarding', () => {
  it('persists and dispatches the image URL', async () => {
    const prisma = buildPrisma();
    prisma.user.findMany.mockResolvedValue([{ id: 42 }]);
    const notifSvc = {
      sendLocalizedNotification: jest.fn().mockResolvedValue(undefined),
    };
    const service = new AdminNotificationService(prisma as any, notifSvc as any);

    await service.createAndSend({
      ...baseDto,
      targetType: TargetType.CUSTOMER,
      image: 'https://cdn.example.com/banner.jpg',
    } as any);

    expect(prisma.adminNotification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ image: 'https://cdn.example.com/banner.jpg' }),
      }),
    );
    expect(notifSvc.sendLocalizedNotification).toHaveBeenCalledWith(
      42,
      baseDto.title,
      baseDto.body,
      undefined,
      expect.any(String),
      undefined,
      undefined,
      'https://cdn.example.com/banner.jpg',
    );
  });
});

// ---------------------------------------------------------------------------
// sendCouponNotification — broadcast to all active customers
// ---------------------------------------------------------------------------
describe('AdminNotificationService sendCouponNotification', () => {
  const buildCouponPrisma = (
    storeRow: object | null,
    customers: { id: number }[],
  ) => {
    const prisma = buildPrisma();
    (prisma as any).store = {
      findUnique: jest.fn().mockResolvedValue(storeRow),
      findFirst: jest.fn(),
    };
    prisma.user.findMany.mockResolvedValue(customers);
    return prisma;
  };

  it('does nothing when the store is not found', async () => {
    const prisma = buildCouponPrisma(null, []);
    const notifSvc = { sendLocalizedNotification: jest.fn() };
    const service = new AdminNotificationService(prisma as any, notifSvc as any);

    await service.sendCouponNotification(999, 'SAVE20');

    expect(notifSvc.sendLocalizedNotification).not.toHaveBeenCalled();
  });

  it('sends to every active customer when the store exists', async () => {
    const prisma = buildCouponPrisma(
      { id: 1, name: { ar: 'متجر', en: 'Store' } },
      [{ id: 10 }, { id: 11 }],
    );
    const notifSvc = {
      sendLocalizedNotification: jest.fn().mockResolvedValue(undefined),
    };
    const service = new AdminNotificationService(prisma as any, notifSvc as any);

    await service.sendCouponNotification(1, 'SAVE20');

    const userQuery = prisma.user.findMany.mock.calls[0][0];
    expect(userQuery.where.roleKey).toBe('Customer');
    expect(userQuery.where.allowNotification).toBe(true);
    expect(userQuery.where.active).toBe(true);

    expect(notifSvc.sendLocalizedNotification).toHaveBeenCalledTimes(2);
    expect(notifSvc.sendLocalizedNotification).toHaveBeenCalledWith(
      10,
      expect.objectContaining({ ar: expect.stringContaining('كوبون') }),
      expect.objectContaining({ en: expect.stringContaining('SAVE20') }),
      undefined,
      expect.any(String),
      1,
      undefined,
      undefined,
    );
  });
});

// ---------------------------------------------------------------------------
// createAndSend — dispatch concurrency
// Image-bearing notifications must be sent one recipient at a time. Several
// simultaneous FCM sends that all reference the same image URL were observed
// to intermittently deliver text-only (no image) to 2+ recipients, while a
// single recipient never reproduced it — this guards against firing them
// concurrently again. Plain text notifications (no reported issue) keep the
// faster concurrent dispatch.
// ---------------------------------------------------------------------------

describe('AdminNotificationService.createAndSend — dispatch concurrency', () => {
  const buildPrismaWithUsers = (users: { id: number }[]) => ({
    adminNotification: { create: jest.fn().mockResolvedValue({ id: 1 }) },
    user: { findMany: jest.fn().mockResolvedValue(users) },
  });

  it('dispatches sequentially (no overlap) when an image is attached', async () => {
    const prisma = buildPrismaWithUsers([{ id: 10 }, { id: 11 }, { id: 12 }]);
    let inFlight = 0;
    let maxConcurrent = 0;
    const notifSvc = {
      sendLocalizedNotification: jest.fn(async () => {
        inFlight++;
        maxConcurrent = Math.max(maxConcurrent, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 5));
        inFlight--;
      }),
    };
    const service = new AdminNotificationService(prisma as any, notifSvc as any);

    await service.createAndSend({
      ...baseDto,
      image: 'uploads/admin-notifications/x.png',
    } as any);

    expect(notifSvc.sendLocalizedNotification).toHaveBeenCalledTimes(3);
    expect(maxConcurrent).toBe(1);
  });

  it('dispatches concurrently when there is no image', async () => {
    const prisma = buildPrismaWithUsers([{ id: 10 }, { id: 11 }, { id: 12 }]);
    let inFlight = 0;
    let maxConcurrent = 0;
    const notifSvc = {
      sendLocalizedNotification: jest.fn(async () => {
        inFlight++;
        maxConcurrent = Math.max(maxConcurrent, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 5));
        inFlight--;
      }),
    };
    const service = new AdminNotificationService(prisma as any, notifSvc as any);

    await service.createAndSend({ ...baseDto } as any);

    expect(notifSvc.sendLocalizedNotification).toHaveBeenCalledTimes(3);
    expect(maxConcurrent).toBeGreaterThan(1);
  });
});
