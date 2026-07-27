// prisma/seeds/notificationSettings.ts
import { PrismaClient, Store } from '@prisma/client';

export async function seedStore(prisma: PrismaClient) {
  const count = await prisma.store.count({
    where: {},
  });
  if (count > 0) {
    return;
  }
  for (let i = 1; i <= 1; i += 1) {
 

  }
  // eslint-disable-next-line no-console
  console.log('✅ Store seeded');
}
