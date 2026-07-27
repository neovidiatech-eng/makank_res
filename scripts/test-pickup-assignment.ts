/**
 * Manual verification for the PICKUP driver-assignment fix.
 *
 * Background: PICKUP orders (customer collects from the store) must NEVER be auto-assigned a driver.
 * The guard in OrderService.changeStatus does this:
 *
 *     // order.service.ts:957
 *     if (status === READY_PICKUP && !order.deliveryId && order.type !== OrderType.PICKUP) {
 *       await this.assignmentService.handleOrderAssignment(order.id);
 *     }
 *
 * The bug: `order` is loaded via selectOrderByIdForValidationOBJ, which did NOT select `type`, so
 * `order.type` was `undefined` at runtime and `undefined !== 'PICKUP'` is always true — a PICKUP
 * order at READY_PICKUP wrongly triggered assignment. The fix adds `type: true` to that select.
 *
 * This test loads real PICKUP and DELIVERY orders through the ACTUAL select function and evaluates
 * the EXACT guard expression. It does not need the dev server, Firebase, drivers, or geocoded
 * branches — it pins the precise decision that was broken, and fails if `type` is dropped from the
 * select again.
 *
 * Prerequisites: MySQL up, roles seeded (npm run db:seed).
 *
 * Run:
 *   npx ts-node --transpile-only -r tsconfig-paths/register scripts/test-pickup-assignment.ts
 *
 * Optional:  --keep   leave the test order/user rows in place for inspection.
 */
import 'dotenv/config';
import { PrismaClient, OrderStatus, OrderType } from '@prisma/client';
import { selectOrderByIdForValidationOBJ } from '../src/_modules/order/prisma-args/order.helpers.prisma.arg';

const prisma = new PrismaClient();
const KEEP = process.argv.includes('--keep');
const ROLE = 'Customer';
const stamp = Date.now();

// Mirrors the guard at order.service.ts:957 exactly. `true` => an assignment would be triggered.
function wouldTriggerAssignment(order: { deliveryId: number | null; type: OrderType }, status: OrderStatus) {
  return status === OrderStatus.READY_PICKUP && !order.deliveryId && order.type !== OrderType.PICKUP;
}

async function createOrder(userId: number, type: OrderType) {
  const o = await prisma.order.create({
    data: { price: 0, userId, invoice: {}, type, status: OrderStatus.READY_PICKUP },
    select: { id: true },
  });
  return o.id;
}

async function main() {
  const role = await prisma.role.findFirst({ where: { roleKey: ROLE }, select: { id: true } });
  if (!role) throw new Error(`Role "${ROLE}" not found — run "npm run db:seed" first.`);

  const user = await prisma.user.create({
    data: {
      name: 'Pickup Test',
      email: `pickup_test_${stamp}@makanak.test`,
      phone: `+20122${stamp % 10000000}`,
      password: 'x',
      verified: true,
      active: true,
      roleKey: ROLE,
      roleId: role.id,
    },
    select: { id: true },
  });

  const pickupId = await createOrder(user.id, OrderType.PICKUP);
  const deliveryId = await createOrder(user.id, OrderType.DELIVERY);
  console.log(`Created PICKUP order #${pickupId} and DELIVERY order #${deliveryId} (status READY_PICKUP)\n`);

  let pass = true;
  try {
    // Load EXACTLY how OrderService.changeStatus loads the order (helpers.getOrderById).
    const pickup = await prisma.order.findUnique({
      where: { id: pickupId },
      select: selectOrderByIdForValidationOBJ(),
    });
    const delivery = await prisma.order.findUnique({
      where: { id: deliveryId },
      select: selectOrderByIdForValidationOBJ(),
    });

    console.table([
      { order: 'PICKUP', 'type returned by select': (pickup as any).type, 'guard → would assign?': wouldTriggerAssignment(pickup as any, OrderStatus.READY_PICKUP) },
      { order: 'DELIVERY', 'type returned by select': (delivery as any).type, 'guard → would assign?': wouldTriggerAssignment(delivery as any, OrderStatus.READY_PICKUP) },
    ]);

    // 1) The fix: `type` must actually be present after the select.
    if ((pickup as any).type !== OrderType.PICKUP) {
      pass = false;
      console.log(`\n❌ FAIL: select did not return type for the PICKUP order (got ${(pickup as any).type}). Is "type: true" missing from selectOrderByIdForValidationOBJ?`);
    }

    // 2) PICKUP must NOT trigger assignment.
    if (wouldTriggerAssignment(pickup as any, OrderStatus.READY_PICKUP)) {
      pass = false;
      console.log('\n❌ FAIL: a PICKUP order at READY_PICKUP would trigger driver assignment (the bug).');
    } else {
      console.log('\n✅ PASS: PICKUP order at READY_PICKUP is correctly skipped (no driver assignment).');
    }

    // 3) DELIVERY must STILL trigger assignment (no regression).
    if (wouldTriggerAssignment(delivery as any, OrderStatus.READY_PICKUP)) {
      console.log('✅ PASS: DELIVERY order at READY_PICKUP still triggers assignment (unchanged).');
    } else {
      pass = false;
      console.log('❌ FAIL: DELIVERY order no longer triggers assignment — regression.');
    }

    // For contrast: what the bug looked like when `type` was undefined.
    const buggy = wouldTriggerAssignment({ deliveryId: null, type: undefined as any }, OrderStatus.READY_PICKUP);
    console.log(`\n(For reference — with type undefined, the guard returns ${buggy}; that "true" on a PICKUP order was the bug.)`);
  } finally {
    if (!KEEP) {
      await prisma.order.deleteMany({ where: { id: { in: [pickupId, deliveryId] } } });
      await prisma.user.delete({ where: { id: user.id } });
      console.log('\nCleaned up test order(s) and user.');
    } else {
      console.log(`\n--keep set: left PICKUP #${pickupId}, DELIVERY #${deliveryId}, user ${user.id}.`);
    }
  }

  process.exitCode = pass ? 0 : 1;
}

main()
  .catch((e) => {
    console.error('\nError:', e.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
