// Product/price edits now write an audit-log entry with the acting
// employee's name and what changed — feeds the dashboard's "سجل التعديلات".
import { ServiceModuleService } from '../services/storeModule.service';

const buildService = (before: any, logsService: any) => {
  const tx = {
    service: {
      update: jest.fn().mockResolvedValue({}),
      findUnique: jest.fn().mockResolvedValue({ storeId: before?.storeId }),
      aggregate: jest.fn().mockResolvedValue({ _min: { price: null } }),
    },
    serviceSize: {
      aggregate: jest.fn().mockResolvedValue({ _min: { price: null } }),
    },
    store: { update: jest.fn().mockResolvedValue({}) },
  };
  const prisma = {
    service: { findUnique: jest.fn().mockResolvedValue(before) },
    user: { findUnique: jest.fn().mockResolvedValue({ name: 'Ahmed' }) },
    $transaction: jest.fn(async (cb: any) => cb(tx)),
  };
  const service = new ServiceModuleService(
    prisma as any,
    undefined as any,
    undefined as any,
    undefined as any,
    logsService,
  );
  return { service, prisma, tx };
};

const storeUser = { id: 5, Role: { roleKey: 'Store' } } as any;

describe('ServiceModuleService.update — audit log', () => {
  it('logs SERVICE_PRICE_UPDATED when price changes', async () => {
    const logsService = { createLog: jest.fn() };
    const { service } = buildService(
      { name: { ar: 'برجر' }, price: 50, priceAfterDiscount: null, storeId: 9 },
      logsService,
    );

    await service.update(1, { price: 60 } as any, storeUser);

    expect(logsService.createLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'SERVICE_PRICE_UPDATED',
        storeId: 9,
        userId: '5',
        userName: 'Ahmed',
        details: expect.stringContaining('50'),
      }),
    );
  });

  it('logs SERVICE_UPDATED for a non-price field change', async () => {
    const logsService = { createLog: jest.fn() };
    const { service } = buildService(
      { name: { ar: 'برجر' }, price: 50, priceAfterDiscount: null, storeId: 9 },
      logsService,
    );

    await service.update(1, { available: false } as any, storeUser);

    expect(logsService.createLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'SERVICE_UPDATED', storeId: 9 }),
    );
  });

  it('does not log anything when no user is passed (e.g. system-triggered update)', async () => {
    const logsService = { createLog: jest.fn() };
    const { service } = buildService(
      { name: { ar: 'برجر' }, price: 50, priceAfterDiscount: null, storeId: 9 },
      logsService,
    );

    await service.update(1, { price: 60 } as any);

    expect(logsService.createLog).not.toHaveBeenCalled();
  });
});
