// Unit tests for the dashboard on/off switch of the driver AFK-break punishment.
// No MySQL/Redis/Nest DI — Prisma and the AfkBreakService are mocked, and only
// the deps the benched-driver paths touch are wired up.
//
// Covered:
//   - applyOrDeferAfkBreak / applyAfkBreakNow are full no-ops when the feature is
//     disabled (incl. the DELIVERED/deferred direct-call path).
//   - When enabled, the bench/defer branching still behaves as before.
//   - AfkBreakService.isEnabled() default-ON + robust boolean parsing.

import { AfkBreakService } from '../../../globals/services/afk-break.service';
import { OrderService } from '../order.service';

// ---------------------------------------------------------------------------
// Service construction — only the deps the AFK paths touch need to be real.
// ---------------------------------------------------------------------------

type Deps = Partial<{
  prisma: any;
  notificationService: any;
  afkBreakService: any;
  logsService: any;
}>;

const buildService = (d: Deps = {}): OrderService =>
  new OrderService(
    d.prisma as any, // prisma
    undefined as any, // languages
    undefined as any, // helpers
    undefined as any, // walletService
    undefined as any, // paymentService
    undefined as any, // transactionService
    (d.notificationService ?? { sendLocalizedNotification: jest.fn() }) as any, // notificationService
    undefined as any, // mapService
    undefined as any, // settingService
    undefined as any, // assignmentService
    undefined as any, // serviceHelper
    undefined as any, // kashierService
    undefined as any, // zoneService
    d.afkBreakService as any, // afkBreakService
    (d.logsService ?? { createLog: jest.fn() }) as any, // logsService
    { broadcastNewOrder: jest.fn(), broadcastOrderStatusChanged: jest.fn() } as any, // orderTrackingGateway
  );

const buildAfkStub = (over: Partial<Record<string, any>> = {}) => ({
  isEnabled: jest.fn().mockResolvedValue(true),
  isOnBreak: jest.fn().mockResolvedValue(false),
  markPending: jest.fn().mockResolvedValue(undefined),
  suspend: jest.fn().mockResolvedValue(new Date(Date.now() + 15 * 60 * 1000)),
  getBreakMinutes: jest.fn().mockResolvedValue(15),
  ...over,
});

const buildPrisma = (over: Partial<Record<string, any>> = {}) => ({
  order: { count: jest.fn().mockResolvedValue(0) },
  deliveryDetails: { update: jest.fn().mockResolvedValue({}) },
  user: { findMany: jest.fn().mockResolvedValue([]) },
  ...over,
});

describe('AFK-break feature toggle (deliveryAfkBreakEnabled)', () => {
  describe('disabled', () => {
    it('applyOrDeferAfkBreak is a no-op — no bench, no defer, no DB read', async () => {
      const afk = buildAfkStub({
        isEnabled: jest.fn().mockResolvedValue(false),
      });
      const prisma = buildPrisma();
      const notificationService = { sendLocalizedNotification: jest.fn() };
      const logsService = { createLog: jest.fn() };
      const service = buildService({
        prisma,
        afkBreakService: afk,
        notificationService,
        logsService,
      });

      await service.applyOrDeferAfkBreak(42, 'Driver');

      expect(afk.isEnabled).toHaveBeenCalled();
      expect(afk.isOnBreak).not.toHaveBeenCalled();
      expect(afk.markPending).not.toHaveBeenCalled();
      expect(afk.suspend).not.toHaveBeenCalled();
      expect(prisma.order.count).not.toHaveBeenCalled();
      expect(prisma.deliveryDetails.update).not.toHaveBeenCalled();
      expect(
        notificationService.sendLocalizedNotification,
      ).not.toHaveBeenCalled();
      expect(logsService.createLog).not.toHaveBeenCalled();
    });

    it('applyAfkBreakNow (DELIVERED/deferred direct path) is a no-op when disabled', async () => {
      // Simulates order.service DELIVERED hook calling applyAfkBreakNow directly
      // for a driver whose hasPending flag was set BEFORE the feature was switched off.
      const afk = buildAfkStub({
        isEnabled: jest.fn().mockResolvedValue(false),
      });
      const prisma = buildPrisma();
      const notificationService = { sendLocalizedNotification: jest.fn() };
      const logsService = { createLog: jest.fn() };
      const service = buildService({
        prisma,
        afkBreakService: afk,
        notificationService,
        logsService,
      });

      await service.applyAfkBreakNow(42, 'Driver');

      expect(afk.suspend).not.toHaveBeenCalled();
      expect(prisma.deliveryDetails.update).not.toHaveBeenCalled();
      expect(
        notificationService.sendLocalizedNotification,
      ).not.toHaveBeenCalled();
      expect(logsService.createLog).not.toHaveBeenCalled();
    });
  });

  describe('enabled', () => {
    it('benches immediately when the driver has no active order', async () => {
      const afk = buildAfkStub();
      const prisma = buildPrisma({
        order: { count: jest.fn().mockResolvedValue(0) },
      });
      const service = buildService({ prisma, afkBreakService: afk });

      await service.applyOrDeferAfkBreak(42, 'Driver');

      expect(afk.markPending).not.toHaveBeenCalled();
      expect(afk.suspend).toHaveBeenCalledWith(42);
      expect(prisma.deliveryDetails.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 42 },
          data: { availableNow: false },
        }),
      );
    });

    it('defers (markPending) when the driver still has an active order', async () => {
      const afk = buildAfkStub();
      const prisma = buildPrisma({
        order: { count: jest.fn().mockResolvedValue(1) },
      });
      const service = buildService({ prisma, afkBreakService: afk });

      await service.applyOrDeferAfkBreak(42, 'Driver');

      expect(afk.markPending).toHaveBeenCalledWith(42);
      expect(afk.suspend).not.toHaveBeenCalled();
      expect(prisma.deliveryDetails.update).not.toHaveBeenCalled();
    });

    it('does not stack a break on an already-benched driver', async () => {
      const afk = buildAfkStub({
        isOnBreak: jest.fn().mockResolvedValue(true),
      });
      const prisma = buildPrisma();
      const service = buildService({ prisma, afkBreakService: afk });

      await service.applyOrDeferAfkBreak(42, 'Driver');

      expect(afk.markPending).not.toHaveBeenCalled();
      expect(afk.suspend).not.toHaveBeenCalled();
    });
  });

  describe('AfkBreakService.isEnabled() parsing & default-on', () => {
    const build = (getSettings: jest.Mock) =>
      new AfkBreakService({ getSettings } as any);

    it.each([
      ['missing row (undefined)', undefined, true],
      ['boolean true', { deliveryAfkBreakEnabled: true }, true],
      ['boolean false', { deliveryAfkBreakEnabled: false }, false],
      ["string 'true'", { deliveryAfkBreakEnabled: 'true' }, true],
      ["string 'false'", { deliveryAfkBreakEnabled: 'false' }, false],
      ["string '0'", { deliveryAfkBreakEnabled: '0' }, false],
      ['unknown string stays ON', { deliveryAfkBreakEnabled: 'maybe' }, true],
      ['blank string stays ON', { deliveryAfkBreakEnabled: '' }, true],
    ])('%s -> %s', async (_label, resolved, expected) => {
      const svc = build(jest.fn().mockResolvedValue(resolved));
      await expect(svc.isEnabled()).resolves.toBe(expected);
    });

    it('defaults to enabled when the settings read throws', async () => {
      const svc = build(jest.fn().mockRejectedValue(new Error('redis down')));
      await expect(svc.isEnabled()).resolves.toBe(true);
    });
  });
});
