import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import * as fs from 'fs';

// Endpoints added or behaviorally changed during this engagement — kept here so
// the standalone "/docs/new-endpoints" Swagger page can be regenerated as more
// work lands. Remove entries (or the whole call site) once the frontend team no
// longer needs an isolated test surface separate from the full API doc.
const NEW_ENDPOINTS: Array<[string, string[]]> = [
  ['/api/stores', ['post', 'get']],
  ['/api/stores/{id}', ['patch']],
  ['/api/stores/{id}/approval', ['patch']],
  ['/api/stores/{id}/apply-template/{templateId}', ['delete']],
  ['/api/stores/me/wallet', ['get']],
  ['/api/statistics', ['get']],
  ['/api/statistics/reset-period', ['post']],
  ['/api/statistics/store', ['get']],
  ['/api/statistics/store/reset-period', ['post']],
  ['/api/delivery/me/wallet', ['get']],
  ['/api/delivery/me/withdraw', ['post']],
  ['/api/delivery/me/withdrawals', ['get']],
  ['/api/delivery/withdrawals', ['get']],
  ['/api/delivery/withdrawals/{id}', ['get', 'patch']],
  ['/api/delivery/cash-settlements', ['post', 'get']],
  ['/api/delivery/cash-settlements/{id}', ['get']],
  ['/api/withdraw', ['post', 'get']],
  ['/api/withdraw/{id}', ['patch']],
  ['/api/employees', ['get', 'post']],
  ['/api/employees/{id}', ['get', 'patch', 'delete']],
  ['/api/orders', ['post']],
  ['/api/orders/{id}/unassign', ['patch']],
  ['/api/orders/{id}/{status}', ['patch']],
  ['/api/orders/{id}/reject', ['patch']],
  ['/api/orders/{id}/accept', ['patch']],
  ['/api/orders/{id}/reorder', ['post']],
  ['/api/orders/{id}/verify-payment', ['patch']],
  ['/api/orders/assign', ['patch']],
  ['/api/orders/custom-delivery/calculate', ['post']],
  ['/api/orders/custom-delivery', ['post']],
  ['/api/orders/custom-delivery/images', ['post']],
  ['/api/orders/custom-delivery/{id}/advance', ['patch']],
  ['/api/orders/custom-delivery/{id}/finish', ['patch']],
  ['/api/orders/online-delivery/seller-profile', ['get']],
  ['/api/orders/online-delivery/calculate', ['post']],
  ['/api/orders/online-delivery', ['post']],
  ['/api/admin-notifications', ['post']],
  ['/api/search', ['get']],
  ['/api/settings', ['get', 'patch']],
  ['/api/authentication/refresh-token', ['post']],
  ['/api/authentication/google', ['post']],
  ['/api/zones', ['get', 'post']],
  ['/api/zones/{id}', ['patch']],
  ['/api/stores/{id}/zone-pricing/toggle', ['patch']],
  ['/api/stores/{id}/effective-zone-prices', ['get']],
  ['/api/stores/{id}/zone-prices', ['get', 'patch']],
  ['/api/stores/{id}/zone-prices/{zoneId}', ['delete']],
];

// Plain-English "what this does" summaries, shown under each endpoint's title in
// the standalone new-endpoints Swagger page. Keyed by "METHOD /path".
const NEW_ENDPOINT_DESCRIPTIONS: Record<string, string> = {
  'POST /api/stores':
    'Register a new store. Self-registered stores start pending admin approval (isStoreAccepted=false); stores created by an Admin are approved immediately.',
  'GET /api/stores':
    'List/search stores. Supports ?isStoreAccepted=false to build an admin queue of stores awaiting approval.',
  'PATCH /api/stores/{id}':
    'Update store profile fields. isStoreAccepted, isBlocked and isVerified are silently stripped from the body unless the caller is an Admin.',
  'PATCH /api/stores/{id}/approval':
    'Admin approves or rejects a pending store registration. Sends a push notification to the store owner with the result.',
  'DELETE /api/stores/{id}/apply-template/{templateId}':
    'Removes a previously-applied admin template from one store only, without affecting the template itself or any other store using it.',
  'GET /api/statistics':
    'Admin earnings/orders dashboard summary. Includes a currentPeriod block (since the last manual reset) and a driverFinance block (pending withdrawals, outstanding driver cash).',
  'POST /api/statistics/reset-period':
    'Moves the admin dashboard\'s "current period" checkpoint to now. Never deletes or alters any historical order/transaction data.',
  'GET /api/statistics/store':
    "Store-owner earnings dashboard summary, scoped to the caller's own store. Includes the same currentPeriod block.",
  'POST /api/statistics/store/reset-period':
    'Moves the calling store\'s own "current period" checkpoint to now.',
  'GET /api/delivery/me/wallet':
    "Driver's own wallet breakdown: `total` (cash currently held, awaiting settlement), `commission` (platform/store commission + tax embedded in that cash, owed back), `delivery` (their own cumulative delivery-fee earnings, withdrawable), plus pending/withdrawn totals.",
  'POST /api/delivery/me/withdraw':
    'Driver requests a payout of their delivery earnings via Cash / Vodafone Cash / InstaPay. Only one request can be pending at a time.',
  'GET /api/delivery/me/withdrawals':
    "Driver's own withdrawal request history and status.",
  'GET /api/delivery/withdrawals':
    "Admin: list all drivers' withdrawal requests, filterable by status/driver.",
  'GET /api/delivery/withdrawals/{id}':
    'Admin: fetch a single driver withdrawal request.',
  'PATCH /api/delivery/withdrawals/{id}':
    "Admin approves or denies a driver's withdrawal request. Approving deducts the wallet and records the payout; denying leaves the wallet untouched.",
  'POST /api/delivery/cash-settlements':
    "Admin records cash a driver has physically handed over from COD orders. This call is itself the confirmation (no separate approval step) and immediately reduces the driver's outstanding collected-cash balance.",
  'GET /api/delivery/cash-settlements':
    'Admin: cash settlement history, filterable by driver.',
  'GET /api/delivery/cash-settlements/{id}':
    'Admin: fetch a single cash settlement record.',
  'GET /api/employees': "List a store's employees.",
  'POST /api/employees':
    'Store owner creates an employee account under an existing custom role — the role must already exist via POST /roles first.',
  'GET /api/employees/{id}': 'Fetch a single employee.',
  'PATCH /api/employees/{id}':
    "Update an employee. Enforces that the employee belongs to the caller's own store.",
  'DELETE /api/employees/{id}':
    "Remove an employee. Enforces that the employee belongs to the caller's own store.",
  'POST /api/orders':
    "Places a new order. Starts at status PENDING; only the store is notified at this point. Driver-assignment search no longer starts in parallel — it only begins once the store accepts (PREPARING), per the AUTO/MANUAL assignment flow described in HANDOFF.md §6. Optional zoneId (customerSelectedZoneId) — the zone the customer picked from a dropdown; takes priority for pricing over the address's real zone when it has a price set (see HANDOFF.md §20/§22).",
  'PATCH /api/orders/{id}/unassign':
    'Removes the currently assigned driver from an order and resets its status back to READY_PICKUP so it can be re-offered.',
  'PATCH /api/orders/{id}/{status}':
    'Generic order status transition (store: PREPARING / READY_PICKUP / REJECTED / CANCELLED; driver: ON_THE_WAY / DELIVERED). Driver transitions require lat/lng in the body and are geofence-checked against the store or customer address. PREPARING (store accept) is now the moment driver-assignment gets scheduled — see driverAssignmentDelaySeconds setting.',
  'PATCH /api/orders/{id}/reject':
    'Driver declines an assignment offer. Benches the driver (AFK break, if enabled) and re-runs assignment for the order — next-nearest driver in AUTO mode, or left unassigned for the admin to pick in MANUAL mode.',
  'PATCH /api/orders/{id}/accept':
    'Driver accepts a pending assignment offer, binding them to the order. Fails if the store has already rejected/cancelled the order in the meantime.',
  'POST /api/orders/{id}/reorder':
    "Re-submits a past order's items/bundles as a brand-new order, re-priced from scratch against current menu prices — not a copy of the old invoice. Regular store orders only (not custom-delivery).",
  'PATCH /api/orders/{id}/verify-payment':
    'Admin or Store approves/rejects a WALLET-payment (Vodafone Cash / InstaPay / Bank Transfer) transfer proof. Approving moves PENDING_PAYMENT -> PENDING and notifies the store; rejecting moves it to PAYMENT_FAILD with a reason sent to the customer.',
  'PATCH /api/orders/assign':
    'Admin manually assigns one or more orders to a specific driver — used in MANUAL assignment mode, or to override AUTO.',
  'POST /api/orders/custom-delivery/calculate':
    'Price preview for a purchase-type custom-delivery (private courier) order — multi-stop, independent pricing settings from regular store delivery.',
  'POST /api/orders/custom-delivery':
    'Creates a Purchase or Restaurant custom-delivery order — pass "kind": "PURCHASE" | "RESTAURANT" (default PURCHASE if omitted). Mechanically identical either way; only customDeliveryKind on the response differs, for the frontend to pick its labels. Gated by the customDeliveryEnabled setting. Stops may optionally carry a zoneId — for a 2-stop trip, takes priority for pricing over the zone resolved from lat/lng when it has a price set (lat/lng still required either way, see HANDOFF.md §18/§20).',
  'POST /api/orders/custom-delivery/images':
    'Uploads one or more station photos before creating a custom-delivery order; returns image ids to attach per stop on creation.',
  'PATCH /api/orders/custom-delivery/{id}/advance':
    'Driver marks the current custom-delivery station reached and moves to the next one.',
  'PATCH /api/orders/custom-delivery/{id}/finish':
    'Driver completes the final custom-delivery station — order moves to DELIVERED.',
  'GET /api/orders/online-delivery/seller-profile':
    "Returns the calling customer's saved online-seller profile (sender name/phone/pickup zone), or null if none saved yet.",
  'POST /api/orders/online-delivery/calculate':
    'Price preview for a batched online-seller delivery order — one pickup + a "recipients" array (one entry per "+ إضافة طلب" the seller adds), zone-based only (no map/location). Same body as POST /api/orders/online-delivery.',
  'POST /api/orders/online-delivery':
    'Creates a batched online-seller delivery order — one fixed sender + a "recipients" array, each becoming its own dropoff station, all confirmed together as ONE order (redesigned this round — was previously one sender + one recipient per call, see HANDOFF.md §19). A wholly separate system from Purchase/Restaurant custom-delivery (own settings/validation), built on the same Order/OrderStation tables so it shares the same driver pool and the same advance/finish endpoints. Sender fields are optional after the first call — omit them to reuse the saved seller profile (isOnlineSeller: true saves/refreshes it). Each recipient supports its own collectionAmount (cash to collect, data-only for now) and packagingRequested flag.',
  'POST /api/admin-notifications':
    "Admin broadcasts a notification (multipart if an image is attached). Supports clickTargetType: SPECIAL_DRIVER + clickDeliveryId to deep-link the notification to a specific driver's profile, same pattern as Campaign banners.",
  'GET /api/stores/me/wallet':
    "Store's own wallet: total (currentBalance, summed across all its branches, withdrawable) and commissionDeducted (cumulative platform commission taken — transparency figure, no balance effect). Fixed a bug where this previously read the wrong table entirely and returned meaningless data.",
  'POST /api/withdraw':
    'Store requests a payout of its wallet balance via Cash / Vodafone Cash / InstaPay — no bank account required (the old BankAccount/Bank system was removed). Body: { amount, branchId, payoutMethod, payoutDetails }.',
  'GET /api/withdraw':
    'List/filter store withdrawal requests (?branchId=, ?storeId=, ?status=).',
  'PATCH /api/withdraw/{id}':
    "Admin approves or denies a store's withdrawal request. Approving deducts the branch wallet and records the payout; denying leaves it untouched.",
  'GET /api/search':
    'Global search across stores/services/etc. Now requires a logged-in session (previously open to anonymous callers).',
  'GET /api/settings':
    'Fetch app-wide configuration, filterable by domain/key. Public — no auth required.',
  'PATCH /api/settings':
    'Admin updates one or more configuration values, including the delivery geofence radii and custom-delivery pricing settings.',
  'POST /api/authentication/refresh-token':
    'Exchanges a refresh token for a new access token. Refresh tokens now actually live for their full configured duration (previously capped at 1 day regardless of setting).',
  'GET /api/zones':
    'Fetch list of zones. Supports cityId query parameter to filter zones by city. Includes deliveryPrice (fixed app-wide delivery price for the zone, if the admin set one — see HANDOFF.md §20).',
  'POST /api/zones':
    'Admin creates a zone (name, coordinates polygon, optional cityId, optional deliveryPrice). deliveryPrice, if set, overrides the km-formula app-wide for this zone (regular delivery, Purchase/Restaurant 2-stop custom-delivery, and each Online-delivery recipient).',
  'PATCH /api/zones/{id}':
    'Admin updates a zone, including deliveryPrice. Omit/leave null to keep the km-formula fallback for that zone. Note: due to a pre-existing, codebase-wide convention on the numeric-field decorator, an explicit null in the request body is treated as "not sent" — deliveryPrice can only be set to a new value, not explicitly cleared back to null via this endpoint.',
  'POST /api/authentication/google':
    'Customer-only "Sign in with Google" — send the ID token from the client\'s Google Sign-In SDK; verifies it server-side and both registers (first time) and logs in (every time after) in one call. Same response shape as POST /authentication/login/:roleKey. Requires GOOGLE_CLIENT_IDS to be configured server-side first (see HANDOFF.md §23) — rejected with a clear config error otherwise.',
  'PATCH /api/stores/{id}/zone-pricing/toggle':
    "Admin-only — turns per-store zone pricing on/off for one specific store (see HANDOFF.md §21). Body: { enabled: boolean }. Never exposed on the generic PATCH /stores/{id}.",
  'GET /api/stores/{id}/effective-zone-prices':
    "Public/visitor — use this for the customer app's zone picker while ordering from this specific store (GET /zones is store-agnostic). Returns the price actually charged per zone: this store's own price if enabled+set, else the app-wide zone price, else null (km-formula applies).",
  'GET /api/stores/{id}/zone-prices':
    "Store (own store) or Admin — every admin-defined active zone plus this store's own price for it (null if unset). The 'template' list for the store's own zone-pricing screen. Shows raw configured prices even while zonePricingEnabled is off — use GET /stores/{id}/effective-zone-prices for the customer-facing effective price instead.",
  'PATCH /api/stores/{id}/zone-prices':
    "Store (own store) or Admin — upserts a batch of the store's own per-zone prices: { zonePrices: [{ zoneId, price }] }. Rejected with a clear 400 if the admin hasn't enabled zone pricing for this store yet.",
  'DELETE /api/stores/{id}/zone-prices/{zoneId}':
    "Store (own store) or Admin — clears the store's own price override for one zone, reverting it to the app-wide price/km-formula for that store.",
};

// Subsets a full OpenAPI document down to NEW_ENDPOINTS, resolving every
// transitively-referenced component schema so the result has no dangling $refs.
function buildNewEndpointsDocument(fullDocument: OpenAPIObject): OpenAPIObject {
  const filteredPaths: OpenAPIObject['paths'] = {};
  for (const [path, methods] of NEW_ENDPOINTS) {
    const pathItem = fullDocument.paths[path];
    if (!pathItem) continue;
    const entry: Record<string, any> = {};
    for (const method of methods) {
      if (!pathItem[method]) continue;
      const operation = { ...pathItem[method] };
      const description =
        NEW_ENDPOINT_DESCRIPTIONS[`${method.toUpperCase()} ${path}`];
      if (description) {
        operation.summary = description;
        operation.description = description;
      }
      entry[method] = operation;
    }
    if (Object.keys(entry).length) filteredPaths[path] = entry;
  }

  const allSchemas = fullDocument.components?.schemas ?? {};
  const needed = new Set<string>();
  const refRegex = /^#\/components\/schemas\/(.+)$/;

  const walk = (node: unknown) => {
    if (Array.isArray(node)) {
      node.forEach(walk);
    } else if (node && typeof node === 'object') {
      const ref = (node as any).$ref;
      if (typeof ref === 'string') {
        const match = refRegex.exec(ref);
        if (match) needed.add(match[1]);
      }
      Object.values(node).forEach(walk);
    }
  };

  walk(filteredPaths);
  let frontier = new Set(needed);
  while (frontier.size) {
    const next = new Set<string>();
    for (const name of frontier) {
      const schema = allSchemas[name];
      if (!schema) continue;
      const before = new Set(needed);
      walk(schema);
      for (const n of needed) if (!before.has(n)) next.add(n);
    }
    frontier = next;
  }

  const filteredSchemas: Record<string, any> = {};
  for (const name of needed) {
    if (allSchemas[name]) filteredSchemas[name] = allSchemas[name];
  }

  return {
    ...fullDocument,
    info: {
      ...fullDocument.info,
      title: `${fullDocument.info.title} — New & Fixed Endpoints`,
      description:
        'Standalone subset of the full API, containing only the endpoints added or behaviorally changed during this engagement — for isolated testing.',
    },
    paths: filteredPaths,
    components: {
      ...fullDocument.components,
      schemas: filteredSchemas,
    },
  };
}

export const swaggerConfig = (app: INestApplication) => {
  const configService = app.get(ConfigService);
  const getEnv = (key: string) => configService.get<string>(key) || '';
  const prefix = getEnv('API_PREFIX') || '';

  const restApiConfig = new DocumentBuilder()
    .setTitle(getEnv('PROJECT_NAME'))
    .setDescription(getEnv('PROJECT_DESCRIPTION'))
    .setVersion('1.0')
    .setContact(
      getEnv('PROJECT_CONTACT_NAME'),
      getEnv('PROJECT_CONTACT_URL'),
      getEnv('PROJECT_CONTACT_EMAIL'),
    )
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
      },
      'ACCESS Token',
    )
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
      },
      'REFRESH Token',
    )
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
      },
      'PASSWORD_RESET Token',
    )
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
      },
      'VERIFY Token',
    )
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
      },
      'VISITOR Token',
    )
    .addGlobalParameters({
      in: 'header',
      required: false,
      name: 'Locale',
      schema: { example: 'en' },
    })
    .addGlobalParameters({
      in: 'header',
      required: false,
      name: 'isLocalized',
      schema: { example: false, type: 'boolean', enum: [true, false] },
    })
    .build();

  const restApiDocument = SwaggerModule.createDocument(app, restApiConfig);

  // Only setup once
  SwaggerModule.setup(`${prefix}/docs`, app, restApiDocument, {
    customSiteTitle: getEnv('PROJECT_NAME') + ' API Docs',
    customfavIcon: 'media?media=swagger.png',
    customCss: `
    .topbar-wrapper::after {
      content: " ${process.env.PROJECT_NAME} | Mahmoud Elamrosy";
      color: #a6e22e !important; /* Match curl URL color */
      font-size: 14px;
      display: inline-block;
      vertical-align: middle;
      margin-left: 30px;
    }
  `,

    swaggerOptions: {
      docExpansion: 'none',
      filter: true,
    },
  });

  // Isolated Swagger page covering only this engagement's new/fixed endpoints, so
  // the frontend team can test them without wading through the full ~180-route API.
  const newEndpointsDocument = buildNewEndpointsDocument(restApiDocument);
  SwaggerModule.setup(
    `${prefix}/docs/new-endpoints`,
    app,
    newEndpointsDocument,
    {
      customSiteTitle: getEnv('PROJECT_NAME') + ' — New Endpoints',
      customfavIcon: 'media?media=swagger.png',
      swaggerOptions: {
        docExpansion: 'list',
        filter: true,
      },
    },
  );

  const outputPath = './swagger-spec.json'; // Path where the JSON will be saved
  // The spec snapshot is a dev tooling artifact (compare:swagger). In prod the
  // container runs as a non-root user against a root-owned /app, so this write is
  // denied (EACCES). Treat a failed write as non-fatal so it never blocks boot.
  try {
    fs.writeFileSync(outputPath, JSON.stringify(restApiDocument, null, 2), {
      encoding: 'utf8',
    });
    // eslint-disable-next-line no-console
    console.log(`Swagger JSON saved to ${outputPath}`);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`Skipped writing ${outputPath}: ${err?.message ?? err}`);
  }
};
