import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const userId = 1493;
  await prisma.$connect();

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      roleKey: true,
      Role: {
        select: {
          id: true,
          name: true,
          roleKey: true,
          default: true,
        },
      },
    },
  });

  if (!user) {
    console.log(`User with ID ${userId} not found.`);
    await prisma.$disconnect();
    return;
  }

  console.log('=== USER INFO ===');
  console.log(user);

  const permissions = await prisma.rolePermission.findMany({
    where: { roleId: user.Role.id },
    select: {
      Permission: {
        select: {
          prefix: true,
          method: true,
        },
      },
    },
  });

  console.log('\n=== PERMISSIONS IN DATABASE FOR THIS ROLE ===');
  console.log(permissions.map((p) => `${p.Permission.prefix}_${p.Permission.method}`));

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
