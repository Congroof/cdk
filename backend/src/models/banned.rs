use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct BannedMachine {
    pub id: i64,
    pub machine_code: String,
    pub reason: Option<String>,
    pub created_by: i64,
    pub created_at: chrono::NaiveDateTime,
}

#[derive(Debug, Deserialize)]
pub struct BanRequest {
    pub machine_code: String,
    pub reason: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UnbanRequest {
    pub machine_code: String,
}

#[derive(Debug, Deserialize)]
pub struct BannedListQuery {
    pub page: Option<u32>,
    pub page_size: Option<u32>,
    pub search: Option<String>,
}
