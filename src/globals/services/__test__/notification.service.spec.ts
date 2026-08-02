const sendEachForMulticast = jest
  .fn()
  .mockResolvedValue({ responses: [], successCount: 1, failureCount: 0 });

jest.mock('firebase-admin', () => ({
  apps: [{}], // pretend Firebase is already initialized
  messaging: () => ({ sendEachForMulticast }),
  credential: { cert: jest.fn() },
  initializeApp: jest.fn(),
}));

import { NotificationService } from '../notification.service';

const buildPrisma = () => ({
  session: {
    findMany: jest.fn().mockResolvedValue([
      { fcmToken: 'token-1', languageId: 'ar' },
    ]),
  },
  notification: { create: jest.fn() },
});

describe('NotificationService.sendLocalizedNotification — image URL resolution', () => {
  const originalEnvMock = (global.env as jest.Mock).getMockImplementation();

  const setMainUrl = (value: string) => {
    (global.env as jest.Mock).mockImplementation((key: string) =>
      key === 'MAIN_URL' ? value : originalEnvMock(key),
    );
  };

  afterEach(() => {
    (global.env as jest.Mock).mockImplementation(originalEnvMock);
  });

  beforeEach(() => {
    sendEachForMulticast.mockClear();
  });

  it('routes a relative uploaded path through /api/media?media= using MAIN_URL', async () => {
    setMainUrl('https://api.makanak-app.com');
    const prisma = buildPrisma();
    const service = new NotificationService(prisma as any);

    await service.sendLocalizedNotification(
      1,
      { ar: 'عنوان', en: 'Title' },
      { ar: 'نص', en: 'Body' },
      undefined,
      undefined,
      undefined,
      undefined,
      'uploads/campaign/offer.png',
    );

    const sentMessage = sendEachForMulticast.mock.calls[0][0];
    expect(sentMessage.notification.imageUrl).toBe(
      'https://api.makanak-app.com/api/media?media=uploads/campaign/offer.png',
    );
    expect(sentMessage.android.notification.image).toBe(
      'https://api.makanak-app.com/api/media?media=uploads/campaign/offer.png',
    );
    // The already-published mobile build reads the foreground/custom-banner
    // image from data.imageUrl specifically — both keys must be present.
    expect(sentMessage.data.image).toBe(
      'https://api.makanak-app.com/api/media?media=uploads/campaign/offer.png',
    );
    expect(sentMessage.data.imageUrl).toBe(
      'https://api.makanak-app.com/api/media?media=uploads/campaign/offer.png',
    );
  });

  it('leaves an already-absolute image URL untouched', async () => {
    setMainUrl('https://api.makanak-app.com');
    const prisma = buildPrisma();
    const service = new NotificationService(prisma as any);

    await service.sendLocalizedNotification(
      1,
      { ar: 'عنوان', en: 'Title' },
      { ar: 'نص', en: 'Body' },
      undefined,
      undefined,
      undefined,
      undefined,
      'https://cdn.example.com/offer.png',
    );

    const sentMessage = sendEachForMulticast.mock.calls[0][0];
    expect(sentMessage.notification.imageUrl).toBe(
      'https://cdn.example.com/offer.png',
    );
  });

  it('drops the image (but still sends the text notification) when MAIN_URL is malformed', async () => {
    setMainUrl('http://localhost:${PORT}');
    const prisma = buildPrisma();
    const service = new NotificationService(prisma as any);

    await service.sendLocalizedNotification(
      1,
      { ar: 'عنوان', en: 'Title' },
      { ar: 'نص', en: 'Body' },
      undefined,
      undefined,
      undefined,
      undefined,
      'uploads/campaign/offer.png',
    );

    const sentMessage = sendEachForMulticast.mock.calls[0][0];
    expect(sentMessage.notification.imageUrl).toBeUndefined();
    expect(sentMessage.notification.title).toBe('عنوان');
  });
});

describe('NotificationService.sendLocalizedNotification — language selection', () => {
  beforeEach(() => {
    sendEachForMulticast.mockClear();
  });

  it('uses the most recently created session language, not just the first row returned', async () => {
    const prisma = {
      session: {
        findMany: jest.fn(async ({ orderBy }: any) => {
          // Simulate the DB actually respecting orderBy: the stale 'en'
          // session was created first, the correct 'ar' session is newer.
          const rows = [
            { fcmToken: 'stale-token', languageId: 'en', createdAt: new Date('2024-01-01') },
            { fcmToken: 'fresh-token', languageId: 'ar', createdAt: new Date('2024-06-01') },
          ];
          if (orderBy?.createdAt === 'desc') {
            return [...rows].sort((a, b) => +b.createdAt - +a.createdAt);
          }
          return rows;
        }),
      },
      notification: { create: jest.fn() },
    };
    const service = new NotificationService(prisma as any);

    await service.sendLocalizedNotification(
      1,
      { ar: 'عنوان عربي', en: 'English title' },
      { ar: 'نص عربي', en: 'English body' },
    );

    expect(prisma.session.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { createdAt: 'desc' } }),
    );
    const sentMessage = sendEachForMulticast.mock.calls[0][0];
    expect(sentMessage.notification.title).toBe('عنوان عربي');
    expect(sentMessage.notification.body).toBe('نص عربي');
  });

  it('falls back to the other language when the target language is an empty string', async () => {
    const prisma = {
      session: {
        findMany: jest.fn().mockResolvedValue([
          { fcmToken: 'token-1', languageId: 'ar', createdAt: new Date() },
        ]),
      },
      notification: { create: jest.fn() },
    };
    const service = new NotificationService(prisma as any);

    // Admin left the Arabic body blank — only English was filled in.
    await service.sendLocalizedNotification(
      1,
      { ar: 'عنوان عربي', en: 'English title' },
      { ar: '', en: 'English body only' },
    );

    const sentMessage = sendEachForMulticast.mock.calls[0][0];
    expect(sentMessage.notification.body).toBe('English body only');
  });
});
