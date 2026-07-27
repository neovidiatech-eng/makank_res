// A store's "unavailable now" toggle (Service.available) already hid the
// item from the customer-facing menu, but order creation never checked it —
// so a stale/cached menu could still successfully order an item the store
// had just marked unavailable.
import { BadRequestException } from '@nestjs/common';
import { ServiceStatus } from '@prisma/client';
import { HelpersService } from '../services/helpers.service';

const baseService = {
  id: 1,
  status: ServiceStatus.ACTIVE,
  available: true,
  Store: {
    branches: [{ id: 10, temporarilyClosed: false, isActive: true, status: 'OPEN' }],
  },
};

const buildHelpers = (service: any) => {
  const prisma = {
    service: { findUnique: jest.fn().mockResolvedValue(service) },
  };
  const helpers = new HelpersService(
    prisma as any,
    undefined as any,
    undefined as any,
    undefined as any,
    undefined as any,
    undefined as any,
  );
  return { helpers, prisma };
};

describe('HelpersService.validateServiceAvailability', () => {
  it('rejects a service the store marked unavailable', async () => {
    const { helpers } = buildHelpers({ ...baseService, available: false });
    await expect(helpers.validateServiceAvailability(1, 10)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('accepts an active, available service on an open branch', async () => {
    const { helpers } = buildHelpers(baseService);
    await expect(helpers.validateServiceAvailability(1, 10)).resolves.toBeDefined();
  });

  it('still rejects a service pending moderation, independent of availability', async () => {
    const { helpers } = buildHelpers({
      ...baseService,
      status: ServiceStatus.PENDING,
    });
    await expect(helpers.validateServiceAvailability(1, 10)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
