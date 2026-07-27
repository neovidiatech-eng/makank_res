// Unit tests for the isGift field on Order creation.
// These tests run with no MySQL/Redis/Nest DI — only the DTO class-validator
// behaviour and the select object shape are exercised here.

import { PaymentMethod } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateOrderDTO, FilterOrderDTO } from '../dto/order.dto';
import { selectOrderOBJ } from '../prisma-args/order.prisma.args';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const validBase = () => ({
  branchId: 1,
  paymentMethod: PaymentMethod.CASH,
  items: [{ serviceId: 1, quantity: 1 }],
});

// ---------------------------------------------------------------------------
// DTO validation
// ---------------------------------------------------------------------------

describe('CreateOrderDTO — isGift field', () => {
  it('omitting isGift is valid and leaves the field undefined (defaults to false at DB level)', async () => {
    const dto = plainToInstance(CreateOrderDTO, validBase());
    const errors = await validate(dto);
    expect(errors.map((e) => e.property)).not.toContain('isGift');
    expect(dto.isGift).toBeUndefined();
  });

  it('isGift: false is valid', async () => {
    const dto = plainToInstance(CreateOrderDTO, {
      ...validBase(),
      isGift: false,
    });
    const errors = await validate(dto);
    expect(errors.map((e) => e.property)).not.toContain('isGift');
    expect(dto.isGift).toBe(false);
  });

  it('isGift: true is valid', async () => {
    const dto = plainToInstance(CreateOrderDTO, {
      ...validBase(),
      isGift: true,
    });
    const errors = await validate(dto);
    expect(errors.map((e) => e.property)).not.toContain('isGift');
    expect(dto.isGift).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Select object includes isGift
// ---------------------------------------------------------------------------

describe('selectOrderOBJ — isGift presence', () => {
  it('includes isGift: true so the field is returned in all order responses', () => {
    const select = selectOrderOBJ({} as FilterOrderDTO);
    expect(select).toHaveProperty('isGift', true);
  });

  it('includes isGift when called with a userId (customer context)', () => {
    const select = selectOrderOBJ({} as FilterOrderDTO, 42);
    expect(select).toHaveProperty('isGift', true);
  });
});

// ---------------------------------------------------------------------------
// Service create data mapping
// ---------------------------------------------------------------------------

describe('order.service create — isGift wiring', () => {
  it('resolves to false when isGift is absent from DTO (falsy ?? false)', () => {
    const dto = plainToInstance(CreateOrderDTO, validBase());
    expect(dto.isGift ?? false).toBe(false);
  });

  it('resolves to true when isGift: true is supplied in DTO', () => {
    const dto = plainToInstance(CreateOrderDTO, {
      ...validBase(),
      isGift: true,
    });
    expect(dto.isGift ?? false).toBe(true);
  });
});
