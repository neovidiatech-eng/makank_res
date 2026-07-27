// OrderService.resolveDisplayZoneId — the customer's explicitly-picked zone
// (from the dropdown) must win over the address/GPS-resolved zone for what
// gets stored on Order.zoneId (and thus shown via the Order.Zone relation to
// both the admin dashboard and the driver app). Reproduces a real bug: an
// address whose coordinates land inside a different/overlapping zone polygon
// silently displayed THAT zone's name to the driver, disagreeing with what
// the customer actually picked and what the dashboard showed.
import { OrderService } from '../order.service';

const buildService = () =>
  new OrderService(
    undefined as any, // prisma
    undefined as any, // languages
    undefined as any, // helpers
    undefined as any, // walletService
    undefined as any, // paymentService
    undefined as any, // transactionService
    undefined as any, // notificationService
    undefined as any, // mapService
    undefined as any, // settingService
    undefined as any, // assignmentService
    undefined as any, // serviceHelper
    undefined as any, // kashierService
    undefined as any, // zoneService
    undefined as any, // afkBreakService
    undefined as any, // logsService
  );

describe('OrderService.resolveDisplayZoneId', () => {
  it('prefers the customer-picked zone over the address-resolved one', async () => {
    const tx = { zone: { findUnique: jest.fn().mockResolvedValue({ id: 7 }) } };
    const service = buildService();

    const result = await service.resolveDisplayZoneId(tx as any, 3, 7);

    expect(tx.zone.findUnique).toHaveBeenCalledWith({
      where: { id: 7 },
      select: { id: true },
    });
    expect(result).toBe(7);
  });

  it('falls back to the address-resolved zone when no zone was picked', async () => {
    const tx = { zone: { findUnique: jest.fn() } };
    const service = buildService();

    const result = await service.resolveDisplayZoneId(tx as any, 3, undefined);

    expect(tx.zone.findUnique).not.toHaveBeenCalled();
    expect(result).toBe(3);
  });

  it("falls back to the address-resolved zone when the picked id doesn't exist", async () => {
    const tx = { zone: { findUnique: jest.fn().mockResolvedValue(null) } };
    const service = buildService();

    const result = await service.resolveDisplayZoneId(tx as any, 3, 999);

    expect(result).toBe(3);
  });

  it('returns null when neither a picked zone nor an address-resolved zone exists', async () => {
    const tx = { zone: { findUnique: jest.fn() } };
    const service = buildService();

    const result = await service.resolveDisplayZoneId(tx as any, null, null);

    expect(result).toBeNull();
  });
});
