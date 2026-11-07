use chrono::NaiveDateTime;
use serde::{Deserialize, Serialize};
use sqlx::FromRow;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ManagerArtifact {
    pub file_id: String,
    pub link_id: String,
    pub file_name: String,
    pub file_size: u64,
    pub sha256: String,
    pub group_id: String,
    pub parent_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ManagerManifest {
    pub schema_version: u32,
    pub product: String,
    pub platform: String,
    pub version: String,
    pub signature: String,
    pub artifact: ManagerArtifact,
}

#[derive(Debug, Deserialize)]
pub struct SaveManagerRequest {
    pub manifest: ManagerManifest,
}

#[derive(Debug, FromRow)]
pub struct ManagerReleaseRow {
    pub version: String,
    pub file_name: String,
    pub file_size: u64,
    pub sha256: String,
    pub signature: String,
    pub file_id: u64,
    pub link_id: String,
    pub updated_at: NaiveDateTime,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PublicManagerRelease {
    pub version: String,
    pub platform: &'static str,
    pub file_name: String,
    pub file_size: u64,
    pub sha256: String,
    pub signature: String,
    pub url: String,
}
