/* eslint-disable no-console */
// Development-only, idempotent seed for testing the Banner feature from Swagger.
//
// It builds the minimum dependency graph needed to create every banner type:
//   City -> Module -> Store -> Branch(A,B) -> BranchZone -> Zone(1,2,3)
//                          \-> Category -> Service
// then 6 sample banners (general/store/category/service/zone/special-driver).
//
// Records are matched by an English `name` marker, so re-running NEVER creates
// duplicates and NEVER touches non-test data. No IDs are hardcoded — every
// foreign key is read back from the record this script created/found.
//
// Run:  npm run seed:banners:test
import { BannerTargetType, PrismaClient, ServiceStatus } from '@prisma/client';

const prisma = new PrismaClient();

// Existing uploaded asset (string only — the DB just stores the path).
const IMAGE = 'uploads/banner/078b3374-6beb-4403-8600-5593e377f668.jpg';

const name = (ar: string, en: string) => ({ ar, en });

// Closed square polygon (lat/lng objects) — same scheme as zone-city.seed.ts.
const box = (centerLat: number, centerLng: number, h = 0.01) => [
  { lat: centerLat - h, lng: centerLng - h },
  { lat: centerLat - h, lng: centerLng + h },
  { lat: centerLat + h, lng: centerLng + h },
  { lat: centerLat + h, lng: centerLng - h },
];

// Find an existing (non-deleted) record by its English name marker.
const findByMarker = (model: string, marker: string) =>
  (prisma as any)[model].findFirst({
    where: { name: { path: '$.en', string_contains: marker }, deletedAt: null },
  });

type BannerScalars = Record<string, unknown>;

// Idempotent banner upsert keyed by name marker; refreshes targeting and
// rebuilds zone links on every run.
async function upsertBanner(
  marker: string,
  scalars: BannerScalars,
  zoneIds: number[] = [],
): Promise<number> {
  const zoneCreate = zoneIds.map((zoneId) => ({ zoneId }));
  const existing = await findByMarker('banner', marker);

  if (existing) {
    await prisma.banner.update({
      where: { id: existing.id },
      data: {
        ...scalars,
        Zones: { deleteMany: {}, ...(zoneCreate.length ? { create: zoneCreate } : {}) },
      } as any,
    });
    return existing.id;
  }

  const created = await prisma.banner.create({
    data: { ...scalars, ...(zoneCreate.length ? { Zones: { create: zoneCreate } } : {}) } as any,
  });
  return created.id;
}

async function main() {
  await prisma.$connect();

  // --- City -----------------------------------------------------------------
  let city = await findByMarker('city', 'TEST_CITY');
  if (!city) {
    city = await prisma.city.create({
      data: { name: name('مدينة الاختبار', 'TEST_CITY') },
    });
  }

  // --- Store ----------------------------------------------------------------
  let store = await findByMarker('store', 'TEST_STORE');
  if (!store) {
    store = await prisma.store.create({
      data: {
        name: name('متجر الاختبار', 'TEST_STORE'),
        logo: IMAGE,
        cover: IMAGE,
        cityId: city.id,
        isStoreAccepted: true,
      },
    });
  }

  // --- Branches -------------------------------------------------------------
  let branchA = await findByMarker('branch', 'TEST_BRANCH_A');
  if (!branchA) {
    branchA = await prisma.branch.create({
      data: {
        storeId: store.id,
        name: name('فرع أ', 'TEST_BRANCH_A'),
        phone: '01000000001',
        address: 'Test address A',
        lat: 30.0,
        lng: 31.0,
        isActive: true,
        isMainBranch: true,
      },
    });
  }
  let branchB = await findByMarker('branch', 'TEST_BRANCH_B');
  if (!branchB) {
    branchB = await prisma.branch.create({
      data: {
        storeId: store.id,
        name: name('فرع ب', 'TEST_BRANCH_B'),
        phone: '01000000002',
        address: 'Test address B',
        lat: 30.1,
        lng: 31.1,
        isActive: true,
      },
    });
  }

  // --- Zones ----------------------------------------------------------------
  const ensureZone = async (marker: string, ar: string, i: number) => {
    let zone = await findByMarker('zone', marker);
    if (!zone) {
      zone = await prisma.zone.create({
        data: {
          name: name(ar, marker),
          coordinates: box(30 + i * 0.01, 31 + i * 0.01),
          cityId: city.id,
          active: true,
        },
      });
    }
    return zone;
  };
  const zone1 = await ensureZone('TEST_ZONE_1', 'منطقة ١', 1);
  const zone2 = await ensureZone('TEST_ZONE_2', 'منطقة ٢', 2);
  const zone3 = await ensureZone('TEST_ZONE_3', 'منطقة ٣', 3);

  // --- Branch <-> Zone links: A->1, A->2, B->3 ------------------------------
  const link = (branchId: number, zoneId: number) =>
    prisma.branchZone.upsert({
      where: { branchId_zoneId: { branchId, zoneId } },
      update: {},
      create: { branchId, zoneId },
    });
  await link(branchA.id, zone1.id);
  await link(branchA.id, zone2.id);
  await link(branchB.id, zone3.id);

  // --- Catalog: Category (module-scoped) + Service (store + category) -------
  let category = await findByMarker('category', 'TEST_CATEGORY');
  if (!category) {
    category = await prisma.category.create({
      data: {
        name: name('فئة الاختبار', 'TEST_CATEGORY'),
        storeId: store.id,
        active: true,
      },
    });
  }

  let service = await findByMarker('service', 'TEST_SERVICE');
  if (!service) {
    service = await prisma.service.create({
      data: {
        name: name('خدمة الاختبار', 'TEST_SERVICE'),
        description: name('خدمة لاختبار البانرات', 'Banner testing service'),
        image: IMAGE,
        durationMinutes: 60,
        price: 100,
        status: ServiceStatus.ACTIVE,
        available: true,
        storeId: store.id,
        categoryId: category.id,
      },
    });
  }

  // --- Sample banners (all currently inside the scheduling window) ----------
  const now = Date.now();
  const startDate = new Date(now - 24 * 60 * 60 * 1000); // yesterday
  const endDate = new Date(now + 30 * 24 * 60 * 60 * 1000); // +30 days
  const win = { active: true, startDate, endDate };

  const general = await upsertBanner('TEST_BANNER_GENERAL', {
    name: name('بانر عام', 'TEST_BANNER_GENERAL'),
    image: IMAGE,
    targetType: BannerTargetType.GENERAL,
    order: 1,
    ...win,
  });

  const storeBanner = await upsertBanner('TEST_BANNER_STORE', {
    name: name('بانر متجر', 'TEST_BANNER_STORE'),
    image: IMAGE,
    targetType: BannerTargetType.STORE,
    order: 2,
    storeId: store.id,
    ...win,
  });

  const categoryBanner = await upsertBanner('TEST_BANNER_CATEGORY', {
    name: name('بانر فئة', 'TEST_BANNER_CATEGORY'),
    image: IMAGE,
    targetType: BannerTargetType.CATEGORY,
    order: 3,
    storeId: store.id,
    categoryId: category.id,
    ...win,
  });

  const serviceBanner = await upsertBanner(
    'TEST_BANNER_SERVICE',
    {
      name: name('بانر خدمة', 'TEST_BANNER_SERVICE'),
      image: IMAGE,
      targetType: BannerTargetType.SERVICE,
      order: 4,
      storeId: store.id,
      categoryId: category.id,
      serviceId: service.id,
      ...win,
    },
    [zone1.id, zone2.id],
  );

  const zoneBanner = await upsertBanner(
    'TEST_BANNER_ZONE',
    {
      name: name('بانر منطقة', 'TEST_BANNER_ZONE'),
      image: IMAGE,
      targetType: BannerTargetType.ZONE,
      order: 5,
      storeId: store.id,
      ...win,
    },
    [zone1.id, zone2.id, zone3.id],
  );

  const specialDriver = await upsertBanner('TEST_BANNER_SPECIAL_DRIVER', {
    name: name('مندوب خاص', 'TEST_BANNER_SPECIAL_DRIVER'),
    image: IMAGE,
    targetType: BannerTargetType.SPECIAL_DRIVER,
    order: 6,
    ...win,
  });

  printSummary({
    storeId: store.id,
    branchIds: [branchA.id, branchB.id],
    categoryId: category.id,
    serviceId: service.id,
    zoneIds: [zone1.id, zone2.id, zone3.id],
    banners: {
      general,
      store: storeBanner,
      category: categoryBanner,
      service: serviceBanner,
      zone: zoneBanner,
      specialDriver,
    },
  });
}

function printSummary(d: {
  storeId: number;
  branchIds: number[];
  categoryId: number;
  serviceId: number;
  zoneIds: number[];
  banners: {
    general: number;
    store: number;
    category: number;
    service: number;
    zone: number;
    specialDriver: number;
  };
}) {
  const lines = [
    '====================================',
    'Banner Test Data Ready',
    '====================================',
    '',
    `Store ID: ${d.storeId}`,
    '',
    'Branch IDs:',
    ...d.branchIds.map((id) => `- ${id}`),
    '',
    `Category ID: ${d.categoryId}`,
    '',
    `Service ID: ${d.serviceId}`,
    '',
    'Zone IDs:',
    ...d.zoneIds.map((id) => `- ${id}`),
    '',
    'Banner IDs:',
    `- ${d.banners.general} (General)`,
    `- ${d.banners.store} (Store)`,
    `- ${d.banners.category} (Category)`,
    `- ${d.banners.service} (Service)`,
    `- ${d.banners.zone} (Zone)`,
    `- ${d.banners.specialDriver} (Special Driver)`,
    '====================================',
  ];
  console.log(lines.join('\n'));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
