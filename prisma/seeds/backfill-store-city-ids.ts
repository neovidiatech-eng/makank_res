// One-off, production-safe script: sets Store.cityId for every existing
// store, computed from its main branch's lat/lng — the exact same logic
// StoreService.create()/update() now apply automatically going forward
// (resolveCityForPoint: nearest active city whose radius+toleranceRadius
// covers the point). Stores created/updated BEFORE that change never had
// cityId set at all, so the new "customer only sees restaurants inside
// their own city" gating and the city-distance checkout guard both have no
// effect on them until this runs once.
//
// Purely additive/corrective: only writes Store.cityId, only on rows where
// it's currently null (never overwrites an existing value), never deletes
// anything. Idempotent — safe to re-run; already-set stores are skipped.
//
// Run on the target server, from the repo root:
//   npx ts-node -r tsconfig-paths/register prisma/seeds/backfill-store-city-ids.ts

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function toRad(value: number): number {
  return (value * Math.PI) / 180;
}

function calculateDistanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371e3;
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δφ = toRad(lat2 - lat1);
  const Δλ = toRad(lng2 - lng1);
  const a =
    Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function main() {
  await prisma.$connect();

  const cities = await prisma.city.findMany({
    where: { active: true, lat: { not: null }, lng: { not: null } },
    select: { id: true, lat: true, lng: true, radius: true, toleranceRadius: true },
  });

  if (!cities.length) {
    console.log('No active city has lat/lng set yet — nothing to backfill against.');
    await prisma.$disconnect();
    return;
  }

  const stores = await prisma.store.findMany({
    where: { cityId: null, deletedAt: null },
    select: {
      id: true,
      name: true,
      branches: {
        where: { isMainBranch: true },
        select: { lat: true, lng: true },
        take: 1,
      },
    },
  });

  let matched = 0;
  let noBranchLocation = 0;
  let noCoveringCity = 0;

  for (const store of stores) {
    const branch = store.branches[0];
    if (!branch?.lat || !branch?.lng) {
      noBranchLocation++;
      continue;
    }

    let nearest: { id: number; distanceKm: number } | null = null;
    for (const city of cities) {
      const distKm =
        calculateDistanceMeters(city.lat!, city.lng!, branch.lat, branch.lng) / 1000;
      const maxAllowedKm = (city.radius ?? 15) + (city.toleranceRadius ?? 5);
      if (distKm > maxAllowedKm) continue;
      if (!nearest || distKm < nearest.distanceKm) {
        nearest = { id: city.id, distanceKm: distKm };
      }
    }

    if (!nearest) {
      noCoveringCity++;
      console.log(`Store #${store.id} — no active city covers its location, left null.`);
      continue;
    }

    await prisma.store.update({
      where: { id: store.id },
      data: { cityId: nearest.id },
    });
    matched++;
    console.log(`Store #${store.id} → city #${nearest.id} (${nearest.distanceKm.toFixed(1)} km away)`);
  }

  console.log(
    `\n✅ Done. ${matched} store(s) matched to a city, ${noCoveringCity} store(s) not covered by any active city, ${noBranchLocation} store(s) with no main-branch location set.`,
  );

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
