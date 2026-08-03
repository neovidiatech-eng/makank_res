// DTO-level tests for banner creation input handling. These exercise the
// class-transformer transforms + class-validator constraints exactly as the
// global ValidationPipe would (transform: true, stopAtFirstError: true), so
// they cover the multipart/empty-string normalisation that the HTTP layer
// depends on — without booting Nest, MySQL or Redis.
//
// IMPORTANT: optional id fields are left empty/omitted in the happy paths so
// `@IsOptional()` short-circuits the async `@ValidateExist` DB constraint. No
// case here provides a "real" id that would trigger a Prisma query.
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import 'reflect-metadata';
import { CreateBannerDTO } from '../dto/banner.dto';

const PIPE_OPTS = {
  whitelist: true,
  forbidNonWhitelisted: true,
  stopAtFirstError: true,
};

// Mirror the global pipe: transform the plain (string-y, multipart-like) body
// into the DTO, then validate. Returns the instance + validation errors.
const run = async (body: Record<string, unknown>) => {
  const dto = plainToInstance(CreateBannerDTO, body);
  const errors = await validate(dto, PIPE_OPTS);
  return { dto, errors };
};

const flattenMessages = (errors: Awaited<ReturnType<typeof run>>['errors']) =>
  errors.flatMap((e) => Object.values(e.constraints ?? {}));

const GENERAL_BASE = {
  name: { ar: 'بانر عام', en: 'General Banner' },
  image: 'uploads/banner/x.webp',
  targetType: 'GENERAL',
  order: '1',
  startDate: '2026-06-06T19:42:11.312Z',
  endDate: '2026-06-07T19:42:11.312Z',
};

describe('CreateBannerDTO — empty-string normalisation (multipart)', () => {
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
    expect(dto.categoryId).toBeUndefined();
    expect(dto.serviceId).toBeUndefined();
    // empty zone list => no targeting (undefined), never [NaN]/[0]
    expect(dto.zoneIds).toBeUndefined();
  });

  it('never surfaces a broken EXIST validation for empty ids', async () => {
    const { errors } = await run({
      ...GENERAL_BASE,
      storeId: '',
      categoryId: '',
      serviceId: '',
      zoneIds: '',
    });
    const messages = flattenMessages(errors).join(' ');
    expect(messages).not.toContain('0EXIST0');
    expect(messages).not.toContain('EXIST');
    expect(messages).not.toContain(']*');
  });

  it('creates from a GENERAL banner with no optional targeting fields at all', async () => {
    const { dto, errors } = await run({ ...GENERAL_BASE });
    expect(errors).toHaveLength(0);
    expect(dto.storeId).toBeUndefined();
    expect(dto.zoneIds).toBeUndefined();
  });

  it('coerces numeric/date strings to their real types', async () => {
    const { dto, errors } = await run({ ...GENERAL_BASE, order: '1' });
    expect(errors).toHaveLength(0);
    expect(dto.order).toBe(1);
    expect(dto.startDate).toBeInstanceOf(Date);
    expect(dto.endDate).toBeInstanceOf(Date);
  });
});

describe('CreateBannerDTO — date window validation', () => {
  it('rejects startDate === endDate with a clear message', async () => {
    const sameTs = '2026-06-06T19:42:11.312Z';
    const { errors } = await run({
      ...GENERAL_BASE,
      startDate: sameTs,
      endDate: sameTs,
    });
    const messages = flattenMessages(errors);
    expect(messages).toContain('endDate must be after startDate');
  });

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

describe('CreateBannerDTO — enum + array validation', () => {
  it('rejects an invalid targetType', async () => {
    const { errors } = await run({ ...GENERAL_BASE, targetType: 'NOT_A_TYPE' });
    const props = errors.map((e) => e.property);
    expect(props).toContain('targetType');
  });

  it('rejects a non-numeric zoneIds entry', async () => {
    // "1,abc" -> [1, NaN]; the NaN makes @ValidateExist short-circuit (no DB)
    // and @IsNumber({each:true}) reports the format error.
    const { errors } = await run({ ...GENERAL_BASE, zoneIds: '1,abc' });
    const props = errors.map((e) => e.property);
    expect(props).toContain('zoneIds');
    const messages = flattenMessages(errors).join(' ');
    expect(messages).not.toContain(']*');
  });
});

describe('CreateBannerDTO — clickUrl (EXTERNAL_URL click action)', () => {
  it('accepts a well-formed https clickUrl', async () => {
    const { errors } = await run({
      ...GENERAL_BASE,
      targetType: 'EXTERNAL_URL',
      clickUrl: 'https://example.com/offer',
    });
    expect(errors).toHaveLength(0);
  });

  it('rejects a clickUrl with no protocol', async () => {
    const { errors } = await run({
      ...GENERAL_BASE,
      targetType: 'EXTERNAL_URL',
      clickUrl: 'example.com/offer',
    });
    const props = errors.map((e) => e.property);
    expect(props).toContain('clickUrl');
  });

  it('rejects a non-http(s) clickUrl', async () => {
    const { errors } = await run({
      ...GENERAL_BASE,
      targetType: 'EXTERNAL_URL',
      clickUrl: 'javascript:alert(1)',
    });
    const props = errors.map((e) => e.property);
    expect(props).toContain('clickUrl');
  });
});
