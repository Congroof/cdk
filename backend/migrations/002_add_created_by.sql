-- Migration: Add created_by column for multi-user data isolation
-- Run this on an existing deployment before updating the binary

ALTER TABLE cdkeys ADD COLUMN created_by BIGINT NULL AFTER remark;
ALTER TABLE cdkeys ADD INDEX idx_created_by (created_by);

-- Assign all existing CDKs to the admin user
UPDATE cdkeys SET created_by = (SELECT id FROM users WHERE username = 'admin') WHERE created_by IS NULL;
