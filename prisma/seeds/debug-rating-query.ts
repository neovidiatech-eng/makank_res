import * as dotenv from 'dotenv';
dotenv.config();

import { PrismaClient } from '@prisma/client';
import { getStoreRatingArgsWithSelect } from 'src/_modules/rating/prisma-args/rating.prisma.args';

const prisma = new PrismaClient();

async function main() {
  await prisma.$connect();

  console.log('--- Simulating RatingService.findAll for Store User (storeId = 123) ---');
  
  // Simulate the filters created by the controller and interceptors:
  // For a STORE user, filters.storeId is injected as user.storeId (123)
  const filters = {
    storeId: 123,
  };

  const storeRatings = await prisma.storeRating.findMany({
    ...getStoreRatingArgsWithSelect(filters),
  });

  console.log('Result length:', storeRatings.length);
  console.log('Ratings fetched:', JSON.stringify(storeRatings, null, 2));

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
