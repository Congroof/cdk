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

    tracing::info!("Database '{}' ready", db_name);
    pool
}
