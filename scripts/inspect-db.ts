import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const cities = await prisma.city.findMany({
    include: {
      Zone: true,
      Store: true,
    },
  });
  console.log('--- CITIES & ZONES & STORES ---');
  for (const c of cities) {
    console.log(`City [${c.id}]: ${JSON.stringify(c.name)} | lat: ${c.lat}, lng: ${c.lng} | Zones: ${c.Zone.length}, Stores: ${c.Store.length}`);
    for (const z of c.Zone) {
      console.log(`   Zone [${z.id}]: ${JSON.stringify(z.name)} | deliveryPrice: ${z.deliveryPrice}`);
    }
  }

  const usersCount = await prisma.user.count();
  const storesCount = await prisma.store.count();
  const ordersCount = await prisma.order.count();
  const roles = await prisma.role.findMany({ select: { id: true, name: true, roleKey: true } });

  console.log('--- TOTAL COUNTS ---');
  console.log({ usersCount, storesCount, ordersCount, roles });
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
