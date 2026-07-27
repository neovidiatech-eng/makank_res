// templateId must only be settable at store creation; PATCH /stores/:id should
// never silently accept it (template application happens only through the
// dedicated apply-template endpoint). UpdateStoreDTO explicitly omits it from
// the PartialType(CreateStoreDTO) inheritance — these tests guard that.
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import 'reflect-metadata';
import { UpdateStoreDTO } from '../dto/store.dto';

const PIPE_OPTS = {
  whitelist: true,
  forbidNonWhitelisted: true,
  stopAtFirstError: true,
};

const run = async (body: Record<string, unknown>) => {
  const dto = plainToInstance(UpdateStoreDTO, body);
  const errors = await validate(dto, PIPE_OPTS);
  return errors;
};

describe('UpdateStoreDTO — templateId exclusion', () => {
  it('rejects templateId as an unknown/forbidden property', async () => {
    const errors = await run({ templateId: 5 });
    const messages = errors.flatMap((e) => Object.values(e.constraints ?? {}));
    expect(messages.some((m) => m.includes('templateId'))).toBe(true);
  });

  it('still allows a plain update with no templateId', async () => {
    const errors = await run({ temporarilyClosed: true });
    expect(errors).toHaveLength(0);
  });
});
