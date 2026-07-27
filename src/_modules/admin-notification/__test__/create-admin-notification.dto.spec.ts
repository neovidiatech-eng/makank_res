import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import {
  CreateAdminNotificationDto,
  TargetType,
} from '../dto/create-admin-notification.dto';

const basePayload = {
  title: { ar: 'عنوان التنبيه', en: 'Notification Title' },
  body: { ar: 'محتوى التنبيه', en: 'Notification Body' },
  targetType: TargetType.ALL,
};

const validateDto = (payload: Record<string, unknown>) =>
  validate(plainToInstance(CreateAdminNotificationDto, payload));

describe('CreateAdminNotificationDto — title/body', () => {
  it('accepts bilingual object payloads (the shape clients actually send)', async () => {
    const errors = await validateDto({ ...basePayload });

    expect(errors).toHaveLength(0);
  });

  it('accepts a stringified JSON object for title/body', async () => {
    const errors = await validateDto({
      ...basePayload,
      title: JSON.stringify(basePayload.title),
      body: JSON.stringify(basePayload.body),
    });

    expect(errors).toHaveLength(0);
  });
});
