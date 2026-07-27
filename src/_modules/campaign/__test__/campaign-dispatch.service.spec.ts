import { CampaignType } from '@prisma/client';
import { CampaignDispatchService } from '../services/campaign-dispatch.service';

const buildCampaign = (overrides: Partial<any> = {}) => ({
  id: 1,
  type: CampaignType.NOTIFICATION,
  title: { ar: 'عنوان', en: 'Title' },
  description: { ar: 'وصف', en: 'Body' },
  targetType: 'CUSTOMER',
  targetUserIds: null,
  storeId: null,
  serviceId: null,
  sentAt: null,
  image: 'uploads/campaign/offer.png',
  ...overrides,
});

const buildService = (campaign: any, recipients: { id: number }[]) => {
  const sendLocalizedNotification = jest.fn().mockResolvedValue(undefined);
  const prisma = {
    campaign: {
      findUnique: jest.fn().mockResolvedValue(campaign),
      update: jest.fn(),
    },
    user: { findMany: jest.fn().mockResolvedValue(recipients) },
  } as any;

  const service = new CampaignDispatchService(prisma, {
    sendLocalizedNotification,
  } as any);

  return { service, prisma, sendLocalizedNotification };
};

describe('CampaignDispatchService.dispatchForCampaign', () => {
  it('forwards the campaign image to every recipient push', async () => {
    const campaign = buildCampaign();
    const { service, sendLocalizedNotification } = buildService(campaign, [
      { id: 10 },
      { id: 11 },
    ]);

    await service.dispatchForCampaign(1);

    expect(sendLocalizedNotification).toHaveBeenCalledTimes(2);
    for (const call of sendLocalizedNotification.mock.calls) {
      expect(call[7]).toBe('uploads/campaign/offer.png');
    }
  });

  it('passes undefined (not null) when the campaign has no image', async () => {
    const campaign = buildCampaign({ image: null });
    const { service, sendLocalizedNotification } = buildService(campaign, [
      { id: 10 },
    ]);

    await service.dispatchForCampaign(1);

    expect(sendLocalizedNotification.mock.calls[0][7]).toBeUndefined();
  });
});
