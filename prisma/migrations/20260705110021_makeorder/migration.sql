-- CreateTable
CREATE TABLE `admin_notifications` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `title` JSON NOT NULL,
    `body` JSON NOT NULL,
    `image` VARCHAR(191) NULL,
    `target_type` VARCHAR(191) NOT NULL,
    `target_users_ids` JSON NULL,
    `store_id` INTEGER NULL,
    `click_target_type` ENUM('GENERAL', 'STORE', 'CATEGORY', 'SERVICE', 'ZONE', 'SPECIAL_DRIVER', 'ORDER', 'COUPON', 'EXTERNAL_URL') NULL,
    `click_store_id` INTEGER NULL,
    `click_category_id` INTEGER NULL,
    `click_service_id` INTEGER NULL,
    `click_zone_id` INTEGER NULL,
    `click_order_id` INTEGER NULL,
    `click_coupon_id` INTEGER NULL,
    `click_url` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `deleted_at` DATETIME(3) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `roles` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` JSON NULL,
    `key` VARCHAR(191) NOT NULL,
    `default` BOOLEAN NOT NULL DEFAULT false,
    `store_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `deleted_at` DATETIME(3) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `permissions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` JSON NULL,
    `method` VARCHAR(191) NOT NULL,
    `prefix` VARCHAR(191) NOT NULL,
    `default` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `permissions_prefix_method_key`(`prefix`, `method`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `role_permissions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `role_id` INTEGER NOT NULL,
    `permission_id` INTEGER NOT NULL,

    INDEX `role_permissions_permission_id_fkey`(`permission_id`),
    UNIQUE INDEX `role_permissions_role_id_permission_id_key`(`role_id`, `permission_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `banks` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` JSON NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `bank_accounts` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` JSON NOT NULL,
    `bank_id` INTEGER NOT NULL,
    `branch_id` INTEGER NOT NULL,
    `phone` VARCHAR(191) NULL,
    `ibn` VARCHAR(191) NOT NULL,
    `deleted_at` DATETIME(3) NULL,
    `storeId` INTEGER NULL,

    INDEX `bank_accounts_bank_id_fkey`(`bank_id`),
    INDEX `bank_accounts_branch_id_fkey`(`branch_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `banners` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` JSON NOT NULL,
    `image` VARCHAR(191) NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `random_seed` DOUBLE NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `deleted_at` DATETIME(3) NULL,
    `storeId` INTEGER NULL,
    `categoryId` INTEGER NULL,
    `serviceId` INTEGER NULL,
    `target_type` ENUM('GENERAL', 'STORE', 'CATEGORY', 'SERVICE', 'ZONE', 'SPECIAL_DRIVER') NOT NULL DEFAULT 'GENERAL',
    `click_count` INTEGER NOT NULL DEFAULT 0,
    `order` INTEGER NOT NULL DEFAULT 0,
    `start_date` DATETIME(3) NULL,
    `end_date` DATETIME(3) NULL,

    INDEX `banners_storeId_fkey`(`storeId`),
    INDEX `banners_categoryId_fkey`(`categoryId`),
    INDEX `banners_serviceId_fkey`(`serviceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `banner_zones` (
    `banner_id` INTEGER NOT NULL,
    `zone_id` INTEGER NOT NULL,

    INDEX `banner_zones_banner_id_idx`(`banner_id`),
    INDEX `banner_zones_zone_id_fkey`(`zone_id`),
    PRIMARY KEY (`banner_id`, `zone_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `bundles` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `store_id` INTEGER NOT NULL,
    `title` JSON NOT NULL,
    `description` JSON NOT NULL,
    `image` VARCHAR(191) NOT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `type` ENUM('BUY_X_GET_Y_FREE') NOT NULL DEFAULT 'BUY_X_GET_Y_FREE',
    `required_paid_quantity` INTEGER NOT NULL,
    `free_quantity` INTEGER NOT NULL,
    `paid_size_rule` ENUM('ANY', 'NAME') NOT NULL DEFAULT 'ANY',
    `paid_required_size_name` VARCHAR(191) NULL,
    `free_size_rule` ENUM('ANY', 'NAME') NOT NULL DEFAULT 'ANY',
    `free_required_size_name` VARCHAR(191) NULL,
    `free_value_rule` ENUM('NO_CAP', 'CAP_TO_CHEAPEST_PAID', 'MAX_FREE_VALUE') NOT NULL DEFAULT 'CAP_TO_CHEAPEST_PAID',
    `max_free_item_value` DOUBLE NULL,
    `start_date` DATETIME(3) NULL,
    `end_date` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `deleted_at` DATETIME(3) NULL,

    INDEX `bundles_store_id_idx`(`store_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `bundle_scope_services` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `bundle_id` INTEGER NOT NULL,
    `role` ENUM('PAID', 'FREE') NOT NULL,
    `service_id` INTEGER NOT NULL,

    INDEX `bundle_scope_services_bundle_id_idx`(`bundle_id`),
    INDEX `bundle_scope_services_service_id_idx`(`service_id`),
    UNIQUE INDEX `bundle_scope_services_bundle_id_role_service_id_key`(`bundle_id`, `role`, `service_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `bundle_scope_categories` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `bundle_id` INTEGER NOT NULL,
    `role` ENUM('PAID', 'FREE') NOT NULL,
    `category_id` INTEGER NOT NULL,

    INDEX `bundle_scope_categories_bundle_id_idx`(`bundle_id`),
    INDEX `bundle_scope_categories_category_id_idx`(`category_id`),
    UNIQUE INDEX `bundle_scope_categories_bundle_id_role_category_id_key`(`bundle_id`, `role`, `category_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `campaigns` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `type` ENUM('NOTIFICATION', 'OFFER') NOT NULL,
    `title` JSON NOT NULL,
    `description` JSON NULL,
    `feature_text` JSON NULL,
    `value_text` JSON NULL,
    `image` VARCHAR(191) NULL,
    `target_type` ENUM('ALL', 'CUSTOMER', 'STORE', 'SERVICE', 'SELECTED_USERS') NOT NULL DEFAULT 'CUSTOMER',
    `target_user_ids` JSON NULL,
    `store_id` INTEGER NULL,
    `service_id` INTEGER NULL,
    `start_at` DATETIME(3) NULL,
    `end_at` DATETIME(3) NULL,
    `display_interval_hours` INTEGER NULL,
    `manual_status` ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
    `sent_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `campaigns_type_idx`(`type`),
    INDEX `campaigns_store_id_fkey`(`store_id`),
    INDEX `campaigns_service_id_fkey`(`service_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `campaign_views` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `campaign_id` INTEGER NOT NULL,
    `user_id` INTEGER NOT NULL,
    `last_shown_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `view_count` INTEGER NOT NULL DEFAULT 1,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `campaign_views_user_id_fkey`(`user_id`),
    UNIQUE INDEX `campaign_views_campaign_id_user_id_key`(`campaign_id`, `user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `categories` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` JSON NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `deleted_at` DATETIME(3) NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `image` VARCHAR(191) NULL,
    `order` INTEGER NOT NULL DEFAULT 0,
    `store_id` INTEGER NULL,
    `template_category_id` INTEGER NULL,

    INDEX `categories_template_category_id_fkey`(`template_category_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `city` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` JSON NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `complaints` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `customer_id` INTEGER NOT NULL,
    `order_id` INTEGER NOT NULL,
    `reason` TEXT NOT NULL,
    `status` ENUM('PENDING', 'IN_PROGRESS', 'RESOLVED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `complaint_customer_id_fkey`(`customer_id`),
    INDEX `complaint_order_id_fkey`(`order_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `complaint_replies` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `complaint_id` INTEGER NOT NULL,
    `user_id` INTEGER NOT NULL,
    `message` TEXT NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `complaint_reply_complaint_id_fkey`(`complaint_id`),
    INDEX `complaint_reply_user_id_fkey`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `coupons` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `title` JSON NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `type` ENUM('ALL_USERS', 'ALL_STORES', 'FIRST_ORDER', 'USER_WISE', 'STORE_WISE') NOT NULL,
    `discount_type` ENUM('AMOUNT', 'PERCENTAGE') NOT NULL,
    `discount_value` INTEGER NOT NULL,
    `max_usage` INTEGER NOT NULL,
    `usage_count` INTEGER NOT NULL,
    `min_order_amount` INTEGER NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `start_date` DATETIME(3) NOT NULL,
    `end_date` DATETIME(3) NOT NULL,
    `min_discount_value` INTEGER NOT NULL,
    `max_discount_value` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `deleted_at` DATETIME(3) NULL,
    `expired` BOOLEAN NOT NULL DEFAULT false,

    UNIQUE INDEX `coupons_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_coupons` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `coupon_id` INTEGER NOT NULL,
    `user_id` INTEGER NOT NULL,

    INDEX `user_coupons_user_id_fkey`(`user_id`),
    UNIQUE INDEX `user_coupons_coupon_id_user_id_key`(`coupon_id`, `user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `store_coupons` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `coupon_id` INTEGER NOT NULL,
    `store_id` INTEGER NOT NULL,

    INDEX `store_coupons_store_id_fkey`(`store_id`),
    UNIQUE INDEX `store_coupons_coupon_id_store_id_key`(`coupon_id`, `store_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `coupon_zones` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `coupon_id` INTEGER NOT NULL,
    `zone_id` INTEGER NOT NULL,

    INDEX `coupon_zones_zone_id_fkey`(`zone_id`),
    UNIQUE INDEX `coupon_zones_coupon_id_zone_id_key`(`coupon_id`, `zone_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `fortune_wheel_settings` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `display_interval_hours` INTEGER NOT NULL,
    `is_enabled` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `fortune_wheel_items` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `display_name` VARCHAR(191) NOT NULL,
    `reward_type` ENUM('DISCOUNT', 'FREE_DELIVERY', 'FIXED_AMOUNT', 'CUSTOM', 'NONE') NOT NULL,
    `reward_value` INTEGER NULL,
    `weight` INTEGER NOT NULL DEFAULT 1,
    `max_discount` INTEGER NULL,
    `min_order_amount` INTEGER NULL,
    `max_order_amount` INTEGER NULL,
    `reward_expiry_hours` INTEGER NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `fortune_wheel_user_states` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `last_shown_at` DATETIME(3) NULL,
    `last_spun_at` DATETIME(3) NULL,
    `next_eligible_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `fortune_wheel_user_states_user_id_key`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `fortune_wheel_user_rewards` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `item_id` INTEGER NULL,
    `reward_type` ENUM('DISCOUNT', 'FREE_DELIVERY', 'FIXED_AMOUNT', 'CUSTOM', 'NONE') NOT NULL,
    `reward_value` INTEGER NULL,
    `max_discount` INTEGER NULL,
    `min_order_amount` INTEGER NULL,
    `max_order_amount` INTEGER NULL,
    `status` ENUM('VALID', 'USED', 'EXPIRED') NOT NULL DEFAULT 'VALID',
    `expires_at` DATETIME(3) NULL,
    `redeemed_at` DATETIME(3) NULL,
    `redeemed_order_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `fortune_wheel_user_rewards_user_id_idx`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `fund` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `customer_id` INTEGER NOT NULL,
    `price` DOUBLE NOT NULL DEFAULT 0,
    `deleted_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `fund_customer_id_fkey`(`customer_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `key_value` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `key` VARCHAR(191) NOT NULL,
    `value` JSON NOT NULL,
    `file` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `languages` (
    `name` VARCHAR(191) NOT NULL,
    `key` VARCHAR(191) NOT NULL,
    `file` VARCHAR(191) NOT NULL,
    `front_file` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `languages_key_key`(`key`),
    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `logs` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `userName` VARCHAR(191) NOT NULL,
    `userRole` VARCHAR(191) NOT NULL,
    `action` VARCHAR(191) NOT NULL,
    `details` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `logs_userId_idx`(`userId`),
    INDEX `logs_action_idx`(`action`),
    INDEX `logs_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `notifications` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `image` VARCHAR(191) NULL,
    `title` JSON NOT NULL,
    `body` JSON NOT NULL,
    `read` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `deleted_at` DATETIME(3) NULL,
    `resourceId` INTEGER NULL,
    `user_id` INTEGER NULL,
    `group_key` VARCHAR(191) NULL,
    `type` ENUM('NEW_ORDER', 'NEW_SUB_CATEGORY_REQUEST', 'ORDER', 'SHIFT_REMINDER', 'ADMIN', 'STORE', 'COUPON') NULL,
    `click_target_type` ENUM('GENERAL', 'STORE', 'CATEGORY', 'SERVICE', 'ZONE', 'SPECIAL_DRIVER', 'ORDER', 'COUPON', 'EXTERNAL_URL') NULL,
    `click_store_id` INTEGER NULL,
    `click_category_id` INTEGER NULL,
    `click_service_id` INTEGER NULL,
    `click_zone_id` INTEGER NULL,
    `click_order_id` INTEGER NULL,
    `click_coupon_id` INTEGER NULL,
    `click_url` TEXT NULL,

    INDEX `notifications_group_key_fkey`(`group_key`),
    INDEX `notifications_user_id_fkey`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `system_notifications` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `title` JSON NOT NULL,
    `body` JSON NOT NULL,
    `email` ENUM('DISABLED', 'ACTIVE', 'IN_ACTIVE') NOT NULL DEFAULT 'ACTIVE',
    `sms` ENUM('DISABLED', 'ACTIVE', 'IN_ACTIVE') NOT NULL DEFAULT 'ACTIVE',
    `notification` ENUM('DISABLED', 'ACTIVE', 'IN_ACTIVE') NOT NULL DEFAULT 'ACTIVE',
    `event` VARCHAR(191) NOT NULL,
    `receiver_key` VARCHAR(191) NOT NULL,
    `sender_key` VARCHAR(191) NOT NULL,
    `group` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `deleted_at` DATETIME(3) NULL,

    INDEX `system_notifications_receiver_key_fkey`(`receiver_key`),
    INDEX `system_notifications_sender_key_fkey`(`sender_key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `order` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `price` DOUBLE NOT NULL,
    `note` TEXT NULL,
    `admin_note` TEXT NULL,
    `couponId` INTEGER NULL,
    `rated` BOOLEAN NOT NULL DEFAULT false,
    `date` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `address_id` INTEGER NULL,
    `customer_id` INTEGER NOT NULL,
    `specialist_id` INTEGER NULL,
    `total_price_after_discount` DOUBLE NOT NULL DEFAULT 0,
    `discount_amount` DOUBLE NOT NULL DEFAULT 0,
    `paid_with_wallet` BOOLEAN NOT NULL DEFAULT false,
    `is_gift` BOOLEAN NOT NULL DEFAULT false,
    `admin_commission` DOUBLE NOT NULL DEFAULT 0,
    `global_commission` DOUBLE NOT NULL DEFAULT 0,
    `store_commission` DOUBLE NOT NULL DEFAULT 0,
    `shipping` DOUBLE NOT NULL DEFAULT 0,
    `tax` DOUBLE NOT NULL DEFAULT 0,
    `payment_status` ENUM('PAID', 'UNPAID', 'FAILED') NOT NULL DEFAULT 'UNPAID',
    `payment_method` ENUM('CASH', 'WALLET') NOT NULL DEFAULT 'CASH',
    `transfer_number` VARCHAR(191) NULL,
    `transfer_image` VARCHAR(191) NULL,
    `status` ENUM('PENDING', 'PREPARING', 'READY_PICKUP', 'ON_THE_WAY', 'DELIVERED', 'CANCELLED', 'REJECTED', 'PAYMENT_FAILD', 'PENDING_PAYMENT') NOT NULL DEFAULT 'PENDING',
    `type` ENUM('DELIVERY', 'PICKUP', 'CUSTOM_DELIVERY') NOT NULL DEFAULT 'DELIVERY',
    `invoice` JSON NOT NULL,
    `tip` DOUBLE NOT NULL DEFAULT 0,
    `branch_id` INTEGER NULL,
    `category` ENUM('IMMEDIATE', 'SCHEDULED') NOT NULL DEFAULT 'IMMEDIATE',
    `scheduled_at` DATETIME(3) NULL,
    `pickup_lat` DOUBLE NULL,
    `pickup_lng` DOUBLE NULL,
    `delivery_lat` DOUBLE NULL,
    `delivery_lng` DOUBLE NULL,
    `items_description` TEXT NULL,
    `estimated_items_cost` DOUBLE NULL,
    `driver_instructions` TEXT NULL,
    `delivery_id` INTEGER NULL,
    `zone_id` INTEGER NULL,

    INDEX `order_address_id_fkey`(`address_id`),
    INDEX `order_branch_id_fkey`(`branch_id`),
    INDEX `order_couponId_fkey`(`couponId`),
    INDEX `order_customer_id_fkey`(`customer_id`),
    INDEX `order_specialist_id_fkey`(`specialist_id`),
    INDEX `order_zone_id_fkey`(`zone_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `order_items` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `order_id` INTEGER NOT NULL,
    `service_id` INTEGER NOT NULL,
    `size_id` INTEGER NULL,
    `quantity` INTEGER NOT NULL DEFAULT 1,
    `price` DOUBLE NOT NULL,
    `order_bundle_id` INTEGER NULL,
    `is_free` BOOLEAN NOT NULL DEFAULT false,

    INDEX `order_item_order_id_fkey`(`order_id`),
    INDEX `order_item_service_id_fkey`(`service_id`),
    INDEX `order_item_size_id_fkey`(`size_id`),
    INDEX `order_items_order_bundle_id_idx`(`order_bundle_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `order_bundles` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `order_id` INTEGER NOT NULL,
    `bundle_id` INTEGER NULL,
    `title` JSON NOT NULL,
    `type` ENUM('BUY_X_GET_Y_FREE') NOT NULL,
    `required_paid_quantity` INTEGER NOT NULL,
    `free_quantity` INTEGER NOT NULL,
    `free_discount_amount` DOUBLE NOT NULL DEFAULT 0,
    `snapshot` JSON NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `order_bundles_order_id_idx`(`order_id`),
    INDEX `order_bundles_bundle_id_idx`(`bundle_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `order_item_addons` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `order_item_id` INTEGER NOT NULL,
    `addon_id` INTEGER NOT NULL,

    INDEX `order_item_addons_addon_id_fkey`(`addon_id`),
    INDEX `order_item_addons_order_item_id_fkey`(`order_item_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `order_delivery_assignments` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `order_id` INTEGER NOT NULL,
    `delivery_id` INTEGER NOT NULL,
    `status` ENUM('PENDING', 'ACCEPTED', 'REJECTED', 'TIMEOUT') NOT NULL DEFAULT 'PENDING',
    `assigned_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `expires_at` DATETIME(3) NOT NULL,
    `responded_at` DATETIME(3) NULL,

    INDEX `order_delivery_assignments_order_id_idx`(`order_id`),
    INDEX `order_delivery_assignments_delivery_id_idx`(`delivery_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `order_stations` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `order_id` INTEGER NOT NULL,
    `sequence` INTEGER NOT NULL,
    `type` ENUM('PICKUP', 'DROPOFF') NOT NULL DEFAULT 'PICKUP',
    `name` VARCHAR(191) NULL,
    `lat` DOUBLE NOT NULL,
    `lng` DOUBLE NOT NULL,
    `purchase_list` TEXT NULL,
    `estimated_cost` DOUBLE NOT NULL DEFAULT 0,
    `notes` TEXT NULL,
    `status` ENUM('WAITING', 'GOING', 'REACHED') NOT NULL DEFAULT 'WAITING',
    `reached_at` DATETIME(3) NULL,

    INDEX `order_stations_order_id_idx`(`order_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `order_station_images` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `station_id` INTEGER NULL,
    `image` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `order_station_images_user_id_idx`(`user_id`),
    INDEX `order_station_images_station_id_idx`(`station_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `archived_order` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `price` DOUBLE NOT NULL,
    `note` TEXT NULL,
    `couponId` INTEGER NULL,
    `date` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `address_id` INTEGER NULL,
    `customer_id` INTEGER NOT NULL,
    `branch_id` INTEGER NULL,
    `total_price_after_discount` DOUBLE NOT NULL DEFAULT 0,
    `discount_amount` DOUBLE NOT NULL DEFAULT 0,
    `paid_with_wallet` BOOLEAN NOT NULL DEFAULT false,
    `is_gift` BOOLEAN NOT NULL DEFAULT false,
    `admin_commission` DOUBLE NOT NULL DEFAULT 0,
    `global_commission` DOUBLE NOT NULL DEFAULT 0,
    `store_commission` DOUBLE NOT NULL DEFAULT 0,
    `shipping` DOUBLE NOT NULL DEFAULT 0,
    `tax` DOUBLE NOT NULL DEFAULT 0,
    `payment_method` ENUM('CASH', 'WALLET') NOT NULL DEFAULT 'CASH',
    `transfer_number` VARCHAR(191) NULL,
    `transfer_image` VARCHAR(191) NULL,
    `type` ENUM('DELIVERY', 'PICKUP', 'CUSTOM_DELIVERY') NOT NULL DEFAULT 'DELIVERY',
    `tip` DOUBLE NOT NULL DEFAULT 0,
    `category` ENUM('IMMEDIATE', 'SCHEDULED') NOT NULL DEFAULT 'SCHEDULED',
    `scheduled_at` DATETIME(3) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `archived_order_items` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `archived_order_id` INTEGER NOT NULL,
    `service_id` INTEGER NOT NULL,
    `size_id` INTEGER NULL,
    `quantity` INTEGER NOT NULL DEFAULT 1,
    `price` DOUBLE NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `archived_order_item_addons` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `archived_order_item_id` INTEGER NOT NULL,
    `addon_id` INTEGER NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `otps` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(6) NOT NULL,
    `token` VARCHAR(6) NULL,
    `type` ENUM('PASSWORD_RESET', 'EMAIL_VERIFICATION') NOT NULL DEFAULT 'PASSWORD_RESET',
    `user_id` INTEGER NOT NULL,
    `generated_times` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NULL,

    UNIQUE INDEX `otps_user_id_type_key`(`user_id`, `type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `plan` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` JSON NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `delivery_rating` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `customer_id` INTEGER NOT NULL,
    `delivery_id` INTEGER NOT NULL,
    `order_id` INTEGER NOT NULL,
    `rating` DOUBLE NOT NULL,
    `comment` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `delivery_rating_customer_id_idx`(`customer_id`),
    INDEX `delivery_rating_order_id_idx`(`order_id`),
    INDEX `delivery_rating_delivery_id_idx`(`delivery_id`),
    UNIQUE INDEX `delivery_rating_order_id_customer_id_key`(`order_id`, `customer_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `store_rating` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `customer_id` INTEGER NOT NULL,
    `order_id` INTEGER NOT NULL,
    `rating` DOUBLE NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NULL,
    `deleted_at` DATETIME(3) NULL,
    `branch_id` INTEGER NOT NULL,
    `storeId` INTEGER NULL,
    `comment` TEXT NULL,

    INDEX `store_rating_branch_id_fkey`(`branch_id`),
    INDEX `store_rating_customer_id_fkey`(`customer_id`),
    INDEX `store_rating_storeId_fkey`(`storeId`),
    UNIQUE INDEX `store_rating_order_id_customer_id_key`(`order_id`, `customer_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `services` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` JSON NOT NULL,
    `description` JSON NOT NULL,
    `image` VARCHAR(191) NOT NULL,
    `duration_minutes` INTEGER NOT NULL,
    `price` DOUBLE NOT NULL,
    `commission` DOUBLE NULL,
    `price_after_discount` DOUBLE NULL,
    `status` ENUM('PENDING', 'ACTIVE', 'INACTIVE', 'REJECTED') NOT NULL DEFAULT 'PENDING',
    `available` BOOLEAN NOT NULL DEFAULT true,
    `total_orders` INTEGER NOT NULL DEFAULT 0,
    `total_amount_sold` INTEGER NOT NULL DEFAULT 0,
    `rating` DOUBLE NOT NULL DEFAULT 0,
    `review` INTEGER NOT NULL DEFAULT 0,
    `best_rated` BOOLEAN NULL DEFAULT false,
    `most_seller` BOOLEAN NULL DEFAULT false,
    `deleted_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `store_id` INTEGER NOT NULL,
    `category_id` INTEGER NOT NULL,

    INDEX `services_store_id_fkey`(`store_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `favorite_service` (
    `service_id` INTEGER NOT NULL,
    `customer_id` INTEGER NOT NULL,

    INDEX `favorite_service_service_id_customer_id_idx`(`service_id`, `customer_id`),
    INDEX `favorite_service_customer_id_fkey`(`customer_id`),
    PRIMARY KEY (`service_id`, `customer_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `service_sizes` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` JSON NOT NULL,
    `price` DOUBLE NOT NULL,
    `price_after_discount` DOUBLE NULL,
    `is_default` BOOLEAN NOT NULL DEFAULT false,
    `service_id` INTEGER NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `service_sizes_service_id_fkey`(`service_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `service_addons` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` JSON NOT NULL,
    `price` DOUBLE NOT NULL,
    `price_after_discount` DOUBLE NULL,
    `service_id` INTEGER NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `service_addons_service_id_fkey`(`service_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sessions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `jti` VARCHAR(191) NOT NULL,
    `ip_address` TEXT NULL,
    `user_id` INTEGER NULL,
    `fcm_token` VARCHAR(255) NULL,
    `socket_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `invalidated_at` DATETIME(3) NULL,
    `type` ENUM('ACCESS', 'REFRESH', 'VERIFY', 'VISITOR', 'PASSWORD_RESET') NOT NULL DEFAULT 'ACCESS',
    `language_id` VARCHAR(191) NULL,

    UNIQUE INDEX `sessions_jti_key`(`jti`),
    INDEX `userId`(`user_id`),
    INDEX `sessions_language_id_fkey`(`language_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `settings` (
    `setting` VARCHAR(191) NOT NULL,
    `name` JSON NULL,
    `value` LONGTEXT NOT NULL,
    `domain` ENUM('BUSINESS', 'DELIVERY', 'ORDER', 'REFUND', 'STORE', 'CUSTOMER', 'PRIORITY', 'DISBURSEMENT') NOT NULL,
    `deleted_at` DATETIME(3) NULL,
    `enum_values` JSON NULL,
    `data_type` ENUM('STRING', 'NUMBER', 'BOOLEAN', 'DATE', 'DATETIME', 'TIME', 'LATITUDE', 'LONGITUDE', 'JSON', 'FILE', 'ENUM', 'TEXTAREA') NOT NULL,

    PRIMARY KEY (`setting`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `social_medias` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `platform` VARCHAR(191) NOT NULL,
    `link` VARCHAR(191) NOT NULL,
    `image` VARCHAR(191) NOT NULL,
    `is_active` BOOLEAN NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `social_medias_platform_key`(`platform`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Specialist` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `storeId` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `deleted_at` DATETIME(3) NULL,

    INDEX `Specialist_storeId_fkey`(`storeId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `store_templates` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` JSON NOT NULL,
    `description` JSON NULL,
    `image` VARCHAR(191) NULL,
    `module_type` VARCHAR(191) NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `order` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `deleted_at` DATETIME(3) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `template_categories` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` JSON NOT NULL,
    `image` VARCHAR(191) NULL,
    `order` INTEGER NOT NULL DEFAULT 0,
    `template_id` INTEGER NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `template_categories_template_id_idx`(`template_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `template_services` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` JSON NOT NULL,
    `description` JSON NOT NULL,
    `image` VARCHAR(191) NOT NULL,
    `duration_minutes` INTEGER NOT NULL,
    `price` DOUBLE NOT NULL,
    `commission` DOUBLE NULL,
    `price_after_discount` DOUBLE NULL,
    `available` BOOLEAN NOT NULL DEFAULT true,
    `best_rated` BOOLEAN NULL DEFAULT false,
    `most_seller` BOOLEAN NULL DEFAULT false,
    `template_category_id` INTEGER NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `template_services_template_category_id_idx`(`template_category_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `template_service_sizes` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` JSON NOT NULL,
    `price` DOUBLE NOT NULL,
    `price_after_discount` DOUBLE NULL,
    `is_default` BOOLEAN NOT NULL DEFAULT false,
    `template_service_id` INTEGER NOT NULL,

    INDEX `template_service_sizes_template_service_id_idx`(`template_service_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `template_service_addons` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` JSON NOT NULL,
    `price` DOUBLE NOT NULL,
    `template_service_id` INTEGER NOT NULL,

    INDEX `template_service_addons_template_service_id_idx`(`template_service_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `store_template_applications` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `store_id` INTEGER NOT NULL,
    `template_id` INTEGER NOT NULL,
    `applied_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `store_template_applications_template_id_idx`(`template_id`),
    UNIQUE INDEX `store_template_applications_store_id_template_id_key`(`store_id`, `template_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `stores` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` JSON NOT NULL,
    `logo` VARCHAR(191) NOT NULL,
    `store_order` INTEGER NULL DEFAULT 0,
    `cover` VARCHAR(191) NOT NULL,
    `commission` DOUBLE NOT NULL DEFAULT 0,
    `commission_type` ENUM('PERCENTAGE', 'FIXED') NOT NULL DEFAULT 'FIXED',
    `tax` DOUBLE NOT NULL DEFAULT 0,
    `isStoreAccepted` BOOLEAN NOT NULL DEFAULT false,
    `isBlocked` BOOLEAN NOT NULL DEFAULT false,
    `min_service_price` DOUBLE NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `rating` DOUBLE NOT NULL DEFAULT 0,
    `review` INTEGER NOT NULL DEFAULT 0,
    `best_rated` BOOLEAN NOT NULL DEFAULT false,
    `deleted_at` DATETIME(3) NULL,
    `planId` INTEGER NULL,
    `cityId` INTEGER NULL,
    `free_delivery` BOOLEAN NOT NULL DEFAULT false,
    `is_verified` BOOLEAN NOT NULL DEFAULT false,
    `walletId` INTEGER NULL,

    INDEX `stores_cityId_fkey`(`cityId`),
    INDEX `stores_planId_fkey`(`planId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `branches` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `store_id` INTEGER NOT NULL,
    `name` JSON NOT NULL,
    `phone` VARCHAR(191) NULL,
    `address` VARCHAR(191) NOT NULL,
    `lat` DOUBLE NOT NULL,
    `lng` DOUBLE NOT NULL,
    `deleted_at` DATETIME(3) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `is_main_branch` BOOLEAN NOT NULL DEFAULT false,
    `closed` BOOLEAN NOT NULL DEFAULT false,
    `status` ENUM('OPEN', 'BUSY', 'CLOSED', 'NORMAL') NOT NULL DEFAULT 'NORMAL',
    `busy_until` DATETIME(3) NULL,
    `rating` DOUBLE NOT NULL DEFAULT 0,
    `review` INTEGER NOT NULL DEFAULT 0,
    `best_rated` BOOLEAN NOT NULL DEFAULT false,
    `temporarily_closed` BOOLEAN NOT NULL DEFAULT false,

    INDEX `branches_store_id_fkey`(`store_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `branch_zones` (
    `branch_id` INTEGER NOT NULL,
    `zone_id` INTEGER NOT NULL,

    INDEX `branch_zones_branch_id_idx`(`branch_id`),
    INDEX `branch_zones_zone_id_fkey`(`zone_id`),
    PRIMARY KEY (`branch_id`, `zone_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `store_schedule` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `opening_time` TIME(0) NOT NULL,
    `closing_time` TIME(0) NOT NULL,
    `day` ENUM('SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY') NOT NULL,
    `branch_id` INTEGER NOT NULL,

    INDEX `store_schedule_branch_id_idx`(`branch_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `favorite_store` (
    `customer_id` INTEGER NOT NULL,
    `branch_id` INTEGER NOT NULL,
    `storeId` INTEGER NULL,

    INDEX `favorite_store_branch_id_customer_id_idx`(`branch_id`, `customer_id`),
    INDEX `favorite_store_customer_id_fkey`(`customer_id`),
    INDEX `favorite_store_storeId_fkey`(`storeId`),
    PRIMARY KEY (`branch_id`, `customer_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `wallet` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `branch_id` INTEGER NOT NULL,
    `total_earning` DOUBLE NOT NULL DEFAULT 0,
    `total` DOUBLE NOT NULL DEFAULT 0,
    `total_withdrawn` DOUBLE NOT NULL DEFAULT 0,
    `pending_withdraw` DOUBLE NOT NULL DEFAULT 0,
    `collect_cash` DOUBLE NOT NULL DEFAULT 0,
    `current_balance` DOUBLE NOT NULL DEFAULT 0,

    UNIQUE INDEX `wallet_branch_id_key`(`branch_id`),
    INDEX `wallet_branch_id_idx`(`branch_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `admin_wallet` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `total` DOUBLE NOT NULL DEFAULT 0,
    `total_earning` DOUBLE NOT NULL DEFAULT 0,
    `total_withdrawn` DOUBLE NOT NULL DEFAULT 0,
    `pending_withdraw` DOUBLE NOT NULL DEFAULT 0,
    `collect_cash` DOUBLE NOT NULL DEFAULT 0,
    `current_balance` DOUBLE NOT NULL DEFAULT 0,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `transactions` (
    `id` VARCHAR(191) NOT NULL,
    `credit` DOUBLE NOT NULL DEFAULT 0,
    `debit` DOUBLE NOT NULL DEFAULT 0,
    `balance` DOUBLE NOT NULL DEFAULT 0,
    `type` ENUM('ORDER_REFUND', 'WITHDRAWAL', 'ORDER_CREATED', 'FUND', 'ORDER_COMPLETED') NOT NULL,
    `userType` ENUM('CUSTOMER', 'STORE', 'ADMIN', 'DELIVERY') NOT NULL,
    `referenceId` INTEGER NOT NULL,
    `deleted_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `customer_Id` INTEGER NULL,
    `branch_Id` INTEGER NULL,
    `delivery_Id` INTEGER NULL,
    `storeId` INTEGER NULL,

    INDEX `transactions_customer_Id_fkey`(`customer_Id`),
    INDEX `transactions_branch_Id_fkey`(`branch_Id`),
    INDEX `transactions_delivery_Id_fkey`(`delivery_Id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `users` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `phone` VARCHAR(191) NULL,
    `password` VARCHAR(191) NOT NULL,
    `verified` BOOLEAN NOT NULL DEFAULT false,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `device_id` VARCHAR(191) NULL,
    `image` VARCHAR(191) NOT NULL DEFAULT 'uploads/default.png',
    `allow_notification` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `deleted_at` DATETIME(3) NULL,
    `role_id` INTEGER NOT NULL,
    `role_key` VARCHAR(191) NOT NULL,
    `branchId` INTEGER NULL,
    `storeId` INTEGER NULL,

    INDEX `users_phone_role_key_idx`(`phone`, `role_key`),
    INDEX `users_email_role_key_idx`(`email`, `role_key`),
    INDEX `users_phone_role_id_idx`(`phone`, `role_id`),
    INDEX `users_email_role_id_idx`(`email`, `role_id`),
    INDEX `users_branchId_fkey`(`branchId`),
    INDEX `users_role_id_fkey`(`role_id`),
    UNIQUE INDEX `users_device_id_role_key_key`(`device_id`, `role_key`),
    UNIQUE INDEX `users_email_role_key_key`(`email`, `role_key`),
    UNIQUE INDEX `users_phone_role_key_key`(`phone`, `role_key`),
    UNIQUE INDEX `users_device_id_role_id_key`(`device_id`, `role_id`),
    UNIQUE INDEX `users_email_role_id_key`(`email`, `role_id`),
    UNIQUE INDEX `users_phone_role_id_key`(`phone`, `role_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `details` (
    `user_id` INTEGER NOT NULL,
    `wallet` DOUBLE NULL DEFAULT 0,
    `points` DOUBLE NULL DEFAULT 0,
    `collected_cash` DOUBLE NOT NULL DEFAULT 0,

    UNIQUE INDEX `details_user_id_key`(`user_id`),
    PRIMARY KEY (`user_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DeliveryDetails` (
    `user_id` INTEGER NOT NULL,
    `rating` DOUBLE NOT NULL DEFAULT 0,
    `review` INTEGER NOT NULL DEFAULT 0,
    `best_rated` BOOLEAN NOT NULL DEFAULT false,
    `lat` DOUBLE NOT NULL,
    `lng` DOUBLE NOT NULL,
    `bearing` DOUBLE NULL,
    `last_location_update` DATETIME(3) NULL,
    `available_now` BOOLEAN NOT NULL DEFAULT false,
    `force_available` BOOLEAN NOT NULL DEFAULT false,

    UNIQUE INDEX `DeliveryDetails_user_id_key`(`user_id`),
    PRIMARY KEY (`user_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `delivery_schedule` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `opening_time` TIME(0) NOT NULL,
    `closing_time` TIME(0) NOT NULL,
    `day` ENUM('SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY') NOT NULL,
    `delivery_id` INTEGER NOT NULL,
    `required_lat` DOUBLE NULL,
    `required_lng` DOUBLE NULL,
    `required_radius` DOUBLE NULL DEFAULT 100,

    INDEX `delivery_schedule_delivery_id_idx`(`delivery_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `delivery_attendance` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `delivery_id` INTEGER NOT NULL,
    `schedule_id` INTEGER NOT NULL,
    `check_in_time` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `lat` DOUBLE NOT NULL,
    `lng` DOUBLE NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `addresses` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `deleted_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `title` VARCHAR(191) NOT NULL,
    `default` BOOLEAN NOT NULL DEFAULT false,
    `lat` DOUBLE NOT NULL,
    `lng` DOUBLE NOT NULL,
    `adress` TEXT NULL,

    INDEX `addresses_lat_lng_idx`(`lat`, `lng`),
    INDEX `addresses_user_id_fkey`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `variation_templates` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` JSON NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `variation_template_values` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` JSON NOT NULL,
    `variation_template_id` INTEGER NOT NULL,

    INDEX `variation_template_values_template_id_fkey`(`variation_template_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Withdraw` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `amount` DOUBLE NOT NULL,
    `store_account_id` INTEGER NULL,
    `deleted_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `status` ENUM('PENDING', 'APPROVED', 'DENIED') NOT NULL DEFAULT 'PENDING',

    INDEX `Withdraw_store_account_id_fkey`(`store_account_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `zones` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` JSON NOT NULL,
    `coordinates` JSON NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `deleted_at` DATETIME(3) NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `city_id` INTEGER NULL,

    INDEX `zones_city_id_fkey`(`city_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `role_permissions` ADD CONSTRAINT `role_permissions_permission_id_fkey` FOREIGN KEY (`permission_id`) REFERENCES `permissions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `role_permissions` ADD CONSTRAINT `role_permissions_role_id_fkey` FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bank_accounts` ADD CONSTRAINT `bank_accounts_bank_id_fkey` FOREIGN KEY (`bank_id`) REFERENCES `banks`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bank_accounts` ADD CONSTRAINT `bank_accounts_branch_id_fkey` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bank_accounts` ADD CONSTRAINT `bank_accounts_storeId_fkey` FOREIGN KEY (`storeId`) REFERENCES `stores`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `banners` ADD CONSTRAINT `banners_storeId_fkey` FOREIGN KEY (`storeId`) REFERENCES `stores`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `banners` ADD CONSTRAINT `banners_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `categories`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `banners` ADD CONSTRAINT `banners_serviceId_fkey` FOREIGN KEY (`serviceId`) REFERENCES `services`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `banner_zones` ADD CONSTRAINT `banner_zones_banner_id_fkey` FOREIGN KEY (`banner_id`) REFERENCES `banners`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `banner_zones` ADD CONSTRAINT `banner_zones_zone_id_fkey` FOREIGN KEY (`zone_id`) REFERENCES `zones`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bundles` ADD CONSTRAINT `bundles_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bundle_scope_services` ADD CONSTRAINT `bundle_scope_services_bundle_id_fkey` FOREIGN KEY (`bundle_id`) REFERENCES `bundles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bundle_scope_services` ADD CONSTRAINT `bundle_scope_services_service_id_fkey` FOREIGN KEY (`service_id`) REFERENCES `services`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bundle_scope_categories` ADD CONSTRAINT `bundle_scope_categories_bundle_id_fkey` FOREIGN KEY (`bundle_id`) REFERENCES `bundles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bundle_scope_categories` ADD CONSTRAINT `bundle_scope_categories_category_id_fkey` FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `campaigns` ADD CONSTRAINT `campaigns_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `campaigns` ADD CONSTRAINT `campaigns_service_id_fkey` FOREIGN KEY (`service_id`) REFERENCES `services`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `campaign_views` ADD CONSTRAINT `campaign_views_campaign_id_fkey` FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `campaign_views` ADD CONSTRAINT `campaign_views_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `categories` ADD CONSTRAINT `categories_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `categories` ADD CONSTRAINT `categories_template_category_id_fkey` FOREIGN KEY (`template_category_id`) REFERENCES `template_categories`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `complaints` ADD CONSTRAINT `complaints_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `complaints` ADD CONSTRAINT `complaints_order_id_fkey` FOREIGN KEY (`order_id`) REFERENCES `order`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `complaint_replies` ADD CONSTRAINT `complaint_replies_complaint_id_fkey` FOREIGN KEY (`complaint_id`) REFERENCES `complaints`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `complaint_replies` ADD CONSTRAINT `complaint_replies_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_coupons` ADD CONSTRAINT `user_coupons_coupon_id_fkey` FOREIGN KEY (`coupon_id`) REFERENCES `coupons`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_coupons` ADD CONSTRAINT `user_coupons_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `store_coupons` ADD CONSTRAINT `store_coupons_coupon_id_fkey` FOREIGN KEY (`coupon_id`) REFERENCES `coupons`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `store_coupons` ADD CONSTRAINT `store_coupons_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `coupon_zones` ADD CONSTRAINT `coupon_zones_coupon_id_fkey` FOREIGN KEY (`coupon_id`) REFERENCES `coupons`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `coupon_zones` ADD CONSTRAINT `coupon_zones_zone_id_fkey` FOREIGN KEY (`zone_id`) REFERENCES `zones`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `fortune_wheel_user_states` ADD CONSTRAINT `fortune_wheel_user_states_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `fortune_wheel_user_rewards` ADD CONSTRAINT `fortune_wheel_user_rewards_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `fortune_wheel_user_rewards` ADD CONSTRAINT `fortune_wheel_user_rewards_item_id_fkey` FOREIGN KEY (`item_id`) REFERENCES `fortune_wheel_items`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `fund` ADD CONSTRAINT `fund_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `order` ADD CONSTRAINT `order_address_id_fkey` FOREIGN KEY (`address_id`) REFERENCES `addresses`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `order` ADD CONSTRAINT `order_zone_id_fkey` FOREIGN KEY (`zone_id`) REFERENCES `zones`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `order` ADD CONSTRAINT `order_branch_id_fkey` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `order` ADD CONSTRAINT `order_couponId_fkey` FOREIGN KEY (`couponId`) REFERENCES `coupons`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `order` ADD CONSTRAINT `order_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `order` ADD CONSTRAINT `order_specialist_id_fkey` FOREIGN KEY (`specialist_id`) REFERENCES `Specialist`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `order` ADD CONSTRAINT `order_delivery_id_fkey` FOREIGN KEY (`delivery_id`) REFERENCES `DeliveryDetails`(`user_id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `order_items` ADD CONSTRAINT `order_items_order_id_fkey` FOREIGN KEY (`order_id`) REFERENCES `order`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `order_items` ADD CONSTRAINT `order_items_service_id_fkey` FOREIGN KEY (`service_id`) REFERENCES `services`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `order_items` ADD CONSTRAINT `order_items_size_id_fkey` FOREIGN KEY (`size_id`) REFERENCES `service_sizes`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `order_items` ADD CONSTRAINT `order_items_order_bundle_id_fkey` FOREIGN KEY (`order_bundle_id`) REFERENCES `order_bundles`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `order_bundles` ADD CONSTRAINT `order_bundles_order_id_fkey` FOREIGN KEY (`order_id`) REFERENCES `order`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `order_bundles` ADD CONSTRAINT `order_bundles_bundle_id_fkey` FOREIGN KEY (`bundle_id`) REFERENCES `bundles`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `order_item_addons` ADD CONSTRAINT `order_item_addons_order_item_id_fkey` FOREIGN KEY (`order_item_id`) REFERENCES `order_items`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `order_item_addons` ADD CONSTRAINT `order_item_addons_addon_id_fkey` FOREIGN KEY (`addon_id`) REFERENCES `service_addons`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `order_delivery_assignments` ADD CONSTRAINT `order_delivery_assignments_order_id_fkey` FOREIGN KEY (`order_id`) REFERENCES `order`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `order_delivery_assignments` ADD CONSTRAINT `order_delivery_assignments_delivery_id_fkey` FOREIGN KEY (`delivery_id`) REFERENCES `DeliveryDetails`(`user_id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `order_stations` ADD CONSTRAINT `order_stations_order_id_fkey` FOREIGN KEY (`order_id`) REFERENCES `order`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `order_station_images` ADD CONSTRAINT `order_station_images_station_id_fkey` FOREIGN KEY (`station_id`) REFERENCES `order_stations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `archived_order` ADD CONSTRAINT `archived_order_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `archived_order` ADD CONSTRAINT `archived_order_address_id_fkey` FOREIGN KEY (`address_id`) REFERENCES `addresses`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `archived_order` ADD CONSTRAINT `archived_order_branch_id_fkey` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `archived_order` ADD CONSTRAINT `archived_order_couponId_fkey` FOREIGN KEY (`couponId`) REFERENCES `coupons`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `archived_order_items` ADD CONSTRAINT `archived_order_items_archived_order_id_fkey` FOREIGN KEY (`archived_order_id`) REFERENCES `archived_order`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `archived_order_items` ADD CONSTRAINT `archived_order_items_service_id_fkey` FOREIGN KEY (`service_id`) REFERENCES `services`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `archived_order_items` ADD CONSTRAINT `archived_order_items_size_id_fkey` FOREIGN KEY (`size_id`) REFERENCES `service_sizes`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `archived_order_item_addons` ADD CONSTRAINT `archived_order_item_addons_archived_order_item_id_fkey` FOREIGN KEY (`archived_order_item_id`) REFERENCES `archived_order_items`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `archived_order_item_addons` ADD CONSTRAINT `archived_order_item_addons_addon_id_fkey` FOREIGN KEY (`addon_id`) REFERENCES `service_addons`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `otps` ADD CONSTRAINT `otps_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `delivery_rating` ADD CONSTRAINT `delivery_rating_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `delivery_rating` ADD CONSTRAINT `delivery_rating_order_id_fkey` FOREIGN KEY (`order_id`) REFERENCES `order`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `delivery_rating` ADD CONSTRAINT `delivery_rating_delivery_id_fk` FOREIGN KEY (`delivery_id`) REFERENCES `DeliveryDetails`(`user_id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `store_rating` ADD CONSTRAINT `store_rating_branch_id_fkey` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `store_rating` ADD CONSTRAINT `store_rating_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `store_rating` ADD CONSTRAINT `store_rating_order_id_fkey` FOREIGN KEY (`order_id`) REFERENCES `order`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `store_rating` ADD CONSTRAINT `store_rating_storeId_fkey` FOREIGN KEY (`storeId`) REFERENCES `stores`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `services` ADD CONSTRAINT `services_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `services` ADD CONSTRAINT `services_category_id_fkey` FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `favorite_service` ADD CONSTRAINT `favorite_service_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `favorite_service` ADD CONSTRAINT `favorite_service_service_id_fkey` FOREIGN KEY (`service_id`) REFERENCES `services`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `service_sizes` ADD CONSTRAINT `service_sizes_service_id_fkey` FOREIGN KEY (`service_id`) REFERENCES `services`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `service_addons` ADD CONSTRAINT `service_addons_service_id_fkey` FOREIGN KEY (`service_id`) REFERENCES `services`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sessions` ADD CONSTRAINT `sessions_language_id_fkey` FOREIGN KEY (`language_id`) REFERENCES `languages`(`key`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sessions` ADD CONSTRAINT `sessions_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Specialist` ADD CONSTRAINT `Specialist_storeId_fkey` FOREIGN KEY (`storeId`) REFERENCES `stores`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `template_categories` ADD CONSTRAINT `template_categories_template_id_fkey` FOREIGN KEY (`template_id`) REFERENCES `store_templates`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `template_services` ADD CONSTRAINT `template_services_template_category_id_fkey` FOREIGN KEY (`template_category_id`) REFERENCES `template_categories`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `template_service_sizes` ADD CONSTRAINT `template_service_sizes_template_service_id_fkey` FOREIGN KEY (`template_service_id`) REFERENCES `template_services`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `template_service_addons` ADD CONSTRAINT `template_service_addons_template_service_id_fkey` FOREIGN KEY (`template_service_id`) REFERENCES `template_services`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `store_template_applications` ADD CONSTRAINT `store_template_applications_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `store_template_applications` ADD CONSTRAINT `store_template_applications_template_id_fkey` FOREIGN KEY (`template_id`) REFERENCES `store_templates`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `stores` ADD CONSTRAINT `stores_cityId_fkey` FOREIGN KEY (`cityId`) REFERENCES `city`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `stores` ADD CONSTRAINT `stores_planId_fkey` FOREIGN KEY (`planId`) REFERENCES `plan`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `stores` ADD CONSTRAINT `stores_walletId_fkey` FOREIGN KEY (`walletId`) REFERENCES `wallet`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `branches` ADD CONSTRAINT `branches_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `branch_zones` ADD CONSTRAINT `branch_zones_branch_id_fkey` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `branch_zones` ADD CONSTRAINT `branch_zones_zone_id_fkey` FOREIGN KEY (`zone_id`) REFERENCES `zones`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `store_schedule` ADD CONSTRAINT `store_schedule_branch_id_fkey` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `favorite_store` ADD CONSTRAINT `favorite_store_branch_id_fkey` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `favorite_store` ADD CONSTRAINT `favorite_store_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `favorite_store` ADD CONSTRAINT `favorite_store_storeId_fkey` FOREIGN KEY (`storeId`) REFERENCES `stores`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `wallet` ADD CONSTRAINT `wallet_branch_id_fkey` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `transactions` ADD CONSTRAINT `transactions_customer_Id_fkey` FOREIGN KEY (`customer_Id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `transactions` ADD CONSTRAINT `transactions_branch_Id_fkey` FOREIGN KEY (`branch_Id`) REFERENCES `branches`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `transactions` ADD CONSTRAINT `transactions_delivery_Id_fkey` FOREIGN KEY (`delivery_Id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `transactions` ADD CONSTRAINT `transactions_storeId_fkey` FOREIGN KEY (`storeId`) REFERENCES `stores`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `users` ADD CONSTRAINT `users_branchId_fkey` FOREIGN KEY (`branchId`) REFERENCES `branches`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `users` ADD CONSTRAINT `users_role_id_fkey` FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `users` ADD CONSTRAINT `users_storeId_fkey` FOREIGN KEY (`storeId`) REFERENCES `stores`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `details` ADD CONSTRAINT `details_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DeliveryDetails` ADD CONSTRAINT `DeliveryDetails_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `delivery_schedule` ADD CONSTRAINT `delivery_schedule_delivery_id_fkey` FOREIGN KEY (`delivery_id`) REFERENCES `DeliveryDetails`(`user_id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `delivery_attendance` ADD CONSTRAINT `delivery_attendance_delivery_id_fkey` FOREIGN KEY (`delivery_id`) REFERENCES `DeliveryDetails`(`user_id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `delivery_attendance` ADD CONSTRAINT `delivery_attendance_schedule_id_fkey` FOREIGN KEY (`schedule_id`) REFERENCES `delivery_schedule`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `addresses` ADD CONSTRAINT `addresses_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `variation_template_values` ADD CONSTRAINT `variation_template_values_variation_template_id_fkey` FOREIGN KEY (`variation_template_id`) REFERENCES `variation_templates`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Withdraw` ADD CONSTRAINT `Withdraw_store_account_id_fkey` FOREIGN KEY (`store_account_id`) REFERENCES `bank_accounts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `zones` ADD CONSTRAINT `zones_city_id_fkey` FOREIGN KEY (`city_id`) REFERENCES `city`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
