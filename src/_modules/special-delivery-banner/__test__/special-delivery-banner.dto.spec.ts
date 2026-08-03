// DTO-level tests for CreateSpecialDeliveryBannerDTO — a clone of
// CreateBannerDTO, see src/_modules/banner/__test__/banner.dto.spec.ts for
// the original. Exercises the class-transformer transforms + class-validator
// constraints exactly as the global ValidationPipe would.
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import 'reflect-metadata';
import { CreateSpecialDeliveryBannerDTO } from '../dto/special-delivery-banner.dto';

const PIPE_OPTS = {
  whitelist: true,
  forbidNonWhitelisted: true,
  stopAtFirstError: true,
};

const run = async (body: Record<string, unknown>) => {
  const dto = plainToInstance(CreateSpecialDeliveryBannerDTO, body);
  const errors = await validate(dto, PIPE_OPTS);
  return { dto, errors };
};

const flattenMessages = (errors: Awaited<ReturnType<typeof run>>['errors']) =>
  errors.flatMap((e) => Object.values(e.constraints ?? {}));

const GENERAL_BASE = {
  name: { ar: 'بانر توصيل خاص', en: 'Special Delivery Banner' },
  image: 'uploads/special-delivery-banner/x.webp',
  targetType: 'GENERAL',
  order: '1',
  startDate: '2026-06-06T19:42:11.312Z',
  endDate: '2026-06-07T19:42:11.312Z',
};

describe('CreateSpecialDeliveryBannerDTO — empty-string normalisation (multipart)', () => {
  it('normalises empty optional id fields to undefined and validates clean', async () => {
    const { dto, errors } = await run({
      ...GENERAL_BASE,
      storeId: '',
      categoryId: '',
      serviceId: '',
      zoneIds: '',
    });

    expect(errors).toHaveLength(0);
    expect(dto.storeId).toBeUndefined();
    expect(dto.zoneIds).toBeUndefined();
  });

  it('creates from a GENERAL banner with no optional targeting fields at all', async () => {
    const { dto, errors } = await run({ ...GENERAL_BASE });
    expect(errors).toHaveLength(0);
    expect(dto.storeId).toBeUndefined();
  });

  it('coerces numeric/date strings to their real types', async () => {
    const { dto, errors } = await run({ ...GENERAL_BASE, order: '1' });
    expect(errors).toHaveLength(0);
    expect(dto.order).toBe(1);
    expect(dto.startDate).toBeInstanceOf(Date);
    expect(dto.endDate).toBeInstanceOf(Date);
  });
});

describe('CreateSpecialDeliveryBannerDTO — date window validation', () => {
  it('rejects endDate before startDate with a clear message', async () => {
    const { errors } = await run({
      ...GENERAL_BASE,
      startDate: '2026-06-07T19:42:11.312Z',
      endDate: '2026-06-06T19:42:11.312Z',
    });
    const messages = flattenMessages(errors);
    expect(messages).toContain('endDate must be after startDate');
  });

  it('accepts endDate strictly after startDate', async () => {
    const { errors } = await run({
      ...GENERAL_BASE,
      startDate: '2026-06-06T19:42:11.312Z',
      endDate: '2026-06-07T19:42:11.312Z',
    });
    expect(errors).toHaveLength(0);
  });
});

describe('CreateSpecialDeliveryBannerDTO — enum + array validation', () => {
  it('rejects an invalid targetType', async () => {
    const { errors } = await run({ ...GENERAL_BASE, targetType: 'NOT_A_TYPE' });
    const props = errors.map((e) => e.property);
    expect(props).toContain('targetType');
  });

  it('rejects a non-numeric zoneIds entry', async () => {
    const { errors } = await run({ ...GENERAL_BASE, zoneIds: '1,abc' });
    const props = errors.map((e) => e.property);
    expect(props).toContain('zoneIds');
  });
});
