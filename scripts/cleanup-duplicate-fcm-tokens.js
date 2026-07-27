/**
 * One-time cleanup for FCM token leakage across user accounts.
 *
 * Background: `sessions.fcm_token` has no unique constraint, so the same physical-device token
 * could end up attached to several DIFFERENT users' sessions (e.g. a shared/test device, or a new
 * account created on a device that previously logged in as someone else). When that happens,
 * `NotificationService.sendLocalizedNotification(userId)` finds the token under each user and pushes
 * every one of those users' notifications to the one device — so a customer receives other
 * customers' notifications.
 *
 * The code paths that write the token (TokenService.generateToken, UserService.updateCurrentUser,
 * UserService.updateNotificationSetting) now detach a token from other users before binding it, so
 * NEW writes self-heal. This script fixes the EXISTING dirty rows that predate that fix.
 *
 * Strategy (matches the login invariant "the last login owns the device"):
 *   For each fcm_token shared across >1 distinct user, keep it on the user with the MOST RECENT
 *   session and null it on every OTHER user's sessions. A token shared only within a single user
 *   (e.g. that user's paired ACCESS + REFRESH sessions on the same device) is left untouched.
 *   The mutation targets the exact loser session ids read during the scan, so a login that lands
 *   mid-run can never cause us to null a brand-new legitimate session.
 *
 * Safety: dry-run by default — prints exactly what it WOULD change and mutates nothing.
 *         Pass --apply to actually null the offending tokens.
 *
 * Plain CommonJS so it runs with `node` directly — no ts-node / tsconfig-paths needed. Requires a
 * generated Prisma client and DATABASE_URL in the environment (already set inside the deployed
 * container; locally it falls back to .env via dotenv if present).
 *
 * Run (dry-run):   node scripts/cleanup-duplicate-fcm-tokens.js
 * Run (apply):     node scripts/cleanup-duplicate-fcm-tokens.js --apply
 */
try {
  // Optional: load .env when running outside the container. In prod the env is already injected.
  require('dotenv/config');
} catch (_) {
  /* dotenv not installed / not needed — env already provided */
}
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const APPLY = process.argv.includes('--apply');

// Tokens attached to more than one DISTINCT user — the only ones that constitute a leak.
async function crossUserDuplicateTokens() {
  return prisma.$queryRawUnsafe(
    `SELECT fcm_token AS fcmToken,
            COUNT(DISTINCT user_id) AS users
     FROM sessions
     WHERE fcm_token IS NOT NULL
       AND user_id IS NOT NULL
     GROUP BY fcm_token
     HAVING COUNT(DISTINCT user_id) > 1`,
  );
}

async function main() {
  console.log(`Mode: ${APPLY ? 'APPLY (will modify rows)' : 'DRY-RUN (no changes)'}\n`);

  const dups = await crossUserDuplicateTokens();
  if (dups.length === 0) {
    console.log('✅ No FCM token is shared across multiple users. Nothing to clean.');
    return;
  }

  console.log(`Found ${dups.length} token(s) shared across multiple users:\n`);

  let tokensCleaned = 0;
  let sessionsDetached = 0;

  for (const { fcmToken } of dups) {
    // All sessions holding this token, newest first. The newest session's user is the current
    // device owner and keeps the token; everyone else loses it. The id tiebreak keeps the winner
    // deterministic when two sessions share an identical createdAt.
    const sessions = await prisma.session.findMany({
      where: { fcmToken, userId: { not: null } },
      select: { id: true, userId: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });

    const winnerId = sessions[0] && sessions[0].userId;
    if (winnerId == null) continue; // defensive: no owning user, skip

    const losers = sessions.filter((s) => s.userId !== winnerId);
    if (losers.length === 0) continue; // shared only within the winner — not a leak

    const loserIds = losers.map((s) => s.id);
    const loserUsers = [...new Set(losers.map((s) => s.userId))];
    // Mask the token in logs — never print the full device token (and don't leak short ones).
    const masked = fcmToken.length > 12 ? `${fcmToken.slice(0, 6)}…${fcmToken.slice(-4)}` : '[short-token]';
    console.log(
      `  token ${masked}: keep user ${winnerId} (latest), detach from user(s) [${loserUsers.join(
        ', ',
      )}] across ${loserIds.length} session(s).`,
    );

    if (APPLY) {
      // Target the exact loser session ids read above — not a fresh `userId != winner` predicate —
      // so a session created after the scan (e.g. the real owner's new login) is never touched.
      const { count } = await prisma.session.updateMany({
        where: { id: { in: loserIds } },
        data: { fcmToken: null },
      });
      sessionsDetached += count;
    } else {
      sessionsDetached += loserIds.length;
    }
    tokensCleaned += 1;
  }

  console.log(
    `\n${APPLY ? 'Detached' : 'Would detach'} the token from ${sessionsDetached} session(s) across ${tokensCleaned} token(s).`,
  );

  if (!APPLY) {
    console.log('\nRe-run with --apply to perform the cleanup.');
    return;
  }

  // Verify the invariant holds afterwards.
  const remaining = await crossUserDuplicateTokens();
  if (remaining.length === 0) {
    console.log('✅ Verified: no FCM token is shared across multiple users anymore.');
  } else {
    console.log(`⚠️  ${remaining.length} token(s) still shared across users — re-run to converge.`);
  }
}

main()
  .catch((e) => {
    console.error('\nError:', e.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
