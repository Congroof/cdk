USE cdk_server;

CREATE TABLE IF NOT EXISTS cdk_binding_history (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
