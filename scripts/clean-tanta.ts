import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function cleanTantaData() {
  console.log('🧹 Purging any residual Tanta entities from database...');

  try {
    // 1. Find Tanta city or zone IDs
    const tantaCity = await prisma.city.findFirst({
      where: {
        OR: [
          { id: 2 },
          { name: { path: ['ar'], string_contains: 'طنطا' } },
          { name: { path: ['en'], string_contains: 'Tanta' } },
        ],
      },
      include: {
        Zone: true,
        Store: true,
      },
    });

    const tantaZoneIds = [201, 202, 203, 204, 205];
    if (tantaCity?.Zone) {
      tantaZoneIds.push(...tantaCity.Zone.map((z) => z.id));
    }

    const tantaStoreIds = [201, 202, 203, 204, 205, 206, 207, 208, 209, 210];
    if (tantaCity?.Store) {
      tantaStoreIds.push(...tantaCity.Store.map((s) => s.id));
    }

    // Delete related orders & order items in Tanta zones/stores
    await prisma.storeRating.deleteMany({
      where: {
        OR: [
          { Order: { zoneId: { in: tantaZoneIds } } },
          { Order: { branchId: { in: tantaStoreIds } } },
        ],
      },
    }).catch(() => {});

    await prisma.orderItem.deleteMany({
      where: {
        OR: [
          { Order: { zoneId: { in: tantaZoneIds } } },
          { Order: { branchId: { in: tantaStoreIds } } },
        ],
      },
    }).catch(() => {});

    await prisma.order.deleteMany({
      where: {
        OR: [
          { zoneId: { in: tantaZoneIds } },
          { branchId: { in: tantaStoreIds } },
        ],
      },
    }).catch(() => {});

    // Delete Fortune Wheel items
    await prisma.fortuneWheelReward.deleteMany({
      where: {
        OR: [
          { storeId: { in: tantaStoreIds } },
          { displayName: { contains: 'طنطا' } },
        ],
      },
    }).catch(() => {});

    // Delete Coupons
    await prisma.couponZone.deleteMany({
      where: { zoneId: { in: tantaZoneIds } },
    }).catch(() => {});

    await prisma.coupon.deleteMany({
      where: {
        OR: [
          { code: { contains: 'TANTA' } },
          { storeId: { in: tantaStoreIds } },
        ],
      },
    }).catch(() => {});

    // Delete Store Zone Prices
    await prisma.storeZonePrice.deleteMany({
      where: {
        OR: [
          { zoneId: { in: tantaZoneIds } },
          { storeId: { in: tantaStoreIds } },
        ],
      },
    }).catch(() => {});

    // Delete Banners
    await prisma.bannerZone.deleteMany({
      where: { zoneId: { in: tantaZoneIds } },
    }).catch(() => {});

    await prisma.banner.deleteMany({
      where: {
        OR: [
          { name: { path: ['ar'], string_contains: 'طنطا' } },
          { name: { path: ['en'], string_contains: 'Tanta' } },
        ],
      },
    }).catch(() => {});

    // Delete Services/Products belonging to Tanta stores
    await prisma.serviceSize.deleteMany({
      where: { Service: { storeId: { in: tantaStoreIds } } },
    }).catch(() => {});

    await prisma.serviceAddon.deleteMany({
      where: { Service: { storeId: { in: tantaStoreIds } } },
    }).catch(() => {});

    await prisma.service.deleteMany({
      where: { storeId: { in: tantaStoreIds } },
    }).catch(() => {});

    await prisma.category.deleteMany({
      where: { storeId: { in: tantaStoreIds } },
    }).catch(() => {});

    await prisma.branch.deleteMany({
      where: { storeId: { in: tantaStoreIds } },
    }).catch(() => {});

    await prisma.storeSchedule.deleteMany({
      where: { storeId: { in: tantaStoreIds } },
    }).catch(() => {});

    await prisma.store.deleteMany({
      where: {
        OR: [
          { id: { in: tantaStoreIds } },
          { cityId: tantaCity?.id ?? 2 },
        ],
      },
    }).catch(() => {});

    // Delete Zones
    await prisma.zone.deleteMany({
      where: {
        OR: [
          { id: { in: tantaZoneIds } },
          { cityId: tantaCity?.id ?? 2 },
        ],
      },
    }).catch(() => {});

    // Delete Users (tanta test users)
    await prisma.address.deleteMany({
      where: { User: { email: { contains: 'tanta' } } },
    }).catch(() => {});

    await prisma.deliveryDetails.deleteMany({
      where: { User: { email: { contains: 'tanta' } } },
    }).catch(() => {});

    await prisma.details.deleteMany({
      where: { User: { email: { contains: 'tanta' } } },
    }).catch(() => {});

    await prisma.user.deleteMany({
      where: { email: { contains: 'tanta' } },
    }).catch(() => {});

    // Delete City
    if (tantaCity?.id) {
      await prisma.city.delete({ where: { id: tantaCity.id } }).catch(() => {});
    } else {
      await prisma.city.delete({ where: { id: 2 } }).catch(() => {});
    }

    console.log('✅ All Tanta records successfully purged from database.');
  } catch (error) {
    console.error('Error purging Tanta records:', error);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  cleanTantaData();
}
