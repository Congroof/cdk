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
    reply TEXT NULL,
    replied_at DATETIME NULL,
    created_by BIGINT NULL,
    is_done BOOLEAN NOT NULL DEFAULT FALSE,
    done_at DATETIME NULL,
    created_at DATETIME DEFAULT NOW(),
    INDEX idx_feedback_created_by (created_by),
    INDEX idx_feedback_created_at (created_at),
    INDEX idx_feedback_is_done (is_done),
    INDEX idx_feedback_machine_code (machine_code),
    INDEX idx_feedback_cdk_code (cdk_code),
    INDEX idx_feedback_type (feedback_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS announcements (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(128) NOT NULL,
    content TEXT NOT NULL,
    is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_by BIGINT NOT NULL,
    created_at DATETIME DEFAULT NOW(),
    updated_at DATETIME DEFAULT NOW() ON UPDATE NOW(),
    UNIQUE INDEX idx_announcement_created_by (created_by)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS skinforge_kdocs_settings (
    id TINYINT UNSIGNED PRIMARY KEY,
    cookie_ciphertext MEDIUMTEXT NOT NULL,
    cookie_nonce VARCHAR(64) NOT NULL,
    cookie_hint VARCHAR(128) NOT NULL,
    group_id BIGINT UNSIGNED NOT NULL,
    parent_id BIGINT UNSIGNED NOT NULL,
    updated_by BIGINT NOT NULL,
    updated_at DATETIME DEFAULT NOW() ON UPDATE NOW()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS skinforge_releases (
    id TINYINT UNSIGNED PRIMARY KEY,
    version VARCHAR(64) NOT NULL,
    notes TEXT NOT NULL,
    pub_date VARCHAR(64) NOT NULL,
    signature TEXT NOT NULL,
    file_id BIGINT UNSIGNED NOT NULL,
    link_id VARCHAR(128) NOT NULL,
    link_url TEXT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_size BIGINT UNSIGNED NOT NULL,
    sha1 CHAR(40) NOT NULL,
    sha256 CHAR(64) NOT NULL,
    updated_by BIGINT NOT NULL,
    updated_at DATETIME DEFAULT NOW() ON UPDATE NOW()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS skinforge_hash_releases (
    id TINYINT UNSIGNED PRIMARY KEY,
    version VARCHAR(128) NOT NULL,
    etag VARCHAR(255) NULL,
    canonical_size BIGINT UNSIGNED NOT NULL,
    canonical_sha256 CHAR(64) NOT NULL,
    source TEXT NOT NULL,
    txt_file_id BIGINT UNSIGNED NOT NULL,
    txt_link_id VARCHAR(128) NOT NULL,
    txt_file_name VARCHAR(255) NOT NULL,
    txt_size BIGINT UNSIGNED NOT NULL,
    txt_sha256 CHAR(64) NOT NULL,
    gzip_file_id BIGINT UNSIGNED NOT NULL,
    gzip_link_id VARCHAR(128) NOT NULL,
    gzip_file_name VARCHAR(255) NOT NULL,
    gzip_size BIGINT UNSIGNED NOT NULL,
    gzip_sha256 CHAR(64) NOT NULL,
    published_at DATETIME DEFAULT NOW()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS skinforge_hash_sync_status (
    id TINYINT UNSIGNED PRIMARY KEY,
    last_attempt_at DATETIME NULL,
    last_success_at DATETIME NULL,
    last_error TEXT NULL,
    last_candidate_version VARCHAR(128) NULL,
    updated_at DATETIME DEFAULT NOW() ON UPDATE NOW()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO skinforge_hash_sync_status (id, updated_at) VALUES (1, NOW());

-- 管理员账号: admin / C%ht$n9*2FrkG0
INSERT INTO users (username, password_hash) VALUES (
  'admin',
  '$2b$12$07POrj7ENvN/d1teHn9jfunobCrrh/WHoSAeIgKKXOv4/1Q4GV3rG'
);
