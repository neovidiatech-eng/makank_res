// prisma/seeds/notificationSettings.ts
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { RolesKeys } from 'src/_modules/authorization/providers/roles';

export async function seedCustomer(prisma: PrismaClient) {
  const count = await prisma.user.count({
    where: {
      roleKey: RolesKeys.CUSTOMER, // Assuming roleId 2 is for customers
    },
  });
  if (count > 0) {
    return;
  }
  for (let i = 1; i <= 1; i += 1) {
    const role = await prisma.role.findFirst({
      where: { roleKey: RolesKeys.CUSTOMER },
    });
    const data = {
      name: `customer${i}`,
      email: `customer${i}@user.com`,
      phone: `+966 0509999${i}`,
      roleKey: RolesKeys.CUSTOMER,
      roleId: role.id,
      verified: true,
      password: bcrypt.hashSync(process.env.PASSWORD, +process.env.HASH_SALT),
    };
    await prisma.user.upsert({
      where: {
        id: i,
      },
      create: {
        ...data,
        Details: {
          create: {
            wallet: 0.0,
          },
        },
      },
      update: data,
    });
  }
  // eslint-disable-next-line no-console
  console.log('✅ Customer seeded');
}
