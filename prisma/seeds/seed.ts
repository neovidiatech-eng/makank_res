/* eslint-disable no-console */
// prisma/seeds/index.ts
import { PrismaClient } from '@prisma/client';
import { seedAdmin } from './admin.seed';
import { seedLanguage } from './language.seed';
import {
  seedPermissions,
  seedRolePermissions,
  seedRoles,
} from './permissionAndRoles.seed';
import { seedCustomer } from './customer.seed';
import { seedNotification } from './notification.seed';
import { seedCoupon } from './coupon.seed';
import { seedStore } from './store.seed';
import { seedBanner } from './banner.seed';
import { seedCity } from './city.seed';
import { seedPlan } from './plan.seed';
import { seedService } from './service.seed';
import { seedSettings } from './settings.seed';
import { seedComprehensiveData } from './comprehensive.seed';
import { seedStoreTemplates } from './store-template.seed';

const prisma = new PrismaClient();


async function main() {
  await prisma.$connect();
  await seedLanguage(prisma);
  await seedPermissions(prisma);
  await seedRoles(prisma);
  await seedRolePermissions(prisma);
  await seedAdmin(prisma);
  await seedNotification(prisma);
  await seedSettings(prisma);
  // await prisma.settings.deleteMany().catch(() => {});
  await seedComprehensiveData(prisma);
  // await seedStoreTemplates(prisma);

  await prisma.$disconnect();
}


main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
