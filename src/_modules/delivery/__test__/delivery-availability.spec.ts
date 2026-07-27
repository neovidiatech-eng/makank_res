import { egyptWallClockToTimeColumn } from 'src/globals/helpers/egypt-time.helper';
import { DeliveryAvailabilityService } from '../delivery-availability.service';

/**
 * Driver availability: the shared shift-window check and the every-5-min cron that sets
 * `availableNow`. Schedule TIME columns hold the literal Egypt wall-clock (Option A), so the
 * window is read with zero offset and compared against the Cairo seconds-of-day.
 *
 * Notably this pins the fix for the "stuck offline" bug: the cron previously only ever set
 * drivers OFFLINE (it gated the write on `isAvailable === false`), so schedule-based onlining
 * was dead. It must now bring drivers both ONLINE and OFFLINE.
 */
describe('DeliveryAvailabilityService', () => {
  const win = (oh: number, om: number, ch: number, cm: number) => ({
    openingTime: egyptWallClockToTimeColumn(oh, om),
    closingTime: egyptWallClockToTimeColumn(ch, cm),
  });

  describe('isWithinShift (zero-offset, overnight-aware)', () => {
    const at = (h: number, m = 0) => h * 3600 + m * 60;

    it('09:00–17:00 → inside at 12:00, outside at 08:00/18:00', () => {
      const s = [win(9, 0, 17, 0)];
      expect(DeliveryAvailabilityService.isWithinShift(s, at(12))).toBe(true);
      expect(DeliveryAvailabilityService.isWithinShift(s, at(8))).toBe(false);
      expect(DeliveryAvailabilityService.isWithinShift(s, at(18))).toBe(false);
    });

    it('overnight 22:00–04:00 → inside at 23:00 and 03:00, outside at 12:00', () => {
      const s = [win(22, 0, 4, 0)];
      expect(DeliveryAvailabilityService.isWithinShift(s, at(23))).toBe(true);
      expect(DeliveryAvailabilityService.isWithinShift(s, at(3))).toBe(true);
      expect(DeliveryAvailabilityService.isWithinShift(s, at(12))).toBe(false);
    });
  });

  describe('checkAvailability cron', () => {
    // 2025-07-15T09:00:00Z = Cairo Tue 12:00 (summer, UTC+3).
    const FROZEN = new Date('2025-07-15T09:00:00.000Z');

    const build = (details: any, onBreak = false) => {
      const update = jest.fn().mockResolvedValue({});
      const prisma: any = {
        $connect: jest.fn().mockResolvedValue(undefined),
        deliveryDetails: {
          findMany: jest.fn().mockResolvedValue([details]),
          update,
        },
      };
      const afk: any = { isOnBreak: jest.fn().mockResolvedValue(onBreak) };
      const svc = new DeliveryAvailabilityService(prisma, afk);
      return { svc, update };
    };

    beforeEach(() => jest.useFakeTimers().setSystemTime(FROZEN));
    afterEach(() => jest.useRealTimers());

    it('brings an OFFLINE driver ONLINE when inside the shift (the bug fix)', async () => {
      const { svc, update } = build({
        userId: 1,
        availableNow: false,
        forceAvailable: false,
        Schedule: [win(9, 0, 17, 0)], // 12:00 is inside
      });
      await svc.checkAvailability();
      expect(update).toHaveBeenCalledWith({
        where: { userId: 1 },
        data: { availableNow: true },
      });
    });

    it('brings an ONLINE driver OFFLINE when outside the shift', async () => {
      const { svc, update } = build({
        userId: 2,
        availableNow: true,
        forceAvailable: false,
        Schedule: [win(1, 0, 2, 0)], // 12:00 is outside
      });
      await svc.checkAvailability();
      expect(update).toHaveBeenCalledWith({
        where: { userId: 2 },
        data: { availableNow: false },
      });
    });

    it('forceAvailable brings the driver ONLINE regardless of schedule', async () => {
      const { svc, update } = build({
        userId: 3,
        availableNow: false,
        forceAvailable: true,
        Schedule: [],
      });
      await svc.checkAvailability();
      expect(update).toHaveBeenCalledWith({
        where: { userId: 3 },
        data: { availableNow: true },
      });
    });

    it('an on-break driver is forced OFFLINE and the schedule is skipped', async () => {
      const { svc, update } = build(
        {
          userId: 4,
          availableNow: true,
          forceAvailable: false,
          Schedule: [win(9, 0, 17, 0)], // inside, but break wins
        },
        true,
      );
      await svc.checkAvailability();
      expect(update).toHaveBeenCalledWith({
        where: { userId: 4 },
        data: { availableNow: false },
      });
    });
  });
});
