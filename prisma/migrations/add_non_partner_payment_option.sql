ALTER TABLE `orders` ADD COLUMN `non_partner_payment_option` ENUM('FULL_PRICE', 'DISCOUNTED_PRICE') NULL;
