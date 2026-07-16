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
