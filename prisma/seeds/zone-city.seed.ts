/* eslint-disable no-console */
// Minimal, standalone seed: a few cities + zones with real (closed) polygons so
// point-in-polygon zone resolution and the orders city/zone filters can be tested
// end-to-end — without the heavy comprehensive demo dataset.
//
// Run:  npx ts-node -r tsconfig-paths/register prisma/seeds/zone-city.seed.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// 2 cities, 2 non-overlapping zones (one per city). Same coordinate scheme as the
// comprehensive seed: zone i centered at (26.4207 + i*0.01, 50.0888 + i*0.01).
const ids = [1, 2];

function boxAround(centerLat: number, centerLng: number, h = 0.004) {
  return [
    { lat: centerLat - h, lng: centerLng - h },
    { lat: centerLat - h, lng: centerLng + h },
    { lat: centerLat + h, lng: centerLng + h },
    { lat: centerLat + h, lng: centerLng - h },
  ];
}

async function main() {
  await prisma.$connect();

  for (const i of ids) {
    const cityData = { name: { en: `City ${i}`, ar: `مدينة ${i}` } };
    await prisma.city.upsert({
      where: { id: i },
      update: cityData,
      create: { id: i, ...cityData },
    });

    const coordinates = boxAround(26.4207 + i * 0.01, 50.0888 + i * 0.01);
    await prisma.zone.upsert({
      where: { id: i },
      update: { cityId: i, coordinates, active: true },
      create: {
        id: i,
        name: { en: `Zone ${i}`, ar: `منطقة ${i}` },
        coordinates,
        cityId: i,
      },
    });

    const center = boxAround(26.4207 + i * 0.01, 50.0888 + i * 0.01, 0)[0];
    console.log(
      `✅ City ${i} + Zone ${i} seeded — test point inside: lat=${center.lat.toFixed(4)}, lng=${center.lng.toFixed(4)}`,
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
