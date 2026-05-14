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
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
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
            created_at DATETIME DEFAULT NOW(),
            activated_at DATETIME NULL,
            expires_at DATETIME NULL,
            INDEX idx_code (code),
            INDEX idx_status (status),
            INDEX idx_machine_code (machine_code)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
    )
    .execute(&pool)
    .await
    .expect("Failed to create cdkeys table");


    tracing::info!("Database '{}' ready", db_name);
    pool
}
