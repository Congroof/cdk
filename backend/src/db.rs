use sqlx::mysql::MySqlPoolOptions;
use sqlx::MySqlPool;

pub async fn create_pool(database_url: &str) -> MySqlPool {
    let base_url = database_url
        .rfind('/')
        .map(|i| &database_url[..i])
        .unwrap_or(database_url);

    let db_name = database_url
        .rfind('/')
        .map(|i| &database_url[i + 1..])
        .unwrap_or("cdk_server");

    let temp_pool = MySqlPoolOptions::new()
        .max_connections(1)
        .connect(base_url)
        .await
        .expect("Failed to connect to MySQL server");

    sqlx::query(&format!(
        "CREATE DATABASE IF NOT EXISTS `{}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci",
        db_name
    ))
    .execute(&temp_pool)
    .await
    .expect("Failed to create database");

    let pool = MySqlPoolOptions::new()
        .max_connections(10)
        .connect(database_url)
        .await
        .expect("Failed to create database pool");

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS users (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            username VARCHAR(64) NOT NULL UNIQUE,
            password_hash VARCHAR(256) NOT NULL,
            created_at DATETIME DEFAULT NOW()
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
    )
    .execute(&pool)
    .await
    .expect("Failed to create users table");

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS cdkeys (
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
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
    )
    .execute(&pool)
    .await
    .expect("Failed to create cdkeys table");

    // Auto-add created_by column for existing deployments
    let _ = sqlx::query("ALTER TABLE cdkeys ADD COLUMN created_by BIGINT NULL AFTER remark")
        .execute(&pool)
        .await;

    let _ = sqlx::query("ALTER TABLE cdkeys ADD INDEX idx_created_by (created_by)")
        .execute(&pool)
        .await;

    // Assign existing CDKs to admin user
    let _ = sqlx::query(
        "UPDATE cdkeys SET created_by = (SELECT id FROM users WHERE username = 'admin') WHERE created_by IS NULL"
    )
    .execute(&pool)
    .await;

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS usage_logs (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            machine_code VARCHAR(256) NOT NULL,
            cdk_code VARCHAR(64) NOT NULL,
            action VARCHAR(20) NOT NULL,
            created_by BIGINT NULL,
            created_at DATETIME DEFAULT NOW(),
            INDEX idx_ul_machine (machine_code),
            INDEX idx_ul_created_at (created_at),
            INDEX idx_ul_created_by (created_by)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
    )
    .execute(&pool)
    .await
    .expect("Failed to create usage_logs table");

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS cdk_binding_history (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            cdk_id BIGINT NOT NULL,
            cdk_code VARCHAR(64) NOT NULL,
            event_type VARCHAR(20) NOT NULL,
            old_machine_code VARCHAR(256) NULL,
            new_machine_code VARCHAR(256) NOT NULL,
            client_ip VARCHAR(45) NULL,
            created_by BIGINT NOT NULL,
            created_at DATETIME DEFAULT NOW(),
            INDEX idx_cbh_cdk_time (cdk_id, created_at),
            INDEX idx_cbh_code (cdk_code),
            INDEX idx_cbh_new_machine (new_machine_code),
            INDEX idx_cbh_created_by (created_by)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
    )
    .execute(&pool)
    .await
    .expect("Failed to create cdk_binding_history table");

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS banned_machines (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            machine_code VARCHAR(256) NOT NULL,
            reason VARCHAR(512) NULL,
            created_by BIGINT NOT NULL,
            created_at DATETIME DEFAULT NOW(),
            UNIQUE INDEX idx_bm_unique (machine_code, created_by),
            INDEX idx_bm_created_by (created_by)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
    )
    .execute(&pool)
    .await
    .expect("Failed to create banned_machines table");

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS user_feedback (
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
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
    )
    .execute(&pool)
    .await
    .expect("Failed to create user_feedback table");

    let _ = sqlx::query(
        "ALTER TABLE user_feedback ADD COLUMN is_done BOOLEAN NOT NULL DEFAULT FALSE AFTER created_by"
    )
    .execute(&pool)
    .await;

    let _ = sqlx::query("ALTER TABLE user_feedback ADD COLUMN done_at DATETIME NULL AFTER is_done")
        .execute(&pool)
        .await;

    let _ = sqlx::query("ALTER TABLE user_feedback ADD INDEX idx_feedback_is_done (is_done)")
        .execute(&pool)
        .await;

    let _ = sqlx::query("ALTER TABLE user_feedback ADD COLUMN reply TEXT NULL AFTER metadata")
        .execute(&pool)
        .await;

    let _ =
        sqlx::query("ALTER TABLE user_feedback ADD COLUMN replied_at DATETIME NULL AFTER reply")
            .execute(&pool)
            .await;

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS announcements (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            title VARCHAR(128) NOT NULL,
            content TEXT NOT NULL,
            is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
            created_by BIGINT NOT NULL,
            created_at DATETIME DEFAULT NOW(),
            updated_at DATETIME DEFAULT NOW() ON UPDATE NOW(),
            UNIQUE INDEX idx_announcement_created_by (created_by)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
    )
    .execute(&pool)
    .await
    .expect("Failed to create announcements table");

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS skinforge_kdocs_settings (
            id TINYINT UNSIGNED PRIMARY KEY,
            cookie_ciphertext MEDIUMTEXT NOT NULL,
            cookie_nonce VARCHAR(64) NOT NULL,
            cookie_hint VARCHAR(128) NOT NULL,
            group_id BIGINT UNSIGNED NOT NULL,
            parent_id BIGINT UNSIGNED NOT NULL,
            updated_by BIGINT NOT NULL,
            updated_at DATETIME DEFAULT NOW() ON UPDATE NOW()
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
    )
    .execute(&pool)
    .await
    .expect("Failed to create skinforge_kdocs_settings table");

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS skinforge_releases (
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
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
    )
    .execute(&pool)
    .await
    .expect("Failed to create skinforge_releases table");

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS skinforge_hash_releases (
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
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
    )
    .execute(&pool)
    .await
    .expect("Failed to create skinforge_hash_releases table");

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS skinforge_hash_sync_status (
            id TINYINT UNSIGNED PRIMARY KEY,
            last_attempt_at DATETIME NULL,
            last_success_at DATETIME NULL,
            last_error TEXT NULL,
            last_candidate_version VARCHAR(128) NULL,
            updated_at DATETIME DEFAULT NOW() ON UPDATE NOW()
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
    )
    .execute(&pool)
    .await
    .expect("Failed to create skinforge_hash_sync_status table");

    sqlx::query("INSERT IGNORE INTO skinforge_hash_sync_status (id, updated_at) VALUES (1, NOW())")
        .execute(&pool)
        .await
        .expect("Failed to initialize skinforge_hash_sync_status");

    tracing::info!("Database '{}' ready", db_name);
    pool
}
