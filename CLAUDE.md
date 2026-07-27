# CLAUDE.md — Makanak API

Guidance for Claude Code when working in this repository.

## What this is

**Makanak** is a multi-vendor delivery platform backend (food / grocery / pharmacy / custom
delivery) for the Egypt market. It serves three client surfaces: a **customer mobile app**, a
**driver (delivery) app**, and an **admin/store-owner dashboard**.

> Note: package name, env `PROJECT_NAME` ("Bookspa"), and the Swagger title are leftovers from a
> template/previous project. The product is **Makanak**. Don't "fix" these unless asked.

The roadmap for this engagement lives in two docs **one level up** from this repo:
- `../TECHNICAL_AUDIT.md` — 32 feature/bug items with status, complexity, effort, and risk.
- `../PROJECT_PHASES.md` — the phased delivery plan (Phase 0 bugs → Phase 8 chat).

Read those before starting a roadmap task. When asked for "Req N" or "Phase X / Bx / Fx", they
refer to those files.

## Stack

NestJS 10 · Prisma 5 (`@prisma/client`) · **MySQL** · Redis (ioredis + Bull queue) · Socket.IO ·
Firebase FCM (push) · Kashier + Stripe + Wallet (payments) · Cloudinary + S3 + local uploads ·
Sentry + Prometheus (`prom-client`) · nestjs-i18n (ar/en) · `@turf/turf` (geo).

> The audit/phase docs say "PostgreSQL" in one header line — that is wrong. The datasource is
> **MySQL** (`prisma/schema/schema.prisma`, `DATABASE_URL` in `.env`).

## First-time setup (not yet done in this checkout)

`node_modules` is **not installed**, the Prisma client is **not generated**, and this is **not a
git repo**. Before running anything:

```powershell
npm install            # lockfiles: both package-lock.json and pnpm-lock.yaml exist — prefer npm
npm run db:generate    # prisma generate
```

A running **MySQL** (default `127.0.0.1:3306`, see `DATABASE_URL`) and **Redis**
(`127.0.0.1:6379`) are required for the app to boot. Confirm with the user before assuming either
is available. Do not run `npm install` or start servers without the user asking.

## Run / build / test

| Command | What it does |
|---|---|
| `npm run start:dev` | Watch-mode dev server (`nest start --watch`) |
| `npm run build` | `nest build` |
| `npm test` | Jest unit tests |
| `npm run test:watch` | Jest watch |
| `npm run db:generate` | `prisma generate` |
| `npm run db:sync` | `prisma db push` (pushes schema, **no migration history**) |
| `npm run db:seed` | Seed DB (`prisma/seeds/seed.ts`) |
| `npm run lint` | ESLint `--fix` |
| `npm run format` | Prettier |
| `npm run compare:swagger` | Diff current routes vs committed `swagger-spec.json` |

- Server: **port 3030**, global prefix **`/api`** (`PORT`, `API_PREFIX` in `.env`).
- **Swagger UI: `http://localhost:3030/api/docs`**. The spec is also written to `swagger-spec.json`
  at the repo root on every boot (committed snapshot, 145 routes / 43 tags) — read it to learn the
  API surface without booting.
- Socket.IO order tracking gateway (`/orders-tracking`), `SOCKET_PORT=1234`.

## Architecture & conventions

Feature-module layout under `src/_modules/<feature>/`. A module typically contains:

```
<feature>.module.ts
controllers/<feature>.controller.ts     # @Controller(prefix), @ApiTags(tag(prefix))
<feature>.service.ts                     # business logic
services/*.service.ts                    # extra services (helpers, assignment, timer, cron…)
dto/*.dto.ts                             # class-validator DTOs via custom decorators
prisma-args/*.prisma.args.ts             # reusable Prisma select/include objects (e.g. selectOrderOBJ)
cron/*.service.ts  gateways/*.gateway.ts # when present
```

- **App wiring:** all modules are registered in `src/app/app.module.ts`. New modules must be added
  there. Entry point `src/main.ts`; cross-cutting middleware (locale, xss, rate-limit, notification)
  applied globally in `AppModule.configure`.
- **Prisma:** single `PrismaService` (`src/globals/services/prisma.service.ts`) extends
  `PrismaClient`. Global middleware adds **soft-delete**, **sort**, and **exist-check** behavior
  (`prisma/middleware/*`). Schema is **split across files** in `prisma/schema/*.prisma`
  (`prismaSchemaFolder` preview feature) — `order.prisma`, `delivery`/`user`/`store`/`enum.prisma`,
  etc. Edit the right file, not one giant schema.
- **Auth:** `@Auth({ prefix })` decorator (`src/_modules/authentication/decorators/auth.decorator.ts`)
  wires the Passport JWT guard + permission/role guard. Token kinds via `SessionType`
  (ACCESS / REFRESH / PASSWORD_RESET / VERIFY / VISITOR). `@CurrentUser()`, `@AttachUserId()`,
  `@AttachStoreId()` inject context. `visitor: true` → optional auth.
- **i18n:** user-facing strings are bilingual `{ ar, en }`. Many model name fields are JSON
  multilingual (e.g. `Branch.name`, `Store.name`). Notifications use
  `notificationService.sendLocalizedNotification(...)`.
- **Responses:** controllers return through `ResponseService` (`this.response.created(res, msg, {data})`),
  not raw objects.
- **Custom decorators** for DTO validation and Swagger live in `src/decorators/**` — reuse them
  (`@RequiredInput`, validators for phone/email/json/etc.) instead of raw class-validator.

## Key domain facts (verified in code)

- `OrderStatus` enum (`prisma/schema/enum.prisma`): `PENDING, PREPARING, READY_PICKUP, ON_THE_WAY,
  DELIVERED, CANCELLED, REJECTED, PAYMENT_FAILD, PENDING_PAYMENT`. `OrderType`: `DELIVERY, PICKUP,
  CUSTOM_DELIVERY`. `ModuleType`: `GROCERY, RESTAURANT, PHARMACY, CUSTOM_DELIVERY`.
- **Driver assignment**: `OrderDeliveryAssignment` table + `services/assignment.service.ts`
  (`assignToNearestDelivery`). `services/timer.service.ts` runs every minute and — per the audit
  bug B1 — marks timed-out assignments `TIMEOUT` and notifies admin but **never re-assigns**.
- `Zone` model exists but is currently **unused** (no FK wiring) — relevant to the geo phase.
- Refresh-token infra exists (`SessionType.REFRESH`, `refreshToken()` endpoint, cookie config); the
  "login persistence" item is likely a client issue, not missing backend.
- **Time-of-day rules (driver shifts, store/branch hours) go through
  `src/globals/helpers/egypt-time.helper.ts`** (`Africa/Cairo`, DST-correct via `Intl`). Schedule
  `@db.Time` columns store the **literal Egypt wall-clock** (Option A) and are read with zero offset.
  Keep the container on **UTC** — do **not** set `TZ=Africa/Cairo` (it would re-break instant
  columns); correctness no longer depends on server TZ. `main.ts` asserts Cairo resolves at boot.

## Working agreements

- **Make surgical changes.** This is a live, above-average codebase. Match surrounding style;
  don't reformat files or "tidy" unrelated code.
- **No schema migration history exists** (project uses `prisma db push`, not `migrate`). Discuss any
  schema change with the user before pushing; coordinate column renames (e.g. tax→serviceFee) as the
  docs note (off-peak, rollback plan).
- Touching the **order flow, wallet, assignment, or notifications** is high-blast-radius — read the
  full method and its callers first, and prefer adding tests.
- Keep secrets out of commits. `.env` currently holds **live-looking credentials** (DB, Firebase,
  Kashier, mail, Google Maps) — do not echo them into logs, PRs, or external services.
- Since there's no git repo yet, there's no safety net for edits — be careful, and suggest
  `git init` before large changes if the user wants version control.
