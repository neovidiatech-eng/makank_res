// prisma/seeds/notificationSettings.ts
import {  Plan, PrismaClient } from '@prisma/client';

export async function seedPlan(prisma: PrismaClient) {
  const count = await prisma.plan.count({
    where: {},
  });
  if (count > 0) {
    return;
  }
  for (let i = 1; i <= 1; i += 1) {
    const data: Plan = {
      id: i,
      name: `Plan ${i}`,
    };
    await prisma.plan.upsert({
      where: {
        id: i,
      },
      create: data,
      update: data,
    });
  }
  // eslint-disable-next-line no-console
  console.log('✅ Plan seeded');
}
