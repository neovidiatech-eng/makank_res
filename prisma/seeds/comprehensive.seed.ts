/* eslint-disable no-console */
/**
 * comprehensive.seed.ts
 *
 * Idempotent, Swagger-oriented test seed for the Makanak API.
 *
 * Design goals
 * ────────────
 * • Every upsert is keyed on a stable unique field — safe to re-run.
 * • All four personas (Admin, Store Owner, Customer, Driver) are created
 *   with known credentials so Swagger login works on first try.
 * • A Cairo zone polygon covers the test branch AND the customer address
 *   so point-in-polygon checks pass during order creation.
 * • DeliveryDetails for the driver is always created so orders that
 *   reference deliveryId don't violate FK constraints.
 * • 50-record bulk data for modules/cities/zones/stores/branches/services
 *   is preserved but placed AFTER the named test entities so IDs 1-4 are
 *   always the "known" test records.
 *
 * Test credentials (all roles)
 * ────────────────────────────
 *   Admin        admin@makanak.com   / Admin@1234   (roleKey: Admin)
 *   Store Owner  owner@makanak.com   / Owner@1234   (roleKey: Store)
 *   Customer     customer@makanak.com/ Customer@1234 (roleKey: Customer)
 *   Driver       driver@makanak.com  / Driver@1234  (roleKey: Delivery)
 *
 * Legacy admin (created by admin.seed.ts, kept for backward compat):
 *   Admin        a@a.com             / Default@123  (id: 2)
 */

import {
  PrismaClient,
  Days,
  PaymentStatus,
  PaymentMethod,
  OrderStatus,
  OrderType,
  ServiceStatus,
  OTPType,
  WithdrawStatus,
  PayoutMethod,
  CouponType,
  DiscountType,
  UserType,
  TransactionType,
  ComplaintStatus,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';

// ─── constants ──────────────────────────────────────────────────────────────

const HASH_SALT = 10;

const RolesKeys = {
  ADMIN: 'Admin',
  CUSTOMER: 'Customer',
  STORE: 'Store',
  DELIVERY: 'Delivery',
} as const;

/**
 * Role IDs as defined in the role provider files:
 *   AdminRole.id    = 1
 *   CustomerRole.id = 2
 *   DeliveryRole.id = 3
 *   StoreRole.id    = 4
 */
const RoleIds = {
  ADMIN: 1,
  CUSTOMER: 2,
  DELIVERY: 3,
  STORE: 4,
} as const;

// Cairo test geography ────────────────────────────────────────────────────────
// Zone polygon: a 0.05° box around central Cairo, covering the test branch
// (30.0500, 31.2400) and the customer address (30.0480, 31.2380).
const CAIRO_ZONE_CENTER = { lat: 30.0490, lng: 31.2390 };
const CAIRO_ZONE_HALF   = 0.02; // degrees — generous enough for all test points
const CAIRO_ZONE_COORDS = [
  { lat: CAIRO_ZONE_CENTER.lat - CAIRO_ZONE_HALF, lng: CAIRO_ZONE_CENTER.lng - CAIRO_ZONE_HALF },
  { lat: CAIRO_ZONE_CENTER.lat - CAIRO_ZONE_HALF, lng: CAIRO_ZONE_CENTER.lng + CAIRO_ZONE_HALF },
  { lat: CAIRO_ZONE_CENTER.lat + CAIRO_ZONE_HALF, lng: CAIRO_ZONE_CENTER.lng + CAIRO_ZONE_HALF },
  { lat: CAIRO_ZONE_CENTER.lat + CAIRO_ZONE_HALF, lng: CAIRO_ZONE_CENTER.lng - CAIRO_ZONE_HALF },
  // close the polygon
  { lat: CAIRO_ZONE_CENTER.lat - CAIRO_ZONE_HALF, lng: CAIRO_ZONE_CENTER.lng - CAIRO_ZONE_HALF },
];

const BRANCH_LAT   = 30.0500;
const BRANCH_LNG   = 31.2400;
const CUSTOMER_LAT = 30.0480;
const CUSTOMER_LNG = 31.2380;
const DRIVER_LAT   = 30.0510;
const DRIVER_LNG   = 31.2410;

// Seed-stable IDs for named test entities (keep low to avoid collision with the
// bulk 50-record loop which starts at id 1 but uses upsert — named entities
// written first win).
const TEST_CITY_ID    = 1;
const TEST_ZONE_ID    = 1;
const TEST_PLAN_ID    = 1;
const TEST_STORE_ID   = 1;
const TEST_BRANCH_ID  = 1;
const TEST_CATEGORY_ID = 1;

// Named user IDs.
// USER_ID_ADMIN=2 is the legacy admin from admin.seed.ts (a@a.com / Default@123).
// USER_ID_ADMIN_NAMED=9 is the human-readable named admin for Swagger.
const USER_ID_ADMIN        = 2; // legacy — also created by admin.seed.ts
const USER_ID_ADMIN_NAMED  = 9; // admin@makanak.com / Admin@1234
const USER_ID_OWNER        = 10;
const USER_ID_CUSTOMER     = 11;
const USER_ID_DRIVER       = 12;

// Named service IDs
const SERVICE_ID_BURGER  = 1;
const SERVICE_ID_PIZZA   = 2;

// Named size IDs
const SIZE_ID_SMALL      = 1;
const SIZE_ID_LARGE      = 2;
const SIZE_ID_PIZZA_REG  = 3;

// Named addon IDs
const ADDON_ID_EXTRA_CHEESE = 1;
const ADDON_ID_EXTRA_SAUCE  = 2;

// Named order IDs
const ORDER_ID_PENDING    = 1;
const ORDER_ID_DELIVERED  = 2;

// Named address ID
const ADDRESS_ID_CUSTOMER = 1;

// Named coupon ID
const COUPON_ID_TEST = 1;

// ─── helpers ────────────────────────────────────────────────────────────────

function hash(plain: string): string {
  return bcrypt.hashSync(plain, HASH_SALT);
}

// ─── main export ────────────────────────────────────────────────────────────

export async function seedComprehensiveData(prisma: PrismaClient): Promise<void> {
  console.log('🌱 Starting comprehensive data seed …');

  // ── 1. Languages ──────────────────────────────────────────────────────────
  for (const lang of [
    { key: 'en', name: 'English', file: 'uploads/i18n/en.json', frontFile: 'uploads/i18n/front/en.json' },
    { key: 'ar', name: 'Arabic',  file: 'uploads/i18n/ar.json', frontFile: 'uploads/i18n/front/ar.json' },
  ]) {
    await prisma.language.upsert({ where: { key: lang.key }, update: {}, create: lang });
  }
  console.log('  ✔ Languages');

  // ── 2. Named test City (Cairo) ────────────────────────────────────────────
  await prisma.city.upsert({
    where:  { id: TEST_CITY_ID },
    update: { name: { en: 'Cairo', ar: 'القاهرة' } },
    create: { id: TEST_CITY_ID, name: { en: 'Cairo', ar: 'القاهرة' } },
  });

  // Extra bulk cities (ids 2–50) for list endpoints
  for (let i = 2; i <= 50; i++) {
    await prisma.city.upsert({
      where:  { id: i },
      update: { name: { en: `City ${i}`, ar: `مدينة ${i}` } },
      create: { id: i, name: { en: `City ${i}`, ar: `مدينة ${i}` } },
    });
  }
  console.log('  ✔ Cities (1–50)');

  // ── 3. Named test Zone (central Cairo box) ────────────────────────────────
  await prisma.zone.upsert({
    where:  { id: TEST_ZONE_ID },
    update: { coordinates: CAIRO_ZONE_COORDS, cityId: TEST_CITY_ID },
    create: {
      id:          TEST_ZONE_ID,
      name:        { en: 'Central Cairo', ar: 'وسط القاهرة' },
      coordinates: CAIRO_ZONE_COORDS,
      cityId:      TEST_CITY_ID,
      active:      true,
    },
  });

  // Extra bulk zones (ids 2–50)
  for (let i = 2; i <= 50; i++) {
    const centerLat = 26.4207 + i * 0.01;
    const centerLng = 50.0888 + i * 0.01;
    const h = 0.004;
    const coordinates = [
      { lat: centerLat - h, lng: centerLng - h },
      { lat: centerLat - h, lng: centerLng + h },
      { lat: centerLat + h, lng: centerLng + h },
      { lat: centerLat + h, lng: centerLng - h },
      { lat: centerLat - h, lng: centerLng - h },
    ];
    await prisma.zone.upsert({
      where:  { id: i },
      update: { cityId: (i <= 50 ? i : 50), coordinates },
      create: { id: i, name: { en: `Zone ${i}`, ar: `منطقة ${i}` }, coordinates, cityId: (i <= 50 ? i : 50) },
    });
  }
  console.log('  ✔ Zones (1–50)');

  // ── 5. Plan ───────────────────────────────────────────────────────────────
  await prisma.plan.upsert({
    where:  { id: TEST_PLAN_ID },
    update: { name: 'Basic Plan' },
    create: { id: TEST_PLAN_ID, name: 'Basic Plan' },
  });
  for (let i = 2; i <= 50; i++) {
    await prisma.plan.upsert({
      where:  { id: i },
      update: { name: `Plan ${i}` },
      create: { id: i, name: `Plan ${i}` },
    });
  }
  console.log('  ✔ Plans (1–50)');

  // ── 7. Test Store ─────────────────────────────────────────────────────────
  await prisma.store.upsert({
    where:  { id: TEST_STORE_ID },
    update: {
      name:            { en: 'Test Restaurant', ar: 'مطعم الاختبار' },
      logo:            'uploads/store/logo-test.png',
      cover:           'uploads/store/cover-test.png',
      cityId:          TEST_CITY_ID,
      planId:          TEST_PLAN_ID,
      isStoreAccepted: true,
      isVerified:      true,
    },
    create: {
      id:              TEST_STORE_ID,
      name:            { en: 'Test Restaurant', ar: 'مطعم الاختبار' },
      logo:            'uploads/store/logo-test.png',
      cover:           'uploads/store/cover-test.png',
      cityId:          TEST_CITY_ID,
      planId:          TEST_PLAN_ID,
      isStoreAccepted: true,
      isVerified:      true,
    },
  });
  // Extra bulk stores (ids 2–50)
  for (let i = 2; i <= 50; i++) {
    await prisma.store.upsert({
      where:  { id: i },
      update: { name: { en: `Store ${i}`, ar: `متجر ${i}` } },
      create: {
        id:              i,
        name:            { en: `Store ${i}`, ar: `متجر ${i}` },
        logo:            `uploads/store/logo-${i}.png`,
        cover:           `uploads/store/cover-${i}.png`,
        cityId:          (i <= 50 ? i : 50),
        planId:          (i <= 50 ? i : 50),
        isStoreAccepted: true,
        isVerified:      true,
      },
    });
  }
  console.log('  ✔ Stores (1–50)');

  // ── 8. Test Branch (in Cairo zone) ────────────────────────────────────────
  await prisma.branch.upsert({
    where:  { id: TEST_BRANCH_ID },
    update: {
      storeId:      TEST_STORE_ID,
      name:         { en: 'Test Branch – Cairo', ar: 'فرع الاختبار – القاهرة' },
      phone:        '+201000000010',
      address:      '1 Tahrir Square, Cairo',
      lat:          BRANCH_LAT,
      lng:          BRANCH_LNG,
      isMainBranch: true,
      isActive:     true,
    },
    create: {
      id:           TEST_BRANCH_ID,
      storeId:      TEST_STORE_ID,
      name:         { en: 'Test Branch – Cairo', ar: 'فرع الاختبار – القاهرة' },
      phone:        '+201000000010',
      address:      '1 Tahrir Square, Cairo',
      lat:          BRANCH_LAT,
      lng:          BRANCH_LNG,
      isMainBranch: true,
      isActive:     true,
    },
  });
  // Extra bulk branches (ids 2–50)
  for (let i = 2; i <= 50; i++) {
    await prisma.branch.upsert({
      where:  { id: i },
      update: { storeId: (i <= 50 ? i : 50) },
      create: {
        id:           i,
        storeId:      (i <= 50 ? i : 50),
        name:         { en: `Branch ${i}`, ar: `فرع ${i}` },
        phone:        `+966500000${String(i).padStart(3, '0')}`,
        address:      `Street ${i}`,
        lat:          26.4207 + i * 0.01,
        lng:          50.0888 + i * 0.01,
        isMainBranch: false,
        isActive:     true,
      },
    });
  }
  console.log('  ✔ Branches (1–50)');

  // ── 9. BranchZone — wire test branch to Cairo zone ────────────────────────
  // This ensures the order assignment geo checks find the branch inside the zone.
  await prisma.branchZone.upsert({
    where:  { branchId_zoneId: { branchId: TEST_BRANCH_ID, zoneId: TEST_ZONE_ID } },
    update: {},
    create: { branchId: TEST_BRANCH_ID, zoneId: TEST_ZONE_ID },
  });
  console.log('  ✔ BranchZone');

  // ── 10. Store schedule (7-day, 08:00–23:00) for test branch ───────────────
  const weekDays = [Days.SUNDAY, Days.MONDAY, Days.TUESDAY, Days.WEDNESDAY, Days.THURSDAY, Days.FRIDAY, Days.SATURDAY];
  for (let i = 0; i < weekDays.length; i++) {
    // Use ids 1–7 for the test branch schedule
    await prisma.storeSchedule.upsert({
      where:  { id: i + 1 },
      update: {},
      create: {
        id:          i + 1,
        branchId:    TEST_BRANCH_ID,
        openingTime: new Date(1970, 0, 1, 8, 0),
        closingTime: new Date(1970, 0, 1, 23, 0),
        day:         weekDays[i],
      },
    });
  }
  // Extra bulk schedules for bulk branches (starting id 8)
  for (let i = 2; i <= 50; i++) {
    await prisma.storeSchedule.upsert({
      where:  { id: i + 6 },
      update: {},
      create: {
        id:          i + 6,
        branchId:    (i <= 50 ? i : 50),
        openingTime: new Date(1970, 0, 1, 8, 0),
        closingTime: new Date(1970, 0, 1, 23, 0),
        day:         weekDays[(i - 1) % weekDays.length],
      },
    });
  }
  console.log('  ✔ Store schedules');

  // ── 11. Categories ────────────────────────────────────────────────────────
  await prisma.category.upsert({
    where:  { id: TEST_CATEGORY_ID },
    update: { name: { en: 'Burgers & Sandwiches', ar: 'برجر وسندوتشات' }, storeId: TEST_STORE_ID, active: true },
    create: { id: TEST_CATEGORY_ID, name: { en: 'Burgers & Sandwiches', ar: 'برجر وسندوتشات' }, storeId: TEST_STORE_ID, active: true },
  });
  for (let i = 2; i <= 50; i++) {
    await prisma.category.upsert({
      where:  { id: i },
      update: { name: { en: `Category ${i}`, ar: `تصنيف ${i}` } },
      create: { id: i, name: { en: `Category ${i}`, ar: `تصنيف ${i}` }, storeId: TEST_STORE_ID, active: true },
    });
  }
  console.log('  ✔ Categories (1–50)');

  // ── 12. Named users ───────────────────────────────────────────────────────
  // Admin (id 2) is created by admin.seed.ts (a@a.com / Default@123).
  // We add a named admin at id 9 for cleaner Swagger testing.

  // Named Admin (id 9)
  await prisma.user.upsert({
    where:  { id: USER_ID_ADMIN_NAMED },
    update: { email: 'admin@makanak.com', roleKey: RolesKeys.ADMIN, verified: true },
    create: {
      id:       USER_ID_ADMIN_NAMED,
      name:     'Makanak Admin',
      email:    'admin@makanak.com',
      phone:    '+201000000009',
      password: hash('Admin@1234'),
      roleKey:  RolesKeys.ADMIN,
      roleId:   RoleIds.ADMIN,
      verified: true,
    },
  });

  // Store Owner (id 10)
  await prisma.user.upsert({
    where:  { id: USER_ID_OWNER },
    update: { email: 'owner@makanak.com', roleKey: RolesKeys.STORE, verified: true },
    create: {
      id:       USER_ID_OWNER,
      name:     'Store Owner',
      email:    'owner@makanak.com',
      phone:    '+201000000020',
      password: hash('Owner@1234'),
      roleKey:  RolesKeys.STORE,
      roleId:   RoleIds.STORE,
      storeId:  TEST_STORE_ID,
      branchId: TEST_BRANCH_ID,
      verified: true,
    },
  });

  // Customer (id 11)
  await prisma.user.upsert({
    where:  { id: USER_ID_CUSTOMER },
    update: { email: 'customer@makanak.com', roleKey: RolesKeys.CUSTOMER, verified: true },
    create: {
      id:       USER_ID_CUSTOMER,
      name:     'Test Customer',
      email:    'customer@makanak.com',
      phone:    '+201000000001',
      password: hash('Customer@1234'),
      roleKey:  RolesKeys.CUSTOMER,
      roleId:   RoleIds.CUSTOMER,
      verified: true,
    },
  });
  // Customer Details (wallet)
  await prisma.details.upsert({
    where:  { userId: USER_ID_CUSTOMER },
    update: { wallet: 500, points: 100 },
    create: { userId: USER_ID_CUSTOMER, wallet: 500, points: 100 },
  });

  // Driver (id 12)
  await prisma.user.upsert({
    where:  { id: USER_ID_DRIVER },
    update: { email: 'driver@makanak.com', roleKey: RolesKeys.DELIVERY, verified: true },
    create: {
      id:       USER_ID_DRIVER,
      name:     'Test Driver',
      email:    'driver@makanak.com',
      phone:    '+201000000002',
      password: hash('Driver@1234'),
      roleKey:  RolesKeys.DELIVERY,
      roleId:   RoleIds.DELIVERY,
      verified: true,
    },
  });
  // DeliveryDetails — required for FK on Order.deliveryId and assignment logic.
  // availableNow=true so the auto-assignment flow can pick this driver.
  await prisma.deliveryDetails.upsert({
    where:  { userId: USER_ID_DRIVER },
    update: { lat: DRIVER_LAT, lng: DRIVER_LNG, availableNow: true },
    create: {
      userId:      USER_ID_DRIVER,
      lat:         DRIVER_LAT,
      lng:         DRIVER_LNG,
      availableNow: true,
      rating:      0,
      review:      0,
    },
  });

  // Bulk users (ids 1–9 avoided to keep legacy admin at 2 clean; bulk starts at 51)
  const bulkUserBase = 51;
  for (let i = 0; i < 10; i++) {
    const uid = bulkUserBase + i;
    await prisma.user.upsert({
      where:  { id: uid },
      update: {},
      create: {
        id:       uid,
        name:     `Bulk Customer ${i + 1}`,
        email:    `bulk.customer${i + 1}@makanak.com`,
        phone:    `+20100000${String(200 + i).padStart(4, '0')}`,
        password: hash('password123'),
        roleKey:  RolesKeys.CUSTOMER,
        roleId:   RoleIds.CUSTOMER,
        verified: true,
      },
    });
    await prisma.details.upsert({
      where:  { userId: uid },
      update: {},
      create: { userId: uid, wallet: 0, points: 0 },
    });
  }
  console.log('  ✔ Users (owner=10, customer=11, driver=12, bulk 51–60)');

  // ── 13. Customer address (inside Cairo zone) ──────────────────────────────
  await prisma.address.upsert({
    where:  { id: ADDRESS_ID_CUSTOMER },
    update: { lat: CUSTOMER_LAT, lng: CUSTOMER_LNG, userId: USER_ID_CUSTOMER },
    create: {
      id:      ADDRESS_ID_CUSTOMER,
      userId:  USER_ID_CUSTOMER,
      title:   'Home',
      lat:     CUSTOMER_LAT,
      lng:     CUSTOMER_LNG,
      adress:  '5 Dokki St, Giza, Cairo',
      default: true,
    },
  });
  // Extra bulk addresses for bulk customers
  for (let i = 1; i <= 50; i++) {
    await prisma.address.upsert({
      where:  { id: i + 1 },
      update: {},
      create: {
        id:      i + 1,
        userId:  USER_ID_CUSTOMER,
        title:   `Address ${i}`,
        lat:     CUSTOMER_LAT + i * 0.001,
        lng:     CUSTOMER_LNG + i * 0.001,
        adress:  `${i} Test St, Cairo`,
        default: false,
      },
    });
  }
  console.log('  ✔ Addresses (1–51)');

  // ── 14. Services ──────────────────────────────────────────────────────────
  // Service 1: Classic Burger — has priceAfterDiscount at service level
  await prisma.service.upsert({
    where:  { id: SERVICE_ID_BURGER },
    update: {
      name:              { en: 'Classic Burger', ar: 'برجر كلاسيك' },
      price:             75,
      priceAfterDiscount: 60,
      status:            ServiceStatus.ACTIVE,
      storeId:           TEST_STORE_ID,
      categoryId:        TEST_CATEGORY_ID,
    },
    create: {
      id:                SERVICE_ID_BURGER,
      name:              { en: 'Classic Burger', ar: 'برجر كلاسيك' },
      description:       { en: 'Juicy beef burger with fresh toppings', ar: 'برجر لحم بقري طازج' },
      image:             'uploads/services/burger.png',
      durationMinutes:   15,
      price:             75,
      priceAfterDiscount: 60,
      status:            ServiceStatus.ACTIVE,
      available:         true,
      storeId:           TEST_STORE_ID,
      categoryId:        TEST_CATEGORY_ID,
    },
  });

  // Service 2: Margherita Pizza — no service-level discount, but sizes have it
  await prisma.service.upsert({
    where:  { id: SERVICE_ID_PIZZA },
    update: {
      name:              { en: 'Margherita Pizza', ar: 'بيتزا مارجريتا' },
      price:             90,
      priceAfterDiscount: null,
      status:            ServiceStatus.ACTIVE,
      storeId:           TEST_STORE_ID,
      categoryId:        TEST_CATEGORY_ID,
    },
    create: {
      id:                SERVICE_ID_PIZZA,
      name:              { en: 'Margherita Pizza', ar: 'بيتزا مارجريتا' },
      description:       { en: 'Classic tomato & mozzarella pizza', ar: 'بيتزا طماطم وجبن موتزاريلا' },
      image:             'uploads/services/pizza.png',
      durationMinutes:   25,
      price:             90,
      priceAfterDiscount: null,
      status:            ServiceStatus.ACTIVE,
      available:         true,
      storeId:           TEST_STORE_ID,
      categoryId:        TEST_CATEGORY_ID,
    },
  });

  // Extra bulk services (ids 3–50)
  for (let i = 3; i <= 50; i++) {
    await prisma.service.upsert({
      where:  { id: i },
      update: { name: { en: `Service ${i}`, ar: `خدمة ${i}` } },
      create: {
        id:              i,
        name:            { en: `Service ${i}`, ar: `خدمة ${i}` },
        description:     { en: `Service ${i} description`, ar: `وصف خدمة ${i}` },
        image:           `uploads/services/service-${i}.png`,
        durationMinutes: 0,
        price:           10 + i,
        status:          ServiceStatus.ACTIVE,
        available:       true,
        storeId:         (i <= 50 ? i : 50),
        categoryId:      (i <= 50 ? i : 50),
      },
    });
  }
  console.log('  ✔ Services (1–50)');

  // ── 15. Service Sizes ─────────────────────────────────────────────────────
  // Burger: Small (no discount), Large (with discount)
  await prisma.serviceSize.upsert({
    where:  { id: SIZE_ID_SMALL },
    update: { name: { en: 'Small', ar: 'صغير' }, price: 60, priceAfterDiscount: null,  serviceId: SERVICE_ID_BURGER },
    create: { id: SIZE_ID_SMALL, name: { en: 'Small', ar: 'صغير' }, price: 60, priceAfterDiscount: null,  isDefault: true,  serviceId: SERVICE_ID_BURGER },
  });
  await prisma.serviceSize.upsert({
    where:  { id: SIZE_ID_LARGE },
    update: { name: { en: 'Large', ar: 'كبير' }, price: 90, priceAfterDiscount: 75, serviceId: SERVICE_ID_BURGER },
    create: { id: SIZE_ID_LARGE, name: { en: 'Large', ar: 'كبير' }, price: 90, priceAfterDiscount: 75, isDefault: false, serviceId: SERVICE_ID_BURGER },
  });
  // Pizza: Regular (with discount)
  await prisma.serviceSize.upsert({
    where:  { id: SIZE_ID_PIZZA_REG },
    update: { name: { en: 'Regular', ar: 'عادي' }, price: 90, priceAfterDiscount: 80, serviceId: SERVICE_ID_PIZZA },
    create: { id: SIZE_ID_PIZZA_REG, name: { en: 'Regular', ar: 'عادي' }, price: 90, priceAfterDiscount: 80, isDefault: true, serviceId: SERVICE_ID_PIZZA },
  });

  // Bulk sizes (ids 4–53)
  for (let i = 3; i <= 50; i++) {
    await prisma.serviceSize.upsert({
      where:  { id: i + 1 },
      update: {},
      create: {
        id:        i + 1,
        serviceId: (i <= 50 ? i : 50),
        name:      { en: `Size ${i}`, ar: `حجم ${i}` },
        price:     10 + i,
        isDefault: true,
      },
    });
  }
  console.log('  ✔ Service sizes (1–53)');

  // ── 16. Service Addons ────────────────────────────────────────────────────
  await prisma.serviceAddon.upsert({
    where:  { id: ADDON_ID_EXTRA_CHEESE },
    update: { name: { en: 'Extra Cheese', ar: 'جبن إضافي' }, price: 10, serviceId: SERVICE_ID_BURGER },
    create: { id: ADDON_ID_EXTRA_CHEESE, name: { en: 'Extra Cheese', ar: 'جبن إضافي' }, price: 10, serviceId: SERVICE_ID_BURGER },
  });
  await prisma.serviceAddon.upsert({
    where:  { id: ADDON_ID_EXTRA_SAUCE },
    update: { name: { en: 'Extra Sauce',  ar: 'صوص إضافي'  }, price: 5,  serviceId: SERVICE_ID_BURGER },
    create: { id: ADDON_ID_EXTRA_SAUCE, name: { en: 'Extra Sauce',  ar: 'صوص إضافي'  }, price: 5,  serviceId: SERVICE_ID_BURGER },
  });

  // Bulk addons (ids 3–52)
  for (let i = 3; i <= 50; i++) {
    await prisma.serviceAddon.upsert({
      where:  { id: i },
      update: {},
      create: { id: i, serviceId: (i <= 50 ? i : 50), name: { en: `Addon ${i}`, ar: `إضافة ${i}` }, price: 1 + i / 10 },
    });
  }
  console.log('  ✔ Service addons (1–52)');

  // ── 18. Coupon ────────────────────────────────────────────────────────────
  const now = new Date();
  await prisma.coupon.upsert({
    where:  { id: COUPON_ID_TEST },
    update: { active: true },
    create: {
      id:               COUPON_ID_TEST,
      title:            { en: 'Welcome 10% Off', ar: 'خصم ترحيب ١٠٪' },
      code:             'WELCOME10',
      type:             CouponType.ALL_USERS,
      discountType:     DiscountType.PERCENTAGE,
      discountValue:    10,
      maxUsage:         1000,
      usageCount:       0,
      minOrderAmount:   50,
      minDiscountValue: 5,
      maxDiscountValue: 100,
      startDate:        now,
      endDate:          new Date(now.getFullYear() + 1, 11, 31),
      active:           true,
    },
  });
  await prisma.storeCoupons.upsert({
    where:  { couponId_storeId: { couponId: COUPON_ID_TEST, storeId: TEST_STORE_ID } },
    update: {},
    create: { couponId: COUPON_ID_TEST, storeId: TEST_STORE_ID },
  });
  await prisma.userCoupons.upsert({
    where:  { couponId_userId: { couponId: COUPON_ID_TEST, userId: USER_ID_CUSTOMER } },
    update: {},
    create: { couponId: COUPON_ID_TEST, userId: USER_ID_CUSTOMER },
  });

  // Bulk coupons (ids 2–50)
  for (let i = 2; i <= 50; i++) {
    const cCode = `BULK${i}`;
    // Skip if the code already exists under a different id (unlikely but safe)
    await prisma.coupon.upsert({
      where:  { code: cCode },
      update: {},
      create: {
        title:            { en: `Discount ${i}`, ar: `خصم ${i}` },
        code:             cCode,
        type:             CouponType.ALL_USERS,
        discountType:     DiscountType.PERCENTAGE,
        discountValue:    10,
        maxUsage:         100,
        usageCount:       0,
        minOrderAmount:   100,
        minDiscountValue: 1,
        maxDiscountValue: 50,
        startDate:        now,
        endDate:          new Date(now.getFullYear() + 1, 0, 1),
        active:           true,
      },
    });
  }
  console.log('  ✔ Coupons (1–50)');

  // ── 19. Branch wallet ─────────────────────────────────────────────────────
  await prisma.wallet.upsert({
    where:  { branchId: TEST_BRANCH_ID },
    update: { currentBalance: 5000 },
    create: { branchId: TEST_BRANCH_ID, currentBalance: 5000 },
  });
  // Bulk branch wallets (ids 2–50)
  for (let i = 2; i <= 50; i++) {
    await prisma.wallet.upsert({
      where:  { branchId: i },
      update: {},
      create: { branchId: i, currentBalance: 100 + i },
    });
  }
  console.log('  ✔ Wallets (branches 1–50)');

  // ── 20. Admin wallet ──────────────────────────────────────────────────────
  // Only one admin wallet is needed (id=1). admin.seed.ts also creates it;
  // this upsert is safe to run after.
  await prisma.adminWallet.upsert({
    where:  { id: 1 },
    update: {},
    create: { id: 1, totalEarning: 0, currentBalance: 0 },
  });
  console.log('  ✔ Admin wallet');


  // ── 22. Test Orders ───────────────────────────────────────────────────────
  // Order 1: PENDING delivery order (customer → test branch, in Cairo zone)
  // Note: zoneId=1 (Cairo) — resolved from delivery coords at creation time.
  await prisma.order.upsert({
    where:  { id: ORDER_ID_PENDING },
    update: { status: OrderStatus.PENDING },
    create: {
      id:                     ORDER_ID_PENDING,
      price:                  75,
      totalPriceAfterDiscount: 67.5,
      discountAmount:          7.5,
      userId:                 USER_ID_CUSTOMER,
      addressId:              ADDRESS_ID_CUSTOMER,
      branchId:               TEST_BRANCH_ID,
      zoneId:                 TEST_ZONE_ID,
      status:                 OrderStatus.PENDING,
      paymentMethod:          PaymentMethod.CASH,
      paymentStatus:          PaymentStatus.UNPAID,
      type:                   OrderType.DELIVERY,
      invoice:                { total: 67.5, items: 75, discount: 7.5, shipping: 0 },
    },
  });

  // Order 2: DELIVERED order (has a driver, used for rating tests)
  await prisma.order.upsert({
    where:  { id: ORDER_ID_DELIVERED },
    update: { status: OrderStatus.DELIVERED },
    create: {
      id:                     ORDER_ID_DELIVERED,
      price:                  165,
      totalPriceAfterDiscount: 155,
      discountAmount:          10,
      userId:                 USER_ID_CUSTOMER,
      addressId:              ADDRESS_ID_CUSTOMER,
      branchId:               TEST_BRANCH_ID,
      zoneId:                 TEST_ZONE_ID,
      deliveryId:             USER_ID_DRIVER,
      status:                 OrderStatus.DELIVERED,
      paymentMethod:          PaymentMethod.CASH,
      paymentStatus:          PaymentStatus.PAID,
      type:                   OrderType.DELIVERY,
      invoice:                { total: 155, items: 165, discount: 10, shipping: 0 },
    },
  });

  // Bulk orders (ids 3–52) — all attached to the customer; no delivery FK so no
  // constraint risk. deliveryId is intentionally omitted for bulk records.
  for (let i = 3; i <= 50; i++) {
    await prisma.order.upsert({
      where:  { id: i },
      update: {},
      create: {
        id:                     i,
        price:                  10 + i,
        totalPriceAfterDiscount: 9 + i,
        discountAmount:          1,
        userId:                 USER_ID_CUSTOMER,
        addressId:              ADDRESS_ID_CUSTOMER,
        branchId:               TEST_BRANCH_ID,
        status:                 OrderStatus.DELIVERED,
        paymentMethod:          PaymentMethod.CASH,
        paymentStatus:          PaymentStatus.PAID,
        type:                   OrderType.DELIVERY,
        invoice:                { total: 9 + i, items: 10 + i, discount: 1 },
      },
    });
  }
  console.log('  ✔ Orders (1–50)');

  // ── 23. Order Items ───────────────────────────────────────────────────────
  // Order 1: 1× Classic Burger (Small)
  await prisma.orderItem.upsert({
    where:  { id: 1 },
    update: {},
    create: { id: 1, orderId: ORDER_ID_PENDING, serviceId: SERVICE_ID_BURGER, sizeId: SIZE_ID_SMALL, quantity: 1, price: 60 },
  });
  // Order 2: 1× Classic Burger (Large, discounted) + 1× Pizza (Regular)
  await prisma.orderItem.upsert({
    where:  { id: 2 },
    update: {},
    create: { id: 2, orderId: ORDER_ID_DELIVERED, serviceId: SERVICE_ID_BURGER, sizeId: SIZE_ID_LARGE, quantity: 1, price: 75 },
  });
  await prisma.orderItem.upsert({
    where:  { id: 3 },
    update: {},
    create: { id: 3, orderId: ORDER_ID_DELIVERED, serviceId: SERVICE_ID_PIZZA, sizeId: SIZE_ID_PIZZA_REG, quantity: 1, price: 80 },
  });
  // Bulk order items (ids 4–53)
  for (let i = 3; i <= 50; i++) {
    await prisma.orderItem.upsert({
      where:  { id: i + 1 },
      update: {},
      create: {
        id:        i + 1,
        orderId:   i,
        serviceId: SERVICE_ID_BURGER,
        sizeId:    SIZE_ID_SMALL,
        quantity:  1,
        price:     60,
      },
    });
  }
  console.log('  ✔ Order items (1–53)');

  // ── 24. Order Item Addons ─────────────────────────────────────────────────
  // Order 1, item 1: Extra Cheese
  await prisma.orderItemAddon.upsert({
    where:  { id: 1 },
    update: {},
    create: { id: 1, orderItemId: 1, addonId: ADDON_ID_EXTRA_CHEESE },
  });
  // Order 2, item 2: Extra Sauce
  await prisma.orderItemAddon.upsert({
    where:  { id: 2 },
    update: {},
    create: { id: 2, orderItemId: 2, addonId: ADDON_ID_EXTRA_SAUCE },
  });
  console.log('  ✔ Order item addons (1–2)');

  // ── 25. Ratings (for the DELIVERED order) ────────────────────────────────
  await prisma.storeRating.upsert({
    where:  { orderId_userId: { orderId: ORDER_ID_DELIVERED, userId: USER_ID_CUSTOMER } },
    update: { rating: 5 },
    create: {
      userId:   USER_ID_CUSTOMER,
      orderId:  ORDER_ID_DELIVERED,
      branchId: TEST_BRANCH_ID,
      storeId:  TEST_STORE_ID,
      rating:   5,
      comment:  'Great food!',
    },
  });
  await prisma.deliveryRating.upsert({
    where:  { orderId_userId: { orderId: ORDER_ID_DELIVERED, userId: USER_ID_CUSTOMER } },
    update: { rating: 5 },
    create: {
      userId:     USER_ID_CUSTOMER,
      deliveryId: USER_ID_DRIVER,
      orderId:    ORDER_ID_DELIVERED,
      rating:     5,
      comment:    'Fast delivery!',
    },
  });
  console.log('  ✔ Ratings (store + delivery for order 2)');

  // ── 26. Complaint (on the delivered order) ────────────────────────────────
  await prisma.complaint.upsert({
    where:  { id: 1 },
    update: {},
    create: {
      id:      1,
      userId:  USER_ID_CUSTOMER,
      orderId: ORDER_ID_DELIVERED,
      reason:  'Order arrived cold',
      status:  ComplaintStatus.PENDING,
    },
  });
  await prisma.complaintReply.upsert({
    where:  { id: 1 },
    update: {},
    create: {
      id:          1,
      complaintId: 1,
      userId:      USER_ID_ADMIN,
      message:     'We apologise for the inconvenience. A refund has been processed.',
    },
  });
  console.log('  ✔ Complaint + reply');

  // ── 27. Transactions ──────────────────────────────────────────────────────
  await prisma.transaction.upsert({
    where:  { id: 'seed-txn-order-1' },
    update: {},
    create: {
      id:          'seed-txn-order-1',
      credit:      75,
      balance:     75,
      type:        TransactionType.ORDER_CREATED,
      userType:    UserType.CUSTOMER,
      referenceId: ORDER_ID_PENDING,
      customerId:  USER_ID_CUSTOMER,
    },
  });
  await prisma.transaction.upsert({
    where:  { id: 'seed-txn-order-2' },
    update: {},
    create: {
      id:          'seed-txn-order-2',
      credit:      155,
      balance:     155,
      type:        TransactionType.ORDER_COMPLETED,
      userType:    UserType.CUSTOMER,
      referenceId: ORDER_ID_DELIVERED,
      customerId:  USER_ID_CUSTOMER,
    },
  });
  console.log('  ✔ Transactions (2 test)');

  // ── 28. Notifications ─────────────────────────────────────────────────────
  await prisma.notification.upsert({
    where:  { id: 1 },
    update: {},
    create: {
      id:     1,
      userId: USER_ID_CUSTOMER,
      title:  { en: 'Welcome to Makanak!', ar: 'أهلاً بك في مكانك!' },
      body:   { en: 'Your account is ready. Start ordering now.', ar: 'حسابك جاهز. ابدأ الطلب الآن.' },
    },
  });
  await prisma.notification.upsert({
    where:  { id: 2 },
    update: {},
    create: {
      id:     2,
      userId: USER_ID_CUSTOMER,
      title:  { en: 'Order Delivered', ar: 'تم التوصيل' },
      body:   { en: 'Your order #2 has been delivered.', ar: 'تم توصيل طلبك رقم ٢.' },
    },
  });
  console.log('  ✔ Notifications');

  // ── 29. Banners ───────────────────────────────────────────────────────────
  await prisma.banner.upsert({
    where:  { id: 1 },
    update: {},
    create: {
      id:       1,
      name:     { en: 'Summer Offers', ar: 'عروض الصيف' },
      image:    'uploads/banners/summer.png',
      storeId:  TEST_STORE_ID,
      active:   true,
    },
  });
  for (let i = 2; i <= 50; i++) {
    await prisma.banner.upsert({
      where:  { id: i },
      update: {},
      create: {
        id:       i,
        name:     { en: `Banner ${i}`, ar: `بانر ${i}` },
        image:    `uploads/banners/banner-${i}.png`,
        active:   true,
      },
    });
  }
  console.log('  ✔ Banners (1–50)');

  // ── 30. Specialist ────────────────────────────────────────────────────────
  await prisma.specialist.upsert({
    where:  { id: 1 },
    update: { name: 'Chef Ahmed' },
    create: { id: 1, name: 'Chef Ahmed', storeId: TEST_STORE_ID },
  });
  for (let i = 2; i <= 50; i++) {
    await prisma.specialist.upsert({
      where:  { id: i },
      update: {},
      create: { id: i, name: `Specialist ${i}`, storeId: (i <= 50 ? i : 50) },
    });
  }
  console.log('  ✔ Specialists (1–50)');

  // ── 31. Social Media ──────────────────────────────────────────────────────
  for (const sm of [
    { platform: 'Instagram', link: 'https://instagram.com/makanak', image: 'uploads/social/instagram.png', isActive: true },
    { platform: 'Facebook',  link: 'https://facebook.com/makanak',  image: 'uploads/social/facebook.png',  isActive: true },
    { platform: 'Twitter',   link: 'https://twitter.com/makanak',   image: 'uploads/social/twitter.png',   isActive: true },
  ]) {
    await prisma.socialMedia.upsert({
      where:  { platform: sm.platform },
      update: { link: sm.link, isActive: sm.isActive, image: sm.image },
      create: sm,
    });
  }
  console.log('  ✔ Social media (3)');

  // ── 32. KeyValue ──────────────────────────────────────────────────────────
  for (let i = 1; i <= 10; i++) {
    await prisma.keyValue.upsert({
      where:  { id: i },
      update: {},
      create: {
        id:    i,
        key:   `key_${i}`,
        value: { en: `Value ${i}`, ar: `قيمة ${i}` },
      },
    });
  }
  console.log('  ✔ Key-value (10)');

  // ── 33. Withdraw (test branch, lightweight payout — no bank account) ──────
  await prisma.withdraw.upsert({
    where:  { id: 1 },
    update: {},
    create: {
      id:            1,
      amount:        200,
      branchId:      TEST_BRANCH_ID,
      payoutMethod:  PayoutMethod.VODAFONE_CASH,
      payoutDetails: '+201000000030',
      status:        WithdrawStatus.PENDING,
    },
  });
  console.log('  ✔ Withdraw (1)');

  // ── 34. OTPs (for testing forgot-password / verify flows) ─────────────────
  await prisma.oTP.upsert({
    where:  { userId_type: { userId: USER_ID_CUSTOMER, type: OTPType.PASSWORD_RESET } },
    update: { code: '123456' },
    create: { userId: USER_ID_CUSTOMER, code: '123456', type: OTPType.PASSWORD_RESET },
  });
  await prisma.oTP.upsert({
    where:  { userId_type: { userId: USER_ID_CUSTOMER, type: OTPType.EMAIL_VERIFICATION } },
    update: { code: '654321' },
    create: { userId: USER_ID_CUSTOMER, code: '654321', type: OTPType.EMAIL_VERIFICATION },
  });
  console.log('  ✔ OTPs (customer)');

  // ── 35. Favourite store & service for customer ────────────────────────────
  await prisma.favoriteStore.upsert({
    where:  { branchId_customerId: { branchId: TEST_BRANCH_ID, customerId: USER_ID_CUSTOMER } },
    update: {},
    create: { branchId: TEST_BRANCH_ID, customerId: USER_ID_CUSTOMER, storeId: TEST_STORE_ID },
  });
  await prisma.favoriteService.upsert({
    where:  { serviceId_customerId: { serviceId: SERVICE_ID_BURGER, customerId: USER_ID_CUSTOMER } },
    update: {},
    create: { serviceId: SERVICE_ID_BURGER, customerId: USER_ID_CUSTOMER },
  });
  console.log('  ✔ Favourites (store + service)');

  // ── 36. Fund (customer top-up record) ─────────────────────────────────────
  await prisma.fund.upsert({
    where:  { id: 1 },
    update: {},
    create: { id: 1, customerId: USER_ID_CUSTOMER, price: 500 },
  });
  console.log('  ✔ Fund (1)');

  console.log('✅ Comprehensive data seed finished!');
  console.log('');
  console.log('──────────────────────────────────────────────────────');
  console.log('  TEST CREDENTIALS');
  console.log('──────────────────────────────────────────────────────');
  console.log('  Admin (named)   admin@makanak.com     / Admin@1234');
  console.log('  Admin (legacy)  a@a.com              / Default@123');
  console.log('  Store Owner     owner@makanak.com     / Owner@1234');
  console.log('  Customer        customer@makanak.com  / Customer@1234');
  console.log('  Driver          driver@makanak.com    / Driver@1234');
  console.log('──────────────────────────────────────────────────────');
}
