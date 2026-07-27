/**
 * Integration test for the bulk-assignment + AFK-break feature.
 *
 * It boots the REAL Nest application context (so it exercises the actual DI graph,
 * including the order<->timer forwardRef and the global AfkBreakService wiring),
 * stops the cron schedulers so background ticks don't race the assertions, then
 * drives each scenario by calling the real service methods and short-circuiting
 * the time-based waits (past `expiresAt`, past break scores) instead of waiting
 * 90s / 15min.
 *
 * It uses real MySQL + Redis. Running the timeout/availability/resume passes is
 * equivalent to one normal cron tick (the same reconciliation that already runs
 * every 1-5 min), so:  >>> RUN THIS AGAINST DEV/STAGING, NOT PRODUCTION. <<<
 *
 * Prereqs: MySQL + Redis up, roles seeded (npm run db:seed).
 *
 * Run:
 *   npx ts-node --transpile-only -r tsconfig-paths/register scripts/test-afk-break.ts
 *   (add --keep to leave test rows behind for inspection)
 */
import 'dotenv/config';
import '../src/declares/functions/env'; // registers global env() helper used across the app
import { NestFactory } from '@nestjs/core';
import { SchedulerRegistry } from '@nestjs/schedule';
import { PrismaClient, OrderStatus, OrderType, AssignmentStatus, Days } from '@prisma/client';

import { AppModule } from '../src/app/app.module';
import { PrismaService } from '../src/globals/services/prisma.service';
import { AfkBreakService } from '../src/globals/services/afk-break.service';
import { AssignmentTimerService } from '../src/_modules/order/services/timer.service';
import { AfkBreakResumeService } from '../src/_modules/delivery/services/afk-break-resume.service';
import { DeliveryAvailabilityService } from '../src/_modules/delivery/delivery-availability.service';
import { DeliveryService } from '../src/_modules/delivery/delivery.service';
import { OrderService } from '../src/_modules/order/order.service';
import { redisClient } from '../src/redis/redis.provider';

const KEEP = process.argv.includes('--keep');
const BREAKS_KEY = 'delivery:afk-breaks';
const pendingKey = (id: number) => `delivery:afk-pending:${id}`;
const WEEK_DAYS = [Days.SUNDAY, Days.MONDAY, Days.TUESDAY, Days.WEDNESDAY, Days.THURSDAY, Days.FRIDAY, Days.SATURDAY];

const raw = new PrismaClient(); // bypasses soft-delete middleware for clean setup/assert/teardown

// ---- tiny test harness ----
let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, extra = '') {
  if (cond) {
    passed++;
    console.log(`  ✅ ${name}`);
  } else {
    failed++;
    console.log(`  ❌ ${name}${extra ? `  — ${extra}` : ''}`);
  }
}

// ---- bookkeeping for cleanup ----
const userIds: number[] = [];
const orderIds: number[] = [];
const driverIds: number[] = [];
let nonAdminRoleId: number;
let nonAdminRoleKey: string;

let seq = 0;
async function makeUser(roleId: number, roleKey: string): Promise<number> {
  seq++;
  const stamp = `${Date.now()}_${seq}`;
  const u = await raw.user.create({
    data: {
      name: `AFK Test ${stamp}`,
      email: `afk_${stamp}@makanak.test`,
      phone: `+2010${(Date.now() % 100000000) + seq}`,
      password: 'x',
      verified: true,
      active: true,
      roleKey,
      roleId,
    },
    select: { id: true },
  });
  userIds.push(u.id);
  return u.id;
}

async function makeDriver(opts: { availableNow?: boolean; forceAvailable?: boolean; withTodayShift?: boolean } = {}) {
  const id = await makeUser(nonAdminRoleId, nonAdminRoleKey);
  await raw.deliveryDetails.create({
    data: {
      userId: id,
      lat: 30.0444,
      lng: 31.2357,
      availableNow: opts.availableNow ?? true,
      forceAvailable: opts.forceAvailable ?? false,
    },
  });
  if (opts.withTodayShift) {
    const op = new Date(); op.setHours(0, 0, 0, 0);
    const cl = new Date(); cl.setHours(23, 59, 0, 0);
    await raw.deliverySchedule.create({
      data: { deliveryId: id, day: WEEK_DAYS[new Date().getDay()], openingTime: op, closingTime: cl },
    });
  }
  driverIds.push(id);
  return id;
}

async function createOrder(
  customerId: number,
  type: OrderType,
  status: OrderStatus,
  deliveryId?: number,
  pickup?: { lat: number; lng: number },
): Promise<number> {
  const o = await raw.order.create({
    data: {
      price: 0,
      userId: customerId,
      invoice: {},
      type,
      status,
      ...(deliveryId ? { deliveryId } : {}),
      ...(pickup ? { pickupLat: pickup.lat, pickupLng: pickup.lng } : {}),
    },
    select: { id: true },
  });
  orderIds.push(o.id);
  return o.id;
}

async function pastAssignment(orderId: number, driverId: number) {
  await raw.orderDeliveryAssignment.create({
    data: { orderId, deliveryId: driverId, status: AssignmentStatus.PENDING, expiresAt: new Date(Date.now() - 60_000) },
  });
}

async function futureAssignment(orderId: number, driverId: number) {
  await raw.orderDeliveryAssignment.create({
    data: { orderId, deliveryId: driverId, status: AssignmentStatus.PENDING, expiresAt: new Date(Date.now() + 600_000) },
  });
}

async function availableNow(driverId: number): Promise<boolean> {
  const d = await raw.deliveryDetails.findUnique({ where: { userId: driverId }, select: { availableNow: true } });
  return !!d?.availableNow;
}

async function getMode(): Promise<string | null> {
  const s = await raw.settings.findUnique({ where: { setting: 'deliveryAssignmentMode' }, select: { value: true } });
  return s?.value ?? null;
}

async function setMode(value: 'AUTO' | 'MANUAL') {
  await raw.settings.upsert({
    where: { setting: 'deliveryAssignmentMode' },
    update: { value },
    create: { setting: 'deliveryAssignmentMode', value, domain: 'DELIVERY' as any, dataType: 'STRING' as any },
  });
}

async function main() {
  const adminRole = await raw.role.findFirst({ where: { roleKey: 'ADMIN' }, select: { id: true } });
  if (!adminRole) throw new Error('Role "ADMIN" not found — run "npm run db:seed" first.');
  const nonAdmin = await raw.role.findFirst({ where: { roleKey: { not: 'ADMIN' } }, select: { id: true, roleKey: true } });
  if (!nonAdmin) throw new Error('No non-admin role found — run "npm run db:seed" first.');
  nonAdminRoleId = nonAdmin.id;
  nonAdminRoleKey = nonAdmin.roleKey;

  console.log('Booting Nest application context...');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  console.log('✅ DI graph booted (forwardRef + AfkBreakService wiring resolved).\n');

  // Stop all cron jobs so scheduled ticks don't race our assertions.
  try {
    const reg = app.get(SchedulerRegistry);
    let stopped = 0;
    reg.getCronJobs().forEach((job) => { try { job.stop(); stopped++; } catch { /* ignore */ } });
    console.log(`Stopped ${stopped} cron job(s) for the duration of the test.\n`);
  } catch (e) {
    console.log(`(could not access SchedulerRegistry: ${(e as Error).message})\n`);
  }

  const afk = app.get(AfkBreakService);
  const timer = app.get(AssignmentTimerService);
  const resume = app.get(AfkBreakResumeService);
  const availability = app.get(DeliveryAvailabilityService);
  const delivery = app.get(DeliveryService);
  const orders = app.get(OrderService);

  const customer = await makeUser(nonAdminRoleId, nonAdminRoleKey);

  // ---------------------------------------------------------------
  console.log('1) AfkBreakService Redis primitives');
  {
    const d = await makeDriver();
    await afk.suspend(d);
    check('suspend -> isOnBreak true', await afk.isOnBreak(d));
    const until = await afk.getBreakUntil(d);
    check('getBreakUntil is in the future', !!until && until.getTime() > Date.now());
    await afk.markPending(d);
    check('markPending -> hasPending true', await afk.hasPending(d));
    await afk.clearPending(d);
    check('clearPending -> hasPending false', !(await afk.hasPending(d)));
    await afk.clearBreak(d);
    check('clearBreak -> isOnBreak false', !(await afk.isOnBreak(d)));
    // due detection
    await redisClient.zadd(BREAKS_KEY, Date.now() - 1000, String(d));
    check('getDueBreaks includes a past-scored driver', (await afk.getDueBreaks()).includes(d));
    await afk.clearBreak(d);
  }

  // ---------------------------------------------------------------
  console.log('\n2) Idle driver times out -> immediate break');
  {
    const d = await makeDriver({ availableNow: true });
    const o = await createOrder(customer, OrderType.DELIVERY, OrderStatus.READY_PICKUP);
    await pastAssignment(o, d);
    await timer.checkTimedOutAssignments();

    const a = await raw.orderDeliveryAssignment.findFirst({ where: { orderId: o, deliveryId: d }, select: { status: true } });
    check('assignment marked TIMEOUT', a?.status === AssignmentStatus.TIMEOUT, `got ${a?.status}`);
    check('driver benched (availableNow=false)', !(await availableNow(d)));
    check('driver isOnBreak', await afk.isOnBreak(d));
    check('NOT deferred (hasPending=false)', !(await afk.hasPending(d)));
    const log = await raw.log.findFirst({ where: { userId: String(d), action: 'AFK_BREAK' } });
    check('AFK_BREAK audit log written', !!log);
  }

  // ---------------------------------------------------------------
  console.log('\n3) Busy driver (active trip) times out -> deferred, not benched');
  {
    const d = await makeDriver({ availableNow: true });
    await createOrder(customer, OrderType.DELIVERY, OrderStatus.ON_THE_WAY, d); // active trip
    const o = await createOrder(customer, OrderType.DELIVERY, OrderStatus.READY_PICKUP);
    await pastAssignment(o, d);
    await timer.checkTimedOutAssignments();

    check('break deferred (hasPending=true)', await afk.hasPending(d));
    check('NOT benched mid-trip (availableNow=true)', await availableNow(d));
    check('NOT on break yet (isOnBreak=false)', !(await afk.isOnBreak(d)));
    await afk.clearPending(d);
  }

  // ---------------------------------------------------------------
  console.log('\n4) applyAfkBreakNow (the path the DELIVERED hook calls)');
  {
    const d = await makeDriver({ availableNow: true });
    await orders.applyAfkBreakNow(d, 'Deferred Driver');
    check('driver benched', !(await availableNow(d)));
    check('driver isOnBreak', await afk.isOnBreak(d));
    const log = await raw.log.findFirst({ where: { userId: String(d), action: 'AFK_BREAK' } });
    check('AFK_BREAK audit log written', !!log);
  }

  // ---------------------------------------------------------------
  console.log('\n5) Resume when break is up AND still in shift -> back online');
  {
    const d = await makeDriver({ availableNow: false, forceAvailable: true }); // forceAvailable => "in shift" w/o tz-fragile schedule
    await redisClient.zadd(BREAKS_KEY, Date.now() - 1000, String(d)); // due
    await resume.resumeDueBreaks();
    check('driver back online (availableNow=true)', await availableNow(d));
    check('break cleared (isOnBreak=false)', !(await afk.isOnBreak(d)));
  }

  // ---------------------------------------------------------------
  console.log('\n6) Resume when break is up but OUT of shift -> stays offline');
  {
    const d = await makeDriver({ availableNow: false, forceAvailable: false }); // no schedule today
    await redisClient.zadd(BREAKS_KEY, Date.now() - 1000, String(d)); // due
    await resume.resumeDueBreaks();
    check('driver stays offline (availableNow=false)', !(await availableNow(d)));
    check('break still cleared (isOnBreak=false)', !(await afk.isOnBreak(d)));
  }

  // ---------------------------------------------------------------
  console.log('\n7) Guard: manual assign rejected for a driver on break');
  {
    const d = await makeDriver();
    await afk.suspend(d);
    const o = await createOrder(customer, OrderType.DELIVERY, OrderStatus.READY_PICKUP);
    let threw = false;
    let msg = '';
    try { await orders.assign({ specialistId: d, orderIds: [o] } as any); }
    catch (e) { threw = true; msg = (e as Error).message; }
    check('assign throws for on-break driver', threw, msg);
    check('error mentions break', /break/i.test(msg), msg);
    const created = await raw.orderDeliveryAssignment.count({ where: { orderId: o } });
    check('no assignment row created', created === 0, `found ${created}`);
    await afk.clearBreak(d);
  }

  // ---------------------------------------------------------------
  console.log('\n8) Guard: checkIn rejected for a driver on break');
  {
    const d = await makeDriver();
    await afk.suspend(d);
    let threw = false;
    let msg = '';
    try { await delivery.checkIn(d, 999999999, { lat: 30, lng: 31 }); }
    catch (e) { threw = true; msg = (e as Error).message; }
    check('checkIn throws for on-break driver', threw, msg);
    check('error mentions break (not schedule)', /break/i.test(msg), msg);
    await afk.clearBreak(d);
  }

  // ---------------------------------------------------------------
  console.log('\n9) Guard: availability cron keeps an on-break driver offline');
  {
    // forceAvailable=true would normally be re-enabled by the cron; the break guard must override that.
    const d = await makeDriver({ availableNow: true, forceAvailable: true });
    await afk.suspend(d);
    await availability.checkAvailability();
    check('on-break driver forced offline despite forceAvailable', !(await availableNow(d)));
    await afk.clearBreak(d);
  }

  // ---------------------------------------------------------------
  console.log('\n10) Bulk assign: best-effort, PICKUP rejected, rows created');
  {
    const d = await makeDriver();
    const ok = await createOrder(customer, OrderType.DELIVERY, OrderStatus.READY_PICKUP);
    const pickup = await createOrder(customer, OrderType.PICKUP, OrderStatus.READY_PICKUP);
    const res: any = await orders.assign({ specialistId: d, orderIds: [ok, pickup] } as any);
    check('succeeded contains the delivery order', res.succeeded?.includes(ok), JSON.stringify(res));
    check('failed contains the pickup order', res.failed?.some((f: any) => f.orderId === pickup), JSON.stringify(res));
    const createdOk = await raw.orderDeliveryAssignment.count({ where: { orderId: ok } });
    const createdPickup = await raw.orderDeliveryAssignment.count({ where: { orderId: pickup } });
    check('assignment row created for delivery order', createdOk === 1, `got ${createdOk}`);
    check('no assignment row for pickup order', createdPickup === 0, `got ${createdPickup}`);
  }

  // ---------------------------------------------------------------
  console.log('\n11) Batch accept: accepts all live pending, skips expired ones');
  {
    const d = await makeDriver();
    const o1 = await createOrder(customer, OrderType.DELIVERY, OrderStatus.READY_PICKUP);
    const o2 = await createOrder(customer, OrderType.DELIVERY, OrderStatus.READY_PICKUP);
    const expired = await createOrder(customer, OrderType.DELIVERY, OrderStatus.READY_PICKUP);
    await futureAssignment(o1, d);
    await futureAssignment(o2, d);
    await pastAssignment(expired, d); // already expired -> must be excluded from the batch

    const res: any = await orders.acceptAllPendingAssignments(d);
    check('succeeded contains both live orders', res.succeeded?.includes(o1) && res.succeeded?.includes(o2), JSON.stringify(res));
    check('expired order NOT in succeeded', !res.succeeded?.includes(expired), JSON.stringify(res));
    check('no failures', (res.failed?.length ?? 0) === 0, JSON.stringify(res));

    const a1 = await raw.orderDeliveryAssignment.findFirst({ where: { orderId: o1, deliveryId: d }, select: { status: true } });
    const a2 = await raw.orderDeliveryAssignment.findFirst({ where: { orderId: o2, deliveryId: d }, select: { status: true } });
    check('both assignments ACCEPTED', a1?.status === AssignmentStatus.ACCEPTED && a2?.status === AssignmentStatus.ACCEPTED, `${a1?.status}/${a2?.status}`);

    const ord1 = await raw.order.findUnique({ where: { id: o1 }, select: { deliveryId: true, status: true } });
    check('order assigned to driver', ord1?.deliveryId === d, `deliveryId=${ord1?.deliveryId}`);
    check('order moved READY_PICKUP -> ON_THE_WAY', ord1?.status === OrderStatus.ON_THE_WAY, `status=${ord1?.status}`);

    const ax = await raw.orderDeliveryAssignment.findFirst({ where: { orderId: expired, deliveryId: d }, select: { status: true } });
    check('expired assignment left untouched (still PENDING)', ax?.status === AssignmentStatus.PENDING, `status=${ax?.status}`);
  }

  // ---------------------------------------------------------------
  console.log('\n12) Auto-re-assignment on timeout respects the assignment mode');
  const originalMode = await getMode();
  try {
    // --- AUTO mode: the timed-out order SHOULD be re-assigned ---
    await setMode('AUTO');
    {
      const a = await makeDriver({ availableNow: true }); // times out -> benched + excluded
      await makeDriver({ availableNow: true }); // guarantees an eligible recipient exists
      // CUSTOM_DELIVERY carries its own pickup coords, so nearest-driver search has a location.
      const o = await createOrder(customer, OrderType.CUSTOM_DELIVERY, OrderStatus.PENDING, undefined, { lat: 30.0444, lng: 31.2357 });
      await pastAssignment(o, a);
      await timer.checkTimedOutAssignments();

      const aAssign = await raw.orderDeliveryAssignment.findFirst({ where: { orderId: o, deliveryId: a }, select: { status: true } });
      check('AUTO: original assignment marked TIMEOUT', aAssign?.status === AssignmentStatus.TIMEOUT, `got ${aAssign?.status}`);
      const reassigned = await raw.orderDeliveryAssignment.findFirst({
        where: { orderId: o, status: AssignmentStatus.PENDING, expiresAt: { gt: new Date() } },
        select: { deliveryId: true },
      });
      check('AUTO: order re-assigned (fresh PENDING assignment exists)', !!reassigned, 'no new assignment found');
      check('AUTO: re-assignment skips the timed-out driver', !!reassigned && reassigned.deliveryId !== a, `went to ${reassigned?.deliveryId}`);
    }

    // --- MANUAL mode: the timed-out order should NOT be re-assigned ---
    await setMode('MANUAL');
    {
      const a = await makeDriver({ availableNow: true });
      await makeDriver({ availableNow: true });
      const o = await createOrder(customer, OrderType.CUSTOM_DELIVERY, OrderStatus.PENDING, undefined, { lat: 30.0444, lng: 31.2357 });
      await pastAssignment(o, a);
      await timer.checkTimedOutAssignments();

      const aAssign = await raw.orderDeliveryAssignment.findFirst({ where: { orderId: o, deliveryId: a }, select: { status: true } });
      check('MANUAL: original assignment marked TIMEOUT', aAssign?.status === AssignmentStatus.TIMEOUT, `got ${aAssign?.status}`);
      const reassigned = await raw.orderDeliveryAssignment.findFirst({
        where: { orderId: o, status: AssignmentStatus.PENDING, expiresAt: { gt: new Date() } },
      });
      check('MANUAL: order NOT re-assigned (left for the moderator)', !reassigned, 'unexpected new assignment created');
    }
  } finally {
    if (originalMode === null) await raw.settings.deleteMany({ where: { setting: 'deliveryAssignmentMode' } });
    else await setMode(originalMode as 'AUTO' | 'MANUAL');
  }

  // ---------------------------------------------------------------
  console.log(`\n================  ${passed} passed, ${failed} failed  ================`);

  await app.close();
  process.exitCode = failed === 0 ? 0 : 1;
}

async function cleanup() {
  if (KEEP) {
    console.log(`\n--keep set: left ${userIds.length} users / ${orderIds.length} orders behind.`);
    return;
  }
  try {
    await raw.orderDeliveryAssignment.deleteMany({ where: { OR: [{ orderId: { in: orderIds } }, { deliveryId: { in: driverIds } }] } });
    await raw.order.deleteMany({ where: { id: { in: orderIds } } });
    await raw.log.deleteMany({ where: { userId: { in: driverIds.map(String) }, action: 'AFK_BREAK' } });
    await raw.user.deleteMany({ where: { id: { in: userIds } } }); // cascades DeliveryDetails + schedules
    for (const id of driverIds) { await redisClient.zrem(BREAKS_KEY, String(id)); await redisClient.del(pendingKey(id)); }
    console.log('\nCleaned up test rows + Redis keys.');
  } catch (e) {
    console.log(`\n(cleanup warning: ${(e as Error).message})`);
  }
}

main()
  .catch((e) => { console.error('\nFatal:', e); process.exitCode = 1; })
  .finally(async () => {
    await cleanup();
    await raw.$disconnect();
    try { await redisClient.quit(); } catch { /* ignore */ }
  });
