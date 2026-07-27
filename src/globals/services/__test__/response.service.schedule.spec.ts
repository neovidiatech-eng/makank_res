import { egyptWallClockToTimeColumn } from 'src/globals/helpers/egypt-time.helper';
import { ResponseService } from '../response.service';

/**
 * The response layer exposes schedule `@db.Time` columns (`openingTime`/`closingTime`) as Egypt
 * wall-clock "HH:mm" strings on every surface — localized (mobile) AND raw (admin) — without
 * disturbing the localizer's flat `+3h` shift on genuine DateTime instants (createdAt, order
 * dates, …). This pins both guarantees through the public `success()` entry point.
 */
describe('ResponseService — schedule time serialization', () => {
  const i18n: any = { translate: jest.fn().mockReturnValue('ok') };
  const svc = new ResponseService(i18n);

  const mockRes = (headers: Record<string, any>) => {
    const res: any = {
      req: { headers, file: undefined, files: undefined },
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    return res;
  };
  const sentData = (res: any) => res.json.mock.calls[0][0].data;

  const opening = egyptWallClockToTimeColumn(9, 0); // stored TIME 09:00
  const closing = egyptWallClockToTimeColumn(17, 0); // stored TIME 17:00

  it('localized (mobile): schedule fields → "HH:mm"; other Dates still get +3h', () => {
    const res = mockRes({ locale: 'ar', islocalized: 'true' });
    svc.success(res, 'msg', {
      openingTime: opening,
      closingTime: closing,
      createdAt: new Date('2025-07-15T09:00:00.000Z'),
    });
    const data: any = sentData(res);
    expect(data.openingTime).toBe('09:00');
    expect(data.closingTime).toBe('17:00');
    // The localizer adds a flat +3h to non-schedule Dates and emits an ISO string — unchanged.
    expect(data.createdAt).toBe('2025-07-15T12:00:00.000Z');
  });

  it('raw (admin): schedule fields → "HH:mm"; other Dates untouched (no shift)', () => {
    const res = mockRes({ locale: 'admin', islocalized: 'true' });
    const createdAt = new Date('2025-07-15T09:00:00.000Z');
    svc.success(res, 'msg', {
      openingTime: opening,
      closingTime: closing,
      createdAt,
    });
    const data: any = sentData(res);
    expect(data.openingTime).toBe('09:00');
    expect(data.closingTime).toBe('17:00');
    expect(data.createdAt).toBe(createdAt); // raw Date instance, not shifted
  });

  it('formats schedules embedded deep in arrays/objects (e.g. branch.storeSchedule)', () => {
    const res = mockRes({ locale: 'en', islocalized: 'false' }); // non-localized branch
    svc.success(res, 'msg', {
      branch: {
        storeSchedule: [
          { day: 'MONDAY', openingTime: opening, closingTime: closing },
        ],
      },
    });
    const data: any = sentData(res);
    expect(data.branch.storeSchedule[0].openingTime).toBe('09:00');
    expect(data.branch.storeSchedule[0].closingTime).toBe('17:00');
  });
});
