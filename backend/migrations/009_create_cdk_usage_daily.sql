USE cdk_server;

CREATE TABLE IF NOT EXISTS cdk_usage_daily (
    created_by BIGINT NOT NULL,
    machine_code VARCHAR(256) NOT NULL,
    usage_date DATE NOT NULL,
    duration_seconds BIGINT NOT NULL DEFAULT 0,
    first_active DATETIME NOT NULL,
    last_active DATETIME NOT NULL,
    updated_at DATETIME DEFAULT NOW() ON UPDATE NOW(),
    PRIMARY KEY (created_by, machine_code, usage_date),
    INDEX idx_cud_owner_date (created_by, usage_date),
    INDEX idx_cud_usage_date (usage_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
