// prisma/seeds/notificationSettings.ts
import { City, PrismaClient } from '@prisma/client';

export async function seedCity(prisma: PrismaClient) {
  const data = {
    id: 1,
    name: { en: 'Dammam', ar: 'الدمام' },
  };
  await prisma.city.upsert({
    where: {
      id: 1,
    },
    create: data,
    update: data,
  });
  console.log('✅ City seeded');
}

