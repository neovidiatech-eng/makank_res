import * as dotenv from 'dotenv';
dotenv.config();

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  await prisma.$connect();

  console.log('=== RATING 122 INFO ===');
  const rating = await prisma.storeRating.findUnique({
    where: { id: 122 },
    include: {
      Branch: true,
      store: true,
      Order: {
        select: {
          id: true,
          branchId: true,
          Branch: {
            select: {
              id: true,
              storeId: true,
              Store: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!rating) {
    console.log('Rating with ID 122 not found.');
    await prisma.$disconnect();
    return;
  }

  console.log(JSON.stringify(rating, null, 2));

  console.log('\n=== STORE USERS FOR THIS STORE ===');
  const storeId = rating.storeId || rating.Branch?.storeId;
  if (storeId) {
    const users = await prisma.user.findMany({
      where: {
        storeId: storeId,
        roleKey: 'Store',
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        roleKey: true,
        branchId: true,
        storeId: true,
      },
    });
    console.log(users);
  } else {
    console.log('No storeId found for this rating.');
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
