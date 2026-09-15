-- Migration: Add accumulated_fortune_discount and settled_fortune_discount to wallet,
-- and create store_discount_settlements table for deferred 50/50 settlements.

ALTER TABLE `wallet`
  ADD COLUMN IF NOT EXISTS `accumulated_fortune_discount` DOUBLE NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS `settled_fortune_discount` DOUBLE NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS `store_discount_settlements` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `store_id` INT NOT NULL,
  `branch_id` INT NULL,
  `total_discounts` DOUBLE NOT NULL,
  `platform_subsidy` DOUBLE NOT NULL,
  `settlement_type` VARCHAR(191) NOT NULL DEFAULT 'CASH_BANK_PAYOUT',
  `admin_note` TEXT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `store_discount_settlements_store_id_idx` (`store_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
