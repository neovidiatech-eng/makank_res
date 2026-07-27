/* eslint-disable no-console */
/**
 * Standalone seed for MANUALLY testing the custom-delivery + station-images flow via Swagger.
 *
 * It creates (idempotently) a verified CUSTOMER and a DELIVERY driver with known, fixed credentials
 * so you can log in and exercise:
 *   POST /api/orders/custom-delivery/calculate
 *   POST /api/orders/custom-delivery/images     (upload files -> imageIds)
 *   POST /api/orders/custom-delivery            (embed imageIds per stop)
 *
 * Custom delivery needs no store/service — only an authenticated customer + valid coordinates.
 *
 * PREREQUISITE: run `npm run db:seed` first — it seeds the roles, role-permissions (so the user's
 * token carries `orders_post/get/patch`) and the pricing settings. THEN run this:
 *
 *   npx ts-node -r tsconfig-paths/register prisma/seeds/custom-delivery-test.seed.ts
 *
 * Wallet is funded (1000) so you can also test `paymentMethod: WALLET` / `paidWithWallet: true`.
 */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { RolesKeys } from 'src/_modules/authorization/providers/roles';

const prisma = new PrismaClient();

// Known password for both seeded accounts. bcrypt embeds its own salt, so the
// hash works for login regardless of the project's HASH_SALT env.
const PASSWORD = 'Password@123';

async function upsertUser(
  roleKey: string,
  email: string,
  name: string,
  phone: string,
): Promise<number> {
  const role = await prisma.role.findFirst({ where: { roleKey } });
  if (!role) {
    throw new Error(
      `Role "${roleKey}" not found — run \`npm run db:seed\` first (it seeds roles, permissions & settings).`,
    );
  }

  const password = bcrypt.hashSync(PASSWORD, 10);
  const existing = await prisma.user.findFirst({ where: { email, roleKey } });

  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: { password, verified: true, active: true },
    });
    return existing.id;
  }

  const created = await prisma.user.create({
    data: {
      name,
      email,
      phone,
      roleKey,
      roleId: role.id,
      verified: true,
      active: true,
      password,
      Details: { create: { wallet: 1000 } },
    },
  });
  return created.id;
}

async function main() {
  await prisma.$connect();

  const customerId = await upsertUser(
    RolesKeys.CUSTOMER,
    'test.customer@makanak.dev',
    'Test Customer',
    '01000000001',
  );
  const driverId = await upsertUser(
    RolesKeys.DELIVERY,
    'test.driver@makanak.dev',
    'Test Driver',
    '01000000002',
  );

  // A driver needs a DeliveryDetails profile (lat/lng) — OrderDeliveryAssignment
  // and Order.deliveryId both FK to DeliveryDetails.userId. Without it, assigning
  // an order to the driver fails with a delivery_id foreign-key violation.
  // Located near the Cairo test coordinates and marked available.
  await prisma.deliveryDetails.upsert({
    where: { userId: driverId },
    update: { availableNow: true, forceAvailable: true },
    create: {
      userId: driverId,
      lat: 30.05,
      lng: 31.23,
      availableNow: true,
      forceAvailable: true,
      lastLocationUpdate: new Date(),
    },
  });

  console.log('\n✅ Seeded custom-delivery test users (password for both: ' + PASSWORD + ')');
  console.table([
    {
      role: 'Customer',
      id: customerId,
      email: 'test.customer@makanak.dev',
      login: 'POST /api/authentication/login/Customer',
    },
    {
      role: 'Driver',
      id: driverId,
      email: 'test.driver@makanak.dev',
      login: 'POST /api/authentication/login/Delivery',
    },
  ]);
  console.log(
    '\nNext: log in (body { email, password, locale:"en" }) → copy AccessToken → Swagger “Authorize” (Bearer).\n',
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
