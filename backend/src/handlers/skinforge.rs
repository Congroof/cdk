use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::{Extension, Json};
use chrono::DateTime;
use semver::Version;

use crate::errors::AppError;
use crate::kdocs::{cookie_hint, KdocsSettings};
use crate::middleware::auth::Claims;
use crate::models::skinforge::{
    HashReleaseRow, KdocsSettingsView, PublicHashArtifact, PublicHashArtifacts, PublicHashRelease,
    SaveKdocsSettingsRequest, SaveReleaseRequest, SkinforgeRelease,
};
use crate::AppState;

const RELEASE_SCHEMA_VERSION: u32 = 1;
const RELEASE_PRODUCT: &str = "skinforge";
const RELEASE_PLATFORM: &str = "windows-x86_64";
const MAX_NOTES_LEN: usize = 20_000;

pub async fn get_kdocs_settings(
    State(state): State<AppState>,
) -> Result<Json<serde_json::Value>, AppError> {
    let row = sqlx::query_as::<_, (String, u64, u64, Option<String>, chrono::NaiveDateTime)>(
        "SELECT s.cookie_hint, s.group_id, s.parent_id, u.username, s.updated_at
         FROM skinforge_kdocs_settings s
         LEFT JOIN users u ON u.id = s.updated_by
         WHERE s.id = 1",
    )
    .fetch_optional(&state.db)
    .await?;
    let data = match row {
        Some((hint, group_id, parent_id, username, updated_at)) => KdocsSettingsView {
            configured: true,
            cookie_hint: Some(hint),
            group_id: Some(group_id.to_string()),
            parent_id: Some(parent_id.to_string()),
            updated_by: username,
            updated_at: Some(updated_at),
        },
        None => KdocsSettingsView {
            configured: false,
            cookie_hint: None,
            group_id: None,
            parent_id: None,
            updated_by: None,
            updated_at: None,
        },
    };
    Ok(Json(serde_json::json!({ "success": true, "data": data })))
}

pub async fn save_kdocs_settings(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Json(payload): Json<SaveKdocsSettingsRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    let cookie = payload.cookie.trim().to_string();
    if cookie.is_empty() {
        return Err(AppError::BadRequest("云文档 Cookie 不能为空".to_string()));
    }
    let group_id = parse_positive_id(&payload.group_id, "group_id")?;
    let parent_id = parse_positive_id(&payload.parent_id, "parent_id")?;
    let settings = KdocsSettings {
        cookie: cookie.clone(),
        group_id,
        parent_id,
    };
    state
        .kdocs
        .validate_settings(&settings)
        .await
        .map_err(AppError::BadRequest)?;
    let (ciphertext, nonce) = state
        .kdocs
        .encrypt_cookie(&cookie)
        .map_err(AppError::Internal)?;
    let user_id = current_user_id(&state, &claims.sub).await?;
    sqlx::query(
        "INSERT INTO skinforge_kdocs_settings (
            id, cookie_ciphertext, cookie_nonce, cookie_hint, group_id, parent_id,
            updated_by, updated_at
         ) VALUES (1, ?, ?, ?, ?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE
            cookie_ciphertext = VALUES(cookie_ciphertext),
            cookie_nonce = VALUES(cookie_nonce),
            cookie_hint = VALUES(cookie_hint),
            group_id = VALUES(group_id),
            parent_id = VALUES(parent_id),
            updated_by = VALUES(updated_by),
            updated_at = NOW()",
    )
    .bind(ciphertext)
    .bind(nonce)
    .bind(cookie_hint(&cookie))
    .bind(group_id)
    .bind(parent_id)
    .bind(user_id)
    .execute(&state.db)
    .await?;
    state.kdocs.clear_cache().await;
    get_kdocs_settings(State(state)).await
}

pub async fn get_release(
    State(state): State<AppState>,
) -> Result<Json<serde_json::Value>, AppError> {
    let release = fetch_release(&state).await?;
    Ok(Json(
        serde_json::json!({ "success": true, "data": release }),
    ))
}

pub async fn save_release(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Json(payload): Json<SaveReleaseRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    let validated = validate_release_request(&payload)?;
    let settings = state
        .kdocs
        .load_settings(&state.db)
        .await
        .map_err(AppError::BadRequest)?;
    if validated.group_id != settings.group_id || validated.parent_id != settings.parent_id {
        return Err(AppError::BadRequest(
            "发布清单的云文档目录与当前服务端配置不一致".to_string(),
        ));
    }
    let download_url = state
        .kdocs
        .resolve_download_url(
            &state.db,
            validated.file_id,
            &payload.manifest.artifact.link_id,
        )
        .await
        .map_err(AppError::BadRequest)?;
    state
        .kdocs
        .probe_download_url(&download_url)
        .await
        .map_err(AppError::BadRequest)?;

    let user_id = current_user_id(&state, &claims.sub).await?;
    let mut transaction = state.db.begin().await?;
    let current = sqlx::query_as::<_, (String,)>(
        "SELECT version FROM skinforge_releases WHERE id = 1 FOR UPDATE",
    )
    .fetch_optional(&mut *transaction)
    .await?;
    if let Some((current,)) = current {
        let current = Version::parse(&current)
            .map_err(|_| AppError::Internal("数据库中的软件版本不是合法 SemVer".to_string()))?;
        if validated.version <= current {
            return Err(AppError::Conflict("新版本必须严格大于当前版本".to_string()));
        }
    }
    sqlx::query(
        "INSERT INTO skinforge_releases (
            id, version, notes, pub_date, signature, file_id, link_id, link_url,
            file_name, file_size, sha1, sha256, updated_by, updated_at
         ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE
            version = VALUES(version), notes = VALUES(notes),
            pub_date = VALUES(pub_date), signature = VALUES(signature),
            file_id = VALUES(file_id), link_id = VALUES(link_id),
            link_url = VALUES(link_url), file_name = VALUES(file_name),
            file_size = VALUES(file_size), sha1 = VALUES(sha1),
            sha256 = VALUES(sha256), updated_by = VALUES(updated_by),
            updated_at = NOW()",
    )
    .bind(&payload.manifest.version)
    .bind(payload.notes.trim())
    .bind(&payload.manifest.pub_date)
    .bind(payload.manifest.signature.trim())
    .bind(validated.file_id)
    .bind(&payload.manifest.artifact.link_id)
    .bind(&payload.manifest.artifact.link_url)
    .bind(&payload.manifest.artifact.file_name)
    .bind(payload.manifest.artifact.file_size)
    .bind(payload.manifest.artifact.sha1.to_ascii_lowercase())
    .bind(payload.manifest.artifact.sha256.to_ascii_lowercase())
    .bind(user_id)
    .execute(&mut *transaction)
    .await?;
    transaction.commit().await?;
    state.kdocs.clear_cache().await;
    get_release(State(state)).await
}

pub async fn updater(
    State(state): State<AppState>,
    Path((target, arch, current_version)): Path<(String, String, String)>,
) -> Result<Response, AppError> {
    if target != "windows" || arch != "x86_64" {
        return Ok(StatusCode::NO_CONTENT.into_response());
    }
    let Some(release) = fetch_release(&state).await? else {
        return Ok(StatusCode::NO_CONTENT.into_response());
    };
    let current = Version::parse(&current_version)
        .map_err(|_| AppError::BadRequest("当前客户端版本不是合法 SemVer".to_string()))?;
    let published = Version::parse(&release.version)
        .map_err(|_| AppError::Internal("数据库中的软件版本不是合法 SemVer".to_string()))?;
    if current >= published {
        return Ok(StatusCode::NO_CONTENT.into_response());
    }
    let url = state
        .kdocs
        .resolve_download_url(&state.db, release.file_id, &release.link_id)
        .await
        .map_err(AppError::ServiceUnavailable)?;
    Ok(Json(serde_json::json!({
        "version": release.version,
        "pub_date": release.pub_date,
        "notes": release.notes,
        "url": url,
        "signature": release.signature,
    }))
    .into_response())
}

pub async fn get_hash_status(
    State(state): State<AppState>,
) -> Result<Json<serde_json::Value>, AppError> {
    let status = state
        .hash_sync
        .management_status()
        .await
        .map_err(AppError::Internal)?;
    Ok(Json(serde_json::json!({ "success": true, "data": status })))
}

pub async fn trigger_hash_sync(
    State(state): State<AppState>,
) -> Result<Json<serde_json::Value>, AppError> {
    if !state.hash_sync.trigger() {
        return Err(AppError::Conflict("Hash 同步正在运行".to_string()));
    }
    Ok(Json(serde_json::json!({
        "success": true,
        "data": { "running": true }
    })))
}

pub async fn public_hash(
    State(state): State<AppState>,
) -> Result<Json<serde_json::Value>, AppError> {
    let row = sqlx::query_as::<_, HashReleaseRow>(
        "SELECT version, etag, canonical_size, canonical_sha256, source,
         txt_file_id, txt_link_id, txt_size, txt_sha256,
         gzip_file_id, gzip_link_id, gzip_size, gzip_sha256, published_at
         FROM skinforge_hash_releases WHERE id = 1",
    )
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::NotFound("尚无可用的 Hash 发布".to_string()))?;
    let (identity_url, gzip_url) = tokio::try_join!(
        state
            .kdocs
            .resolve_download_url(&state.db, row.txt_file_id, &row.txt_link_id),
        state
            .kdocs
            .resolve_download_url(&state.db, row.gzip_file_id, &row.gzip_link_id)
    )
    .map_err(AppError::ServiceUnavailable)?;
    let data = PublicHashRelease {
        version: row.version,
        etag: row.etag,
        size: row.canonical_size,
        sha256: row.canonical_sha256,
        source: row.source,
        updated_at: row.published_at,
        artifacts: PublicHashArtifacts {
            gzip: PublicHashArtifact {
                url: gzip_url,
                size: row.gzip_size,
                sha256: row.gzip_sha256,
            },
            identity: PublicHashArtifact {
                url: identity_url,
                size: row.txt_size,
                sha256: row.txt_sha256,
            },
        },
    };
    Ok(Json(serde_json::json!({ "success": true, "data": data })))
}

async fn fetch_release(state: &AppState) -> Result<Option<SkinforgeRelease>, AppError> {
    sqlx::query_as::<_, SkinforgeRelease>(
        "SELECT r.version, r.notes, r.pub_date, r.signature, r.file_id, r.link_id,
         r.link_url, r.file_name, r.file_size, r.sha1, r.sha256,
         u.username AS updated_by, r.updated_at
         FROM skinforge_releases r
         LEFT JOIN users u ON u.id = r.updated_by
         WHERE r.id = 1",
    )
    .fetch_optional(&state.db)
    .await
    .map_err(AppError::from)
}

async fn current_user_id(state: &AppState, username: &str) -> Result<i64, AppError> {
    let (user_id,): (i64,) = sqlx::query_as("SELECT id FROM users WHERE username = ?")
        .bind(username)
        .fetch_one(&state.db)
        .await?;
    Ok(user_id)
}

struct ValidatedRelease {
    version: Version,
    file_id: u64,
    group_id: u64,
    parent_id: u64,
}

fn validate_release_request(payload: &SaveReleaseRequest) -> Result<ValidatedRelease, AppError> {
    let manifest = &payload.manifest;
    if manifest.schema_version != RELEASE_SCHEMA_VERSION
        || manifest.product != RELEASE_PRODUCT
        || manifest.platform != RELEASE_PLATFORM
    {
        return Err(AppError::BadRequest(
            "发布清单 schema、product 或 platform 不受支持".to_string(),
        ));
    }
    let version = Version::parse(&manifest.version)
        .map_err(|_| AppError::BadRequest("版本号必须是合法 SemVer".to_string()))?;
    DateTime::parse_from_rfc3339(&manifest.pub_date)
        .map_err(|_| AppError::BadRequest("发布时间必须是 RFC 3339".to_string()))?;
    let notes = payload.notes.trim();
    if notes.is_empty() {
        return Err(AppError::BadRequest("更新说明不能为空".to_string()));
    }
    if notes.chars().count() > MAX_NOTES_LEN {
        return Err(AppError::BadRequest("更新说明过长".to_string()));
    }
    if manifest.signature.trim().is_empty() {
        return Err(AppError::BadRequest("Tauri 签名不能为空".to_string()));
    }
    if manifest.artifact.file_size == 0
        || !manifest
            .artifact
            .file_name
            .to_ascii_lowercase()
            .ends_with("-setup.exe")
    {
        return Err(AppError::BadRequest(
            "安装包必须是非空的 NSIS setup.exe".to_string(),
        ));
    }
    if !valid_hex(&manifest.artifact.sha1, 40) || !valid_hex(&manifest.artifact.sha256, 64) {
        return Err(AppError::BadRequest("安装包摘要格式无效".to_string()));
    }
    if manifest.artifact.link_id.trim().is_empty() {
        return Err(AppError::BadRequest("link_id 不能为空".to_string()));
    }
    Ok(ValidatedRelease {
        version,
        file_id: parse_positive_id(&manifest.artifact.file_id, "file_id")?,
        group_id: parse_positive_id(&manifest.artifact.group_id, "group_id")?,
        parent_id: parse_positive_id(&manifest.artifact.parent_id, "parent_id")?,
    })
}

fn parse_positive_id(value: &str, name: &str) -> Result<u64, AppError> {
    value
        .trim()
        .parse::<u64>()
        .ok()
        .filter(|value| *value > 0)
        .ok_or_else(|| AppError::BadRequest(format!("{name} 必须是正整数")))
}

fn valid_hex(value: &str, length: usize) -> bool {
    value.len() == length && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::skinforge::{ReleaseManifest, ReleaseManifestArtifact};

    fn request(version: &str) -> SaveReleaseRequest {
        SaveReleaseRequest {
            notes: "更新说明".to_string(),
            manifest: ReleaseManifest {
                schema_version: 1,
                product: "skinforge".to_string(),
                platform: "windows-x86_64".to_string(),
                version: version.to_string(),
                pub_date: "2026-07-16T12:00:00Z".to_string(),
                signature: "signature".to_string(),
                artifact: ReleaseManifestArtifact {
                    file_id: "540667517933".to_string(),
                    link_id: "link".to_string(),
                    link_url: None,
                    file_name: "SkinForge_1.8.0_x64-setup.exe".to_string(),
                    file_size: 100,
                    sha1: "a".repeat(40),
                    sha256: "b".repeat(64),
                    group_id: "2144952871".to_string(),
                    parent_id: "541664465686".to_string(),
                },
            },
        }
    }

    #[test]
    fn validates_release_manifest() {
        let validated = validate_release_request(&request("1.8.0")).unwrap();
        assert_eq!(validated.version, Version::new(1, 8, 0));
    }

    #[test]
    fn rejects_invalid_release_fields() {
        let mut invalid = request("not-semver");
        assert!(validate_release_request(&invalid).is_err());
        invalid = request("1.8.0");
        invalid.manifest.artifact.sha256 = "bad".to_string();
        assert!(validate_release_request(&invalid).is_err());
    }
}
