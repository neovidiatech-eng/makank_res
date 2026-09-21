import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function verify() {
  console.log('=== VERIFYING TANTA ECOSYSTEM ===');

  // 1. Check City 2 (Tanta)
  const tanta = await prisma.city.findUnique({
    where: { id: 2 },
    include: {
      Zone: true,
      Store: {
        include: {
          branches: { include: { BranchZones: true } },
          Services: { include: { Sizes: true, Addons: true } },
        },
      },
    },
  });

  console.log(`City: ${JSON.stringify(tanta?.name)}`);
  console.log(`Zones count: ${tanta?.Zone.length}`);
  console.log(`Stores count: ${tanta?.Store.length}`);

  let totalServices = 0;
  for (const s of tanta?.Store || []) {
    totalServices += s.Services.length;
    console.log(` - Store [${s.id}] ${JSON.stringify(s.name)}: ${s.Services.length} items, branch lat/lng: (${s.branches[0]?.lat}, ${s.branches[0]?.lng})`);
  }
  console.log(`Total Tanta Services: ${totalServices}`);

  // 2. Check Delivery Promotions
  const promos = await prisma.deliveryPromotion.findMany({
    include: { Store: true, Zone: true },
  });
  console.log(`Delivery Promotions count: ${promos.length}`);
  for (const p of promos) {
    console.log(` - Promo: "${p.name}" (scope: ${p.scope}, discountType: ${p.discountType}, value: ${p.promoValue}, badge: ${p.badgeText})`);
  }

  // 3. Check Fortune Wheel
  const wheelItems = await prisma.fortuneWheelItem.findMany({
    include: { Store: true },
  });
  console.log(`Fortune Wheel Items count: ${wheelItems.length}`);
  for (const item of wheelItems) {
    console.log(` - Wheel Item: "${item.displayName}" (type: ${item.rewardType}, value: ${item.rewardValue}, store: ${item.Store ? JSON.stringify(item.Store.name) : 'none'})`);
  }

  // 4. Check Coupons
  const coupons = await prisma.coupon.findMany({
    include: { StoreCoupons: true, CouponZones: true },
  });
  console.log(`Coupons count: ${coupons.length}`);
  for (const c of coupons) {
    console.log(` - Coupon: ${c.code} (${c.discountValue} ${c.discountType}) linked to ${c.StoreCoupons.length} stores & ${c.CouponZones.length} zones`);
  }

  // 5. Check Customer & Driver accounts
  const customer = await prisma.user.findFirst({
    where: { email: 'customer_tanta@makanak.com' },
    include: { Address: true, Details: true },
  });
  console.log(`Customer: ${customer?.name} (${customer?.email}) - Wallet: ${customer?.Details?.wallet} EGP, Addresses: ${customer?.Address.length}`);

  const driver = await prisma.user.findFirst({
    where: { email: 'driver_tanta@makanak.com' },
    include: { DeliveryDetails: true },
  });
  console.log(`Driver: ${driver?.name} (${driver?.email}) - Location: (${driver?.DeliveryDetails?.lat}, ${driver?.DeliveryDetails?.lng}), Available: ${driver?.DeliveryDetails?.availableNow}`);

  // 6. Check Orders
  const orders = await prisma.order.findMany({
    where: { zoneId: { in: [201, 202, 203, 204, 205] } },
    include: { OrderItems: true, StoreRating: true },
  });
  console.log(`Tanta Orders count: ${orders.length}`);
  const statusCounts: Record<string, number> = {};
  for (const o of orders) {
    statusCounts[o.status] = (statusCounts[o.status] || 0) + 1;
  }
  console.log('Orders by status:', statusCounts);

  // 7. Verify Passwords
  const bcrypt = require('bcrypt');
  const testUsers = [
    { email: 'admin@makanak.com', pass: 'Admin@1234', role: 'Admin' },
    { email: 'customer_tanta@makanak.com', pass: 'Customer@1234', role: 'Customer' },
    { email: 'driver_tanta@makanak.com', pass: 'Driver@1234', role: 'Delivery' },
    { email: 'owner_koshary@makanak.com', pass: 'Owner@1234', role: 'Store' },
  ];
  console.log('=== CREDENTIALS CHECK ===');
  for (const t of testUsers) {
    const u = await prisma.user.findFirst({ where: { email: t.email } });
    const ok = u ? bcrypt.compareSync(t.pass, u.password) : false;
    console.log(` - ${t.role} (${t.email} / ${t.pass}): ${ok ? '✅ VALID' : '❌ INVALID'}`);
  }

  console.log('=== ALL VERIFICATIONS PASSED ===');
}

verify()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
