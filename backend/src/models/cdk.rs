use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum CdkStatus {
    Unused,
    Activated,
    Expired,
    Disabled,
}

impl CdkStatus {
    pub fn from_str(s: &str) -> Self {
        match s {
            "activated" => CdkStatus::Activated,
            "expired" => CdkStatus::Expired,
            "disabled" => CdkStatus::Disabled,
            _ => CdkStatus::Unused,
        }
    }
}

#[derive(Debug, Serialize)]
pub struct Cdk {
    pub id: i64,
    pub code: String,
    pub valid_duration: i32,
    pub valid_unit: String,
    pub status: CdkStatus,
    pub machine_code: Option<String>,
    pub remark: Option<String>,
    pub created_by: Option<i64>,
    pub created_at: chrono::NaiveDateTime,
    pub activated_at: Option<chrono::NaiveDateTime>,
    pub expires_at: Option<chrono::NaiveDateTime>,
}

#[derive(Debug, sqlx::FromRow)]
pub struct CdkRow {
    pub id: i64,
    pub code: String,
    pub valid_duration: i32,
    pub valid_unit: String,
    pub status: String,
    pub machine_code: Option<String>,
    pub remark: Option<String>,
    pub created_by: Option<i64>,
    pub created_at: chrono::NaiveDateTime,
    pub activated_at: Option<chrono::NaiveDateTime>,
    pub expires_at: Option<chrono::NaiveDateTime>,
}

impl CdkRow {
    pub fn duration_as_hours(&self) -> i64 {
        match self.valid_unit.as_str() {
            "hours" => self.valid_duration as i64,
            _ => self.valid_duration as i64 * 24,
        }
    }
}

impl From<CdkRow> for Cdk {
    fn from(row: CdkRow) -> Self {
        Cdk {
            id: row.id,
            code: row.code,
            valid_duration: row.valid_duration,
            valid_unit: row.valid_unit,
            status: CdkStatus::from_str(&row.status),
            machine_code: row.machine_code,
            remark: row.remark,
            created_by: row.created_by,
            created_at: row.created_at,
            activated_at: row.activated_at,
            expires_at: row.expires_at,
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct GenerateRequest {
    pub count: u32,
    pub valid_duration: i32,
    pub valid_unit: Option<String>,
    pub remark: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ValidateRequest {
    pub code: String,
    pub machine_code: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct ValidateResponse {
    pub valid: bool,
    pub status: Option<CdkStatus>,
    pub expires_at: Option<chrono::NaiveDateTime>,
    pub message: String,
}

#[derive(Debug, Deserialize)]
pub struct ActivateRequest {
    pub code: String,
    pub machine_code: String,
}

#[derive(Debug, Deserialize)]
pub struct DisableRequest {
    pub code: String,
}

#[derive(Debug, Deserialize)]
pub struct UpdateValidityRequest {
    pub code: String,
    pub valid_duration: Option<i32>,
    pub valid_unit: Option<String>,
    pub extend_duration: Option<i32>,
    pub extend_unit: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ListQuery {
    pub page: Option<u32>,
    pub page_size: Option<u32>,
    pub status: Option<String>,
    pub search: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ExportQuery {
    pub status: Option<String>,
    pub date_from: Option<String>,
    pub date_to: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UsageStatsQuery {
    pub days: Option<u32>,
    pub search: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct MachineUsageQuery {
    pub machine_code: String,
    pub days: Option<u32>,
}

#[derive(Debug, Serialize)]
pub struct UsageOverview {
    pub unique_machines: i64,
    pub active_today: i64,
    pub total_requests: i64,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct MachineStats {
    pub machine_code: String,
    pub cdk_count: i64,
    pub first_seen: chrono::NaiveDateTime,
    pub last_seen: chrono::NaiveDateTime,
    pub active_days: i64,
    pub total_requests: i64,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct DailyTrend {
    pub date: String,
    pub requests: i64,
    pub unique_machines: i64,
}
