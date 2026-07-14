-- Migration: Add administrator reply fields to user feedback
-- Run this on deployments that already created user_feedback without these fields.

ALTER TABLE user_feedback ADD COLUMN reply TEXT NULL AFTER metadata;
ALTER TABLE user_feedback ADD COLUMN replied_at DATETIME NULL AFTER reply;
