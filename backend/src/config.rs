use std::env;
use std::path::PathBuf;

#[derive(Clone)]
pub struct Config {
    pub database_url: String,
    pub jwt_secret: String,
    pub server_addr: String,
    pub kdocs_credential_key: String,
    pub hash_sync: HashSyncConfig,
}

#[derive(Clone)]
pub struct HashSyncConfig {
    pub enabled: bool,
    pub source_url: String,
    pub mirror_dir: PathBuf,
    pub interval_hours: u64,
}

impl Config {
    pub fn from_env() -> Self {
        Self {
            database_url: env::var("DATABASE_URL").expect("DATABASE_URL must be set"),
            jwt_secret: env::var("JWT_SECRET").expect("JWT_SECRET must be set"),
            server_addr: env::var("SERVER_ADDR").unwrap_or_else(|_| "0.0.0.0:3000".to_string()),
            kdocs_credential_key: env::var("KDOCS_CREDENTIAL_KEY")
                .expect("KDOCS_CREDENTIAL_KEY must be set"),
            hash_sync: HashSyncConfig::from_env(),
        }
    }
}

impl HashSyncConfig {
    fn from_env() -> Self {
        Self {
            enabled: env_bool("SKINFORGE_HASH_SYNC_ENABLED", true),
            source_url: env::var("SKINFORGE_HASH_SOURCE_URL").unwrap_or_else(|_| {
                "https://raw.communitydragon.org/data/hashes/lol/hashes.game.txt".to_string()
            }),
            mirror_dir: env::var("SKINFORGE_HASH_MIRROR_DIR")
                .map(PathBuf::from)
                .unwrap_or_else(|_| PathBuf::from("/opt/skinforge-updates/hashes")),
            interval_hours: env::var("SKINFORGE_HASH_SYNC_INTERVAL_HOURS")
                .ok()
                .and_then(|value| value.parse::<u64>().ok())
                .filter(|hours| *hours > 0)
                .unwrap_or(24),
        }
    }
}

fn env_bool(name: &str, default: bool) -> bool {
    match env::var(name).ok().as_deref() {
        Some("1" | "true" | "TRUE" | "yes" | "YES" | "on" | "ON") => true,
        Some("0" | "false" | "FALSE" | "no" | "NO" | "off" | "OFF") => false,
        _ => default,
    }
}
