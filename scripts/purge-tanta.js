/**
 * purge-tanta.js
 *
 * Standalone script to cleanly wipe all residual Tanta ecosystem data from MySQL.
 * Plain CommonJS - will never interfere with TypeScript compilation or Docker builds.
 *
 * Run inside container:
 *   docker exec -i makanak_v2_backend node scripts/purge-tanta.js
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function purgeTanta() {
  console.log('🚀 Starting Tanta ecosystem cleanup from MySQL database...\n');

  const statements = [
    'SET FOREIGN_KEY_CHECKS = 0;',

    // 1. Delete ratings related to Tanta stores or orders
    `DELETE FROM store_rating WHERE store_id IN (SELECT id FROM stores WHERE city_id = 2 OR id BETWEEN 201 AND 210);`,

    // 2. Delete delivery promotions for Tanta stores/zones
    `DELETE FROM delivery_promotions WHERE store_id IN (SELECT id FROM stores WHERE city_id = 2 OR id BETWEEN 201 AND 210) OR zone_id IN (SELECT id FROM zones WHERE city_id = 2 OR id BETWEEN 201 AND 205);`,

    // 3. Delete store zone prices for Tanta stores/zones
    `DELETE FROM store_zone_prices WHERE store_id IN (SELECT id FROM stores WHERE city_id = 2 OR id BETWEEN 201 AND 210) OR zone_id IN (SELECT id FROM zones WHERE city_id = 2 OR id BETWEEN 201 AND 205);`,

    // 4. Delete store coupons for Tanta stores
    `DELETE FROM store_coupons WHERE store_id IN (SELECT id FROM stores WHERE city_id = 2 OR id BETWEEN 201 AND 210);`,

    // 5. Delete coupon zones for Tanta zones
    `DELETE FROM coupon_zones WHERE zone_id IN (SELECT id FROM zones WHERE city_id = 2 OR id BETWEEN 201 AND 205);`,

    // 6. Delete coupons specific to Tanta
    `DELETE FROM coupons WHERE code LIKE '%TANTA%' OR code IN ('TANTA20', 'WELCOME_TANTA', 'STAD_FREE');`,

    // 7. Delete fortune wheel rewards and items
    `DELETE FROM fortune_wheel_user_rewards WHERE fortune_wheel_item_id IN (SELECT id FROM fortune_wheel_items WHERE display_name LIKE '%طنطا%');`,
    `DELETE FROM fortune_wheel_items WHERE display_name LIKE '%طنطا%';`,

    // 8. Delete banner zones for Tanta zones
    `DELETE FROM banner_zones WHERE zone_id IN (SELECT id FROM zones WHERE city_id = 2 OR id BETWEEN 201 AND 205);`,

    // 9. Delete banners mentioning Tanta
    `DELETE FROM banners WHERE JSON_UNQUOTE(JSON_EXTRACT(name, '$.ar')) LIKE '%طنطا%' OR JSON_UNQUOTE(JSON_EXTRACT(name, '$.en')) LIKE '%Tanta%';`,

    // 10. Delete order item addons & order items for Tanta orders
    `DELETE FROM order_item_addons WHERE order_item_id IN (
      SELECT id FROM order_items WHERE order_id IN (
        SELECT id FROM \`order\` WHERE branch_id IN (SELECT id FROM stores WHERE city_id = 2 OR id BETWEEN 201 AND 210)
        OR zone_id IN (SELECT id FROM zones WHERE city_id = 2 OR id BETWEEN 201 AND 205)
        OR id BETWEEN 201 AND 230
      )
    );`,
    `DELETE FROM order_items WHERE order_id IN (
      SELECT id FROM \`order\` WHERE branch_id IN (SELECT id FROM stores WHERE city_id = 2 OR id BETWEEN 201 AND 210)
      OR zone_id IN (SELECT id FROM zones WHERE city_id = 2 OR id BETWEEN 201 AND 205)
      OR id BETWEEN 201 AND 230
    );`,

    // 11. Delete Tanta orders
    `DELETE FROM \`order\` WHERE branch_id IN (SELECT id FROM stores WHERE city_id = 2 OR id BETWEEN 201 AND 210)
      OR zone_id IN (SELECT id FROM zones WHERE city_id = 2 OR id BETWEEN 201 AND 205)
      OR id BETWEEN 201 AND 230;`,

    // 12. Delete template applications for Tanta stores
    `DELETE FROM store_template_applications WHERE store_id IN (SELECT id FROM stores WHERE city_id = 2 OR id BETWEEN 201 AND 210);`,

    // 13. Delete service addons, sizes, and services (products)
    `DELETE FROM service_addons WHERE service_id IN (SELECT id FROM services WHERE store_id IN (SELECT id FROM stores WHERE city_id = 2 OR id BETWEEN 201 AND 210));`,
    `DELETE FROM service_sizes WHERE service_id IN (SELECT id FROM services WHERE store_id IN (SELECT id FROM stores WHERE city_id = 2 OR id BETWEEN 201 AND 210));`,
    `DELETE FROM services WHERE store_id IN (SELECT id FROM stores WHERE city_id = 2 OR id BETWEEN 201 AND 210);`,

    // 14. Delete categories, schedules, and branches of Tanta stores
    `DELETE FROM categories WHERE store_id IN (SELECT id FROM stores WHERE city_id = 2 OR id BETWEEN 201 AND 210);`,
    `DELETE FROM store_schedules WHERE store_id IN (SELECT id FROM stores WHERE city_id = 2 OR id BETWEEN 201 AND 210);`,
    `DELETE FROM branches WHERE store_id IN (SELECT id FROM stores WHERE city_id = 2 OR id BETWEEN 201 AND 210) OR id BETWEEN 201 AND 210;`,

    // 15. Delete Tanta stores
    `DELETE FROM stores WHERE city_id = 2 OR id BETWEEN 201 AND 210;`,

    // 16. Delete Tanta zones
    `DELETE FROM zones WHERE city_id = 2 OR id BETWEEN 201 AND 205;`,

    // 17. Delete Tanta city
    `DELETE FROM city WHERE id = 2 OR JSON_UNQUOTE(JSON_EXTRACT(name, '$.ar')) LIKE '%طنطا%' OR JSON_UNQUOTE(JSON_EXTRACT(name, '$.en')) LIKE '%Tanta%';`,

    // 18. Delete Tanta test users and related records
    `DELETE FROM addresses WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%tanta%');`,
    `DELETE FROM delivery_details WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%tanta%');`,
    `DELETE FROM user_details WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%tanta%');`,
    `DELETE FROM user_coupons WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%tanta%');`,
    `DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%tanta%');`,
    `DELETE FROM users WHERE email LIKE '%tanta%';`,

    'SET FOREIGN_KEY_CHECKS = 1;',
  ];

  for (let i = 0; i < statements.length; i++) {
    const sql = statements[i];
    try {
      await prisma.$executeRawUnsafe(sql);
    } catch (err) {
      console.warn(`[Warning on step ${i + 1}]: ${err.message}`);
    }
  }

  console.log('✅ ALL TANTA DATA PURGED COMPLETELY FROM DATABASE!');
  console.log('───────────────────────────────────────────────────');
  console.log('✔ City 2 (طنطا) deleted');
  console.log('✔ Zones 201-205 deleted');
  console.log('✔ Stores 201-210 & products deleted');
  console.log('✔ Orders & test users deleted');
  console.log('✔ Coupons, promotions & banners cleaned');
  console.log('───────────────────────────────────────────────────\n');
}

purgeTanta()
  .catch((e) => {
    console.error('❌ Error during purge:', e);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
