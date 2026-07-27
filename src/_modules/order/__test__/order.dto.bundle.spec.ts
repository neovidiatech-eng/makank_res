import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import 'reflect-metadata';
import { CalculateOrderDTO } from '../dto/order.dto';

describe('CalculateOrderDTO bundle selection validation', () => {
  it('rejects malformed nested bundleSelections', async () => {
    const dto = plainToInstance(CalculateOrderDTO, {
      branchId: 1,
      bundleSelections: [
        { bundleId: 'not-a-number', paidItems: 'not-an-array', freeItems: [] },
      ],
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('accepts a well-formed bundle selection', async () => {
    const dto = plainToInstance(CalculateOrderDTO, {
      branchId: 1,
      bundleSelections: [
        {
          bundleId: 1,
          paidItems: [{ serviceId: 10, quantity: 2 }],
          freeItems: [{ serviceId: 20, quantity: 1 }],
        },
      ],
    });
    const errors = await validate(dto);
    expect(
      errors.filter((error) => error.property === 'bundleSelections'),
    ).toHaveLength(0);
  });
});
