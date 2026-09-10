-- Add order column to store_template_applications table
-- Safe to re-run with IF NOT EXISTS in MySQL 8.0.29+ or direct ALTER
ALTER TABLE store_template_applications ADD COLUMN `order` INT NOT NULL DEFAULT 0;
