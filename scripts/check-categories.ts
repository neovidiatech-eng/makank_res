import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: "mysql://makank_admin:StrongPassword123!@127.0.0.1:3306/makank_db",
    },
  },
});

async function main() {
  console.log('--- Categories for Store 112 ---');
  const categories = await prisma.category.findMany({
    where: { storeId: 112 },
  });
  console.log(JSON.stringify(categories, null, 2));

  console.log('--- Services for Store 112 ---');
  const services = await prisma.service.findMany({
    where: { storeId: 112 },
    select: {
      id: true,
      name: true,
      categoryId: true,
      Category: {
        select: {
          id: true,
          name: true,
          templateCategoryId: true,
        },
      },
    },
  });
  console.log(JSON.stringify(services, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
