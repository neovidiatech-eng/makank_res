// prisma/seeds/notificationSettings.ts
import { PrismaClient } from '@prisma/client';

export async function seedCoupon(prisma: PrismaClient) {
  const count = await prisma.coupon.count({
    where: {},
  });
  if (count > 0) {
    return;
  }
  for (let i = 1; i <= 1; i += 1) {
  
   
  }
  // eslint-disable-next-line no-console
  console.log('✅ Coupon seeded');
}
