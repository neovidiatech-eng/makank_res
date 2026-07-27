// prisma/seeds/notificationSettings.ts
import { PrismaClient, Service } from '@prisma/client';

export async function seedService(prisma: PrismaClient) {
  const count = await prisma.service.count({
    where: {},
  });
  if (count > 0) {
    return;
  }
  for (let i = 1; i <= 1; i += 1) {
    // const data: Service = {
    //   id: i,
    //   name: {en: `Service ${i}`, ar: `خدمة ${i}`},
    //   description: {en: `Description for Service ${i}`, ar: `وصف خدمة ${i}`},
    //   image: `uploads/service-image-${i}.png`,
    //   durationMinutes: 60,
    //   availableFrom: new Date(),
    //   availableTo: new Date(),
    //   price: 100,
    //   priceAfterDiscount: 80,
    //   discount: 20,
    //   discountType: 'AMOUNT',
    //   status: 'PENDING',
    //   totalOrders: 0,
    //   totalAmountSold: 0,
    //   rating: 0,
    //   review: 0,
    //   bestRated: false,
    //   mostSeller: false,
    //   createdAt: new Date(),
    //   deletedAt: null,
    //   storeId: 1,
    // };
    // await prisma.service.upsert({
    //   where: {
    //     id: i,
    //   },
    //   create: data,
    //   update: data,
    // });
  }
  // eslint-disable-next-line no-console
  console.log('✅ Service seeded');
}
