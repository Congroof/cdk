use chrono::NaiveDateTime;
use serde::{Deserialize, Serialize};
use sqlx::FromRow;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveKdocsSettingsRequest {
    pub cookie: String,
    pub group_id: String,
    pub parent_id: String,
}

#[derive(Debug, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct KdocsSettingsView {
    pub configured: bool,
    pub cookie_hint: Option<String>,
    pub group_id: Option<String>,
    pub parent_id: Option<String>,
    pub updated_by: Option<String>,
    pub updated_at: Option<NaiveDateTime>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReleaseManifestArtifact {
    pub file_id: String,
    pub link_id: String,
    pub link_url: Option<String>,
    pub file_name: String,
    pub file_size: u64,
    pub sha1: String,
    pub sha256: String,
    pub group_id: String,
    pub parent_id: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReleaseManifest {
    pub schema_version: u32,
    pub product: String,
    pub platform: String,
    pub version: String,
    pub pub_date: String,
    pub signature: String,
    pub artifact: ReleaseManifestArtifact,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveReleaseRequest {
    pub manifest: ReleaseManifest,
    pub notes: String,
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct SkinforgeRelease {
    pub version: String,
    pub notes: String,
    pub pub_date: String,
    pub signature: String,
    pub file_id: u64,
    pub link_id: String,
    pub link_url: Option<String>,
    pub file_name: String,
    pub file_size: u64,
    pub sha1: String,
    pub sha256: String,
    pub updated_by: Option<String>,
    pub updated_at: NaiveDateTime,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UploadedArtifact {
    pub file_id: u64,
    pub link_id: String,
    pub link_url: Option<String>,
    pub file_name: String,
    pub file_size: u64,
    pub sha1: String,
    pub sha256: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PendingHashUploads {
    pub version: String,
    pub canonical_sha256: String,
    pub txt: Option<UploadedArtifact>,
    pub gzip: Option<UploadedArtifact>,
}

#[derive(Debug, Clone, FromRow)]
pub struct HashReleaseRow {
    pub version: String,
    pub etag: Option<String>,
    pub canonical_size: u64,
    pub canonical_sha256: String,
    pub source: String,
    pub txt_file_id: u64,
    pub txt_link_id: String,
    pub txt_size: u64,
    pub txt_sha256: String,
    pub gzip_file_id: u64,
    pub gzip_link_id: String,
    pub gzip_size: u64,
    pub gzip_sha256: String,
    pub published_at: NaiveDateTime,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PublicHashArtifact {
    pub url: String,
    pub size: u64,
    pub sha256: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PublicHashArtifacts {
    pub gzip: PublicHashArtifact,
    pub identity: PublicHashArtifact,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PublicHashRelease {
    pub version: String,
    pub etag: Option<String>,
    pub size: u64,
    pub sha256: String,
    pub source: String,
    pub updated_at: NaiveDateTime,
    pub artifacts: PublicHashArtifacts,
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct HashSyncStatusRow {
    pub last_attempt_at: Option<NaiveDateTime>,
    pub last_success_at: Option<NaiveDateTime>,
    pub last_error: Option<String>,
    pub last_candidate_version: Option<String>,
    pub updated_at: NaiveDateTime,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HashManagementStatus {
    pub running: bool,
    pub sync: HashSyncStatusRow,
    pub current: Option<HashReleaseSummary>,
    pub pending: Option<HashPendingSummary>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HashPendingSummary {
    pub version: String,
    pub txt_uploaded: bool,
    pub gzip_uploaded: bool,
}

#[derive(Debug, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct HashReleaseSummary {
    pub version: String,
    pub canonical_size: u64,
    pub canonical_sha256: String,
    pub txt_file_name: String,
    pub txt_size: u64,
    pub gzip_file_name: String,
    pub gzip_size: u64,
    pub published_at: NaiveDateTime,
}
