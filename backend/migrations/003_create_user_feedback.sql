-- Migration: Create user feedback table
-- Run this on an existing deployment before updating the binary if auto-migration is disabled.

CREATE TABLE IF NOT EXISTS user_feedback (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    feedback_type VARCHAR(32) NOT NULL DEFAULT 'general',
    content TEXT NOT NULL,
    contact VARCHAR(128) NULL,
    machine_code VARCHAR(256) NULL,
    cdk_code VARCHAR(64) NULL,
    app_version VARCHAR(64) NULL,
    platform VARCHAR(64) NULL,
    metadata TEXT NULL,
    created_by BIGINT NULL,
    created_at DATETIME DEFAULT NOW(),
    INDEX idx_feedback_created_by (created_by),
    INDEX idx_feedback_created_at (created_at),
    INDEX idx_feedback_machine_code (machine_code),
    INDEX idx_feedback_cdk_code (cdk_code),
    INDEX idx_feedback_type (feedback_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
