CREATE DATABASE IF NOT EXISTS cdk_server CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE cdk_server;

CREATE TABLE IF NOT EXISTS users (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(64) NOT NULL UNIQUE,
    password_hash VARCHAR(256) NOT NULL,
    created_at DATETIME DEFAULT NOW()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS cdkeys (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(64) NOT NULL UNIQUE,
    valid_duration INT NOT NULL,
    valid_unit VARCHAR(10) NOT NULL DEFAULT 'days',
    status ENUM('unused', 'activated', 'expired', 'disabled') DEFAULT 'unused',
    machine_code VARCHAR(256) NULL,
    remark VARCHAR(256) NULL,
    created_by BIGINT NULL,
    created_at DATETIME DEFAULT NOW(),
    activated_at DATETIME NULL,
    expires_at DATETIME NULL,
    INDEX idx_code (code),
    INDEX idx_status (status),
    INDEX idx_machine_code (machine_code),
    INDEX idx_created_by (created_by)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 插入管理员账号（密码需使用 bcrypt 哈希）
-- 示例：密码为 admin123
-- INSERT INTO users (username, password_hash) VALUES ('admin', '$2b$12$生成的哈希值');
-- 可使用 cd backend && cargo run --bin gen_hash 生成哈希

-- 从旧版本升级（如果 cdkeys 表还是 valid_days 字段）：
-- ALTER TABLE cdkeys CHANGE COLUMN valid_days valid_duration INT NOT NULL;
-- ALTER TABLE cdkeys ADD COLUMN valid_unit VARCHAR(10) NOT NULL DEFAULT 'days' AFTER valid_duration;
