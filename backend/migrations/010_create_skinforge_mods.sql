CREATE TABLE IF NOT EXISTS skinforge_mods (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    category VARCHAR(32) NOT NULL,
    file_id BIGINT UNSIGNED NOT NULL,
    link_id VARCHAR(128) NOT NULL,
    link_url TEXT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_size BIGINT UNSIGNED NOT NULL,
    created_by BIGINT NOT NULL,
    created_at DATETIME DEFAULT NOW(),
    UNIQUE KEY uq_skinforge_mods_file_link (file_id, link_id),
    KEY idx_skinforge_mods_category_created (category, created_at, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
