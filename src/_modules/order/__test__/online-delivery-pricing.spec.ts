// calculateOnlineDeliveryOrder — the extra-stop fee (compensation for the
// driver handling more than one recipient) was being added to adminCommission
// AFTER it was already folded into `shipping`, so the customer was charged
// for it twice. Fixed to charge it exactly once, flowing entirely to the
// driver via `shipping` (matching the purchase/restaurant custom-delivery
// convention: extra-stop money belongs to the driver, not the admin).
import { OrderService } from '../order.service';

const buildService = (overrides: Partial<any> = {}) =>
  new OrderService(
    undefined as any, // prisma
    undefined as any, // languages
    undefined as any, // helpers
    undefined as any, // walletService
    undefined as any, // paymentService
    undefined as any, // transactionService
    undefined as any, // notificationService
    undefined as any, // mapService
    (overrides.settingService ?? {
      getSettings: jest.fn().mockResolvedValue({
        onlineDeliveryEnabled: true,
        onlineDeliveryBaseFee: 0,
        onlineDeliveryCommission: 10, // per-recipient commission
        packagingFee: 0,
        onlineDeliveryPackagingEnabled: true,
        onlineRepresentativeBaseFee: 20,
        onlineRepresentativeExtraStopPrice: 5,
        customDeliveryKMCharge: 10,
        customDeliveryBaseFee: 0,
      }),
    }) as any, // settingService
    undefined as any, // assignmentService
    undefined as any, // serviceHelper
    undefined as any, // kashierService
    (overrides.zoneService ?? {
      getZoneDeliveryPrice: jest.fn().mockResolvedValue(30), // fixed zone price for the base leg
    }) as any, // zoneService
    undefined as any, // afkBreakService
    undefined as any, // logsService
    undefined as any, // orderTrackingGateway
  );

describe('calculateOnlineDeliveryOrder — extra-stop fee charged exactly once', () => {
  it('charges the extra-stop fee once, folded into shipping (the driver\'s money)', async () => {
    const service = buildService();

    const result = await service.calculateOnlineDeliveryOrder({
      pickupLat: 1,
      pickupLng: 1,
      recipients: [
        { deliveryZoneId: 1, lat: 2, lng: 2 },
        { deliveryZoneId: 2, lat: 3, lng: 3 }, // 1 extra stop beyond the first recipient
      ],
    } as any);

    // base zone price 30 + (1 extra stop * 5) = 35
    expect(result.extraStopFee).toBe(5);
    expect(result.shipping).toBe(35);
    // adminCommission = the flat onlineDeliveryCommission setting only (10),
    // NOT incremented again by extraStopFee.
    expect(result.adminCommission).toBe(10);
    // total = shipping(35) + adminCommission(10) + tip(0) — extraStopFee counted once.
    expect(result.total).toBe(45);
  });

  it('charges nothing extra when there is only one recipient (no extra stop)', async () => {
    const service = buildService();

    const result = await service.calculateOnlineDeliveryOrder({
      pickupLat: 1,
      pickupLng: 1,
      recipients: [{ deliveryZoneId: 1, lat: 2, lng: 2 }],
    } as any);

    expect(result.extraStopFee).toBe(0);
    expect(result.shipping).toBe(30);
    expect(result.adminCommission).toBe(10);
    expect(result.total).toBe(40);
  });
});
