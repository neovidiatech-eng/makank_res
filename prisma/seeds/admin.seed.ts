// prisma/seeds/notificationSettings.ts
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { RolesKeys } from 'src/_modules/authorization/providers/roles';
export async function seedAdmin(prisma: PrismaClient) {
  const createData = {
    id: 2,
    name: `admin`,
    email: "a@a.com",
    phone: `+966 05000000000`,
    roleKey: RolesKeys.ADMIN,
    verified: true,
    password: bcrypt.hashSync("Default@123", +process.env.HASH_SALT),
  };


   const role = await prisma.role.findFirst({
    where: { roleKey: RolesKeys.ADMIN },
  });
  await prisma.user.upsert({
    where: {
      id: 2,
    },
    create: {...createData,roleId:role.id},
    update: {
      roleKey: RolesKeys.ADMIN,
    },
  });

  await prisma.adminWallet.upsert({
    where: {
      id: 1,
    },
    update:{},
    create: {
      id: 1,
      totalEarning: 0,
      totalWithdrawn: 0,
      pendingWithdraw: 0,
      collectedCash: 0,
      currentBalance: 0,
    },
  });

  // eslint-disable-next-line no-console
  console.log('✅ Admin seeded');
}
