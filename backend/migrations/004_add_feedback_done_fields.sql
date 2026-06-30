-- Migration: Add feedback done-state fields
-- Run this on deployments that already created user_feedback without these fields.

ALTER TABLE user_feedback ADD COLUMN is_done BOOLEAN NOT NULL DEFAULT FALSE AFTER created_by;
ALTER TABLE user_feedback ADD COLUMN done_at DATETIME NULL AFTER is_done;
ALTER TABLE user_feedback ADD INDEX idx_feedback_is_done (is_done);
