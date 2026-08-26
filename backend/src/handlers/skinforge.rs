use std::collections::HashMap;
use std::time::Duration;

use axum::extract::{Path, Query, State};
use axum::http::header::CACHE_CONTROL;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::{Extension, Json};
use chrono::DateTime;
use semver::Version;

use crate::errors::AppError;
use crate::kdocs::{cookie_hint, KdocsSettings};
use crate::middleware::auth::Claims;
use crate::models::skinforge::{
    HashReleaseRow, KdocsSettingsView, ModListQuery, PublicHashArtifact, PublicHashArtifacts,
    PublicHashRelease, SaveKdocsSettingsRequest, SaveModRequest, SaveReleaseRequest,
    SkinforgeModListItem, SkinforgeModRow, SkinforgeRelease,
};
use crate::AppState;

const RELEASE_SCHEMA_VERSION: u32 = 1;
const RELEASE_PRODUCT: &str = "skinforge";
const RELEASE_PLATFORM: &str = "windows-x86_64";
const MOD_SCHEMA_VERSION: u32 = 1;
const MOD_PRODUCT: &str = "skinforge-mod";
const MOD_KDOCS_TIMEOUT: Duration = Duration::from_secs(30);
const MOD_THUMBNAIL_TIMEOUT: Duration = Duration::from_secs(5);
const MOD_LINK_ID_MAX_CHARS: usize = 128;
const MOD_FILE_NAME_MAX_CHARS: usize = 255;
const MOD_LINK_URL_MAX_BYTES: usize = 65_535;
const MOD_FILE_SIZE_MAX: u64 = 9_007_199_254_740_991;
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

pub async fn list_mods(
    State(state): State<AppState>,
    Query(params): Query<ModListQuery>,
) -> Result<Response, AppError> {
    mod_list_response(&state, params).await
}

pub async fn save_mod(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Json(payload): Json<SaveModRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    let validated = validate_mod_request(&payload)?;
    let settings = state
        .kdocs
        .load_settings(&state.db)
        .await
        .map_err(AppError::BadRequest)?;
    if validated.group_id != settings.group_id || validated.parent_id != settings.parent_id {
        return Err(AppError::BadRequest(
            "MOD 清单的云文档目录与当前服务端配置不一致".to_string(),
        ));
    }

    if mod_file_exists(
        &state.db,
        validated.file_id,
        payload.manifest.artifact.link_id.trim(),
    )
    .await?
    {
        return Err(AppError::Conflict("该 MOD 文件已导入".to_string()));
    }

    let download_url = tokio::time::timeout(
        MOD_KDOCS_TIMEOUT,
        state.kdocs.resolve_download_url(
            &state.db,
            validated.file_id,
            payload.manifest.artifact.link_id.trim(),
        ),
    )
    .await
    .map_err(|_| AppError::ServiceUnavailable("获取 MOD 临时下载地址超时".to_string()))?
    .map_err(AppError::BadRequest)?;
    tokio::time::timeout(
        MOD_KDOCS_TIMEOUT,
        state.kdocs.probe_download_url(&download_url),
    )
    .await
    .map_err(|_| AppError::ServiceUnavailable("探测 MOD 下载地址超时".to_string()))?
    .map_err(AppError::BadRequest)?;

    let user_id = current_user_id(&state, &claims.sub).await?;
    let result = sqlx::query(
        "INSERT INTO skinforge_mods (
            category, file_id, link_id, link_url, file_name, file_size,
            preview_file_id, created_by
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(validated.category)
    .bind(validated.file_id)
    .bind(payload.manifest.artifact.link_id.trim())
    .bind(payload.manifest.artifact.link_url.as_deref())
    .bind(payload.manifest.artifact.file_name.trim())
    .bind(payload.manifest.artifact.file_size)
    .bind(validated.preview_file_id)
    .bind(user_id)
    .execute(&state.db)
    .await
    .map_err(map_mod_insert_error)?;

    let item = fetch_mod(&state, result.last_insert_id()).await?;
    Ok(Json(serde_json::json!({ "success": true, "data": item })))
}

pub async fn delete_mod(
    State(state): State<AppState>,
    Path(id): Path<u64>,
) -> Result<Json<serde_json::Value>, AppError> {
    let result = sqlx::query("DELETE FROM skinforge_mods WHERE id = ?")
        .bind(id)
        .execute(&state.db)
        .await?;
    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("MOD 不存在".to_string()));
    }
    Ok(Json(serde_json::json!({
        "success": true,
        "data": { "deleted": true }
    })))
}

pub async fn public_mods(
    State(state): State<AppState>,
    Query(params): Query<ModListQuery>,
) -> Result<Response, AppError> {
    mod_list_response(&state, params).await
}

pub async fn mod_download_url(
    State(state): State<AppState>,
    Path(id): Path<u64>,
) -> Result<Response, AppError> {
    let row: Option<(u64, String)> =
        sqlx::query_as("SELECT file_id, link_id FROM skinforge_mods WHERE id = ?")
            .bind(id)
            .fetch_optional(&state.db)
            .await?;
    let (file_id, link_id) = row.ok_or_else(|| AppError::NotFound("MOD 不存在".to_string()))?;
    let url = tokio::time::timeout(
        MOD_KDOCS_TIMEOUT,
        state
            .kdocs
            .resolve_download_url(&state.db, file_id, &link_id),
    )
    .await
    .map_err(|_| AppError::ServiceUnavailable("获取 MOD 临时下载地址超时".to_string()))?
    .map_err(AppError::ServiceUnavailable)?;
    Ok(mod_download_response(url))
}

fn mod_download_response(url: String) -> Response {
    (
        [(CACHE_CONTROL, "no-store")],
        Json(serde_json::json!({
            "success": true,
            "data": { "url": url }
        })),
    )
        .into_response()
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
    let mut row = fetch_hash_release(&state).await?;
    if row.is_none()
        && state
            .hash_sync
            .recover_pending_release()
            .await
            .map_err(AppError::ServiceUnavailable)?
    {
        row = fetch_hash_release(&state).await?;
    }
    let row = row.ok_or_else(|| AppError::NotFound("尚无可用的 Hash 发布".to_string()))?;
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

async fn fetch_hash_release(state: &AppState) -> Result<Option<HashReleaseRow>, AppError> {
    Ok(sqlx::query_as::<_, HashReleaseRow>(
        "SELECT version, etag, canonical_size, canonical_sha256, source,
         txt_file_id, txt_link_id, txt_size, txt_sha256,
         gzip_file_id, gzip_link_id, gzip_size, gzip_sha256, published_at
         FROM skinforge_hash_releases WHERE id = 1",
    )
    .fetch_optional(&state.db)
    .await?)
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

async fn fetch_mod(state: &AppState, id: u64) -> Result<SkinforgeModListItem, AppError> {
    let row = sqlx::query_as::<_, SkinforgeModRow>(
        "SELECT id, category, file_name, file_size, preview_file_id, created_at
         FROM skinforge_mods WHERE id = ?",
    )
    .bind(id)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::NotFound("MOD 不存在".to_string()))?;
    Ok(row.into_list_item(None))
}

async fn mod_list_response(state: &AppState, params: ModListQuery) -> Result<Response, AppError> {
    let (page, page_size, offset) = mod_pagination(&params);
    let category = params
        .category
        .as_deref()
        .map(parse_mod_category)
        .transpose()?;

    let (total, rows) = query_mod_page(&state.db, category, page_size, offset).await?;
    let preview_urls = resolve_mod_preview_urls(state, &rows).await;
    let items = map_mod_list_items(rows, &preview_urls);
    Ok((
        [(CACHE_CONTROL, "no-store")],
        Json(serde_json::json!({
            "success": true,
            "data": {
                "items": items,
                "total": total,
                "page": page,
                "page_size": page_size
            }
        })),
    )
        .into_response())
}

async fn query_mod_page(
    pool: &sqlx::MySqlPool,
    category: Option<&str>,
    page_size: u32,
    offset: u64,
) -> Result<(i64, Vec<SkinforgeModRow>), sqlx::Error> {
    if let Some(category) = category {
        let (total,): (i64,) =
            sqlx::query_as("SELECT COUNT(*) FROM skinforge_mods WHERE category = ?")
                .bind(category)
                .fetch_one(pool)
                .await?;
        let rows = sqlx::query_as::<_, SkinforgeModRow>(
            "SELECT id, category, file_name, file_size, preview_file_id, created_at
             FROM skinforge_mods WHERE category = ?
             ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?",
        )
        .bind(category)
        .bind(page_size)
        .bind(offset)
        .fetch_all(pool)
        .await?;
        Ok((total, rows))
    } else {
        let (total,): (i64,) = sqlx::query_as("SELECT COUNT(*) FROM skinforge_mods")
            .fetch_one(pool)
            .await?;
        let rows = sqlx::query_as::<_, SkinforgeModRow>(
            "SELECT id, category, file_name, file_size, preview_file_id, created_at
             FROM skinforge_mods
             ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?",
        )
        .bind(page_size)
        .bind(offset)
        .fetch_all(pool)
        .await?;
        Ok((total, rows))
    }
}

async fn mod_file_exists(
    pool: &sqlx::MySqlPool,
    file_id: u64,
    link_id: &str,
) -> Result<bool, sqlx::Error> {
    let duplicate: Option<(u64,)> = sqlx::query_as(
        "SELECT file_id FROM skinforge_mods WHERE file_id = ? AND link_id = ? LIMIT 1",
    )
    .bind(file_id)
    .bind(link_id)
    .fetch_optional(pool)
    .await?;
    Ok(duplicate.is_some())
}

fn map_mod_list_items(
    rows: Vec<SkinforgeModRow>,
    preview_urls: &HashMap<u64, String>,
) -> Vec<SkinforgeModListItem> {
    rows.into_iter()
        .map(|row| {
            let preview_url = row
                .preview_file_id
                .and_then(|file_id| preview_urls.get(&file_id).cloned());
            row.into_list_item(preview_url)
        })
        .collect()
}

async fn resolve_mod_preview_urls(
    state: &AppState,
    rows: &[SkinforgeModRow],
) -> HashMap<u64, String> {
    let mut file_ids: Vec<u64> = rows.iter().filter_map(|row| row.preview_file_id).collect();
    file_ids.sort_unstable();
    file_ids.dedup();
    if file_ids.is_empty() {
        return HashMap::new();
    }
    match tokio::time::timeout(
        MOD_THUMBNAIL_TIMEOUT,
        state.kdocs.resolve_thumbnail_urls(&state.db, &file_ids),
    )
    .await
    {
        Ok(Ok(urls)) => urls,
        Ok(Err(_)) => {
            tracing::warn!("获取 MOD 预览图失败，已降级为无预览图");
            HashMap::new()
        }
        Err(_) => {
            tracing::warn!("获取 MOD 预览图超时");
            HashMap::new()
        }
    }
}

fn mod_pagination(params: &ModListQuery) -> (u32, u32, u64) {
    let page = params.page.unwrap_or(1).max(1);
    let page_size = params.page_size.unwrap_or(10).clamp(1, 50);
    let offset = u64::from(page - 1) * u64::from(page_size);
    (page, page_size, offset)
}

fn map_mod_insert_error(error: sqlx::Error) -> AppError {
    if error
        .as_database_error()
        .is_some_and(|database_error| database_error.is_unique_violation())
    {
        AppError::Conflict("该 MOD 文件已导入".to_string())
    } else {
        AppError::from(error)
    }
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

struct ValidatedMod {
    category: &'static str,
    file_id: u64,
    group_id: u64,
    parent_id: u64,
    preview_file_id: Option<u64>,
}

fn validate_mod_request(payload: &SaveModRequest) -> Result<ValidatedMod, AppError> {
    let manifest = &payload.manifest;
    if manifest.schema_version != MOD_SCHEMA_VERSION || manifest.product != MOD_PRODUCT {
        return Err(AppError::BadRequest(
            "MOD 清单 schema 或 product 不受支持".to_string(),
        ));
    }
    if manifest.artifact.link_id.trim().is_empty() {
        return Err(AppError::BadRequest("link_id 不能为空".to_string()));
    }
    if manifest.artifact.link_id.trim().chars().count() > MOD_LINK_ID_MAX_CHARS {
        return Err(AppError::BadRequest(format!(
            "link_id 不能超过 {MOD_LINK_ID_MAX_CHARS} 个字符"
        )));
    }
    if manifest.artifact.file_name.trim().is_empty() {
        return Err(AppError::BadRequest("文件名不能为空".to_string()));
    }
    if manifest.artifact.file_name.trim().chars().count() > MOD_FILE_NAME_MAX_CHARS {
        return Err(AppError::BadRequest(format!(
            "文件名不能超过 {MOD_FILE_NAME_MAX_CHARS} 个字符"
        )));
    }
    if manifest
        .artifact
        .link_url
        .as_deref()
        .is_some_and(|value| value.len() > MOD_LINK_URL_MAX_BYTES)
    {
        return Err(AppError::BadRequest(format!(
            "link_url 不能超过 {MOD_LINK_URL_MAX_BYTES} 字节"
        )));
    }
    if manifest.artifact.file_size == 0 {
        return Err(AppError::BadRequest("文件大小必须大于 0".to_string()));
    }
    if manifest.artifact.file_size > MOD_FILE_SIZE_MAX {
        return Err(AppError::BadRequest(
            "文件大小超出客户端安全整数范围".to_string(),
        ));
    }
    Ok(ValidatedMod {
        category: parse_mod_category(&manifest.category)?,
        file_id: parse_positive_id(&manifest.artifact.file_id, "file_id")?,
        group_id: parse_positive_id(&manifest.artifact.group_id, "group_id")?,
        parent_id: parse_positive_id(&manifest.artifact.parent_id, "parent_id")?,
        preview_file_id: manifest
            .artifact
            .preview_file_id
            .as_deref()
            .map(|value| parse_positive_id(value, "preview_file_id"))
            .transpose()?,
    })
}

fn parse_mod_category(value: &str) -> Result<&'static str, AppError> {
    match value.trim() {
        "map" => Ok("map"),
        "skin" => Ok("skin"),
        "accessory" => Ok("accessory"),
        _ => Err(AppError::BadRequest(
            "MOD 分类必须是 map、skin 或 accessory".to_string(),
        )),
    }
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
    use crate::models::skinforge::{
        ModManifest, ModManifestArtifact, ReleaseManifest, ReleaseManifestArtifact,
    };

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

    fn mod_request(category: &str) -> SaveModRequest {
        SaveModRequest {
            manifest: ModManifest {
                schema_version: 1,
                product: "skinforge-mod".to_string(),
                category: category.to_string(),
                artifact: ModManifestArtifact {
                    file_id: "540667517933".to_string(),
                    link_id: "link".to_string(),
                    link_url: None,
                    file_name: "example.mod".to_string(),
                    file_size: 100,
                    group_id: "2144952871".to_string(),
                    parent_id: "541664465686".to_string(),
                    preview_file_id: None,
                },
            },
        }
    }

    #[test]
    fn validates_supported_mod_categories() {
        for category in ["map", "skin", "accessory"] {
            assert_eq!(
                validate_mod_request(&mod_request(category))
                    .unwrap()
                    .category,
                category
            );
        }
        let mut request = mod_request("map");
        request.manifest.artifact.preview_file_id = Some("123".to_string());
        assert_eq!(
            validate_mod_request(&request).unwrap().preview_file_id,
            Some(123)
        );
    }

    #[test]
    fn rejects_invalid_mod_manifest_fields() {
        let mut invalid = mod_request("other");
        assert!(validate_mod_request(&invalid).is_err());
        invalid = mod_request("map");
        invalid.manifest.product = "other".to_string();
        assert!(validate_mod_request(&invalid).is_err());
        invalid = mod_request("map");
        invalid.manifest.artifact.file_size = 0;
        assert!(validate_mod_request(&invalid).is_err());
        invalid = mod_request("map");
        invalid.manifest.artifact.file_size = MOD_FILE_SIZE_MAX + 1;
        assert!(validate_mod_request(&invalid).is_err());
        invalid = mod_request("map");
        invalid.manifest.artifact.preview_file_id = Some("0".to_string());
        assert!(validate_mod_request(&invalid).is_err());

        invalid = mod_request("map");
        invalid.manifest.artifact.link_id = "x".repeat(MOD_LINK_ID_MAX_CHARS + 1);
        assert!(validate_mod_request(&invalid).is_err());

        invalid = mod_request("map");
        invalid.manifest.artifact.file_name = "图".repeat(MOD_FILE_NAME_MAX_CHARS + 1);
        assert!(validate_mod_request(&invalid).is_err());

        invalid = mod_request("map");
        invalid.manifest.artifact.link_url = Some("x".repeat(MOD_LINK_URL_MAX_BYTES + 1));
        assert!(validate_mod_request(&invalid).is_err());
    }

    #[test]
    fn mod_pagination_is_bounded() {
        assert_eq!(
            mod_pagination(&ModListQuery {
                page: None,
                page_size: None,
                category: None,
            }),
            (1, 10, 0)
        );
        assert_eq!(
            mod_pagination(&ModListQuery {
                page: Some(0),
                page_size: Some(0),
                category: None,
            }),
            (1, 1, 0)
        );
        assert_eq!(
            mod_pagination(&ModListQuery {
                page: Some(3),
                page_size: Some(500),
                category: None,
            }),
            (3, 50, 100)
        );
    }

    #[test]
    fn public_mod_item_exposes_only_public_metadata() {
        let item = SkinforgeModListItem {
            id: 7,
            category: "map".to_string(),
            file_name: "example.zip".to_string(),
            file_size: 123,
            preview_url: None,
            created_at: chrono::NaiveDate::from_ymd_opt(2026, 8, 26)
                .unwrap()
                .and_hms_opt(10, 0, 0)
                .unwrap(),
        };
        let value = serde_json::to_value(item).unwrap();
        assert_eq!(value["id"], 7);
        assert_eq!(value["fileName"], "example.zip");
        assert!(value.get("fileId").is_none());
        assert!(value.get("linkId").is_none());
        assert!(value.get("sha1").is_none());
        assert!(value.get("sha256").is_none());
        assert!(value.get("url").is_none());
        assert!(value.get("previewFileId").is_none());
        assert!(value.get("previewUrl").unwrap().is_null());
    }

    #[test]
    fn maps_available_previews_and_degrades_missing_ones() {
        let created_at = chrono::NaiveDate::from_ymd_opt(2026, 8, 26)
            .unwrap()
            .and_hms_opt(10, 0, 0)
            .unwrap();
        let rows = vec![
            SkinforgeModRow {
                id: 1,
                category: "map".to_string(),
                file_name: "with-preview.zip".to_string(),
                file_size: 1,
                preview_file_id: Some(101),
                created_at,
            },
            SkinforgeModRow {
                id: 2,
                category: "skin".to_string(),
                file_name: "failed-preview.zip".to_string(),
                file_size: 2,
                preview_file_id: Some(102),
                created_at,
            },
        ];
        let previews = HashMap::from([(101, "https://thumbnail.example/101".to_string())]);
        let items = map_mod_list_items(rows, &previews);
        assert_eq!(
            items[0].preview_url.as_deref(),
            Some("https://thumbnail.example/101")
        );
        assert!(items[1].preview_url.is_none());
    }

    #[test]
    fn mod_download_url_response_is_not_cacheable() {
        let response = mod_download_response("https://oss.example/mod".to_string());
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(response.headers().get(CACHE_CONTROL).unwrap(), "no-store");
    }

    #[tokio::test]
    #[ignore = "requires local MySQL 8 via MOD_MYSQL_TEST_DATABASE_URL"]
    async fn mysql_mod_queries_decode_real_mysql_types() {
        let database_url = std::env::var("MOD_MYSQL_TEST_DATABASE_URL")
            .expect("MOD_MYSQL_TEST_DATABASE_URL must be set for this ignored integration test");
        let options = database_url
            .parse::<sqlx::mysql::MySqlConnectOptions>()
            .expect("MOD_MYSQL_TEST_DATABASE_URL must be a valid MySQL URL");
        assert!(
            matches!(options.get_host(), "127.0.0.1" | "localhost" | "::1"),
            "MOD_MYSQL_TEST_DATABASE_URL must target localhost"
        );
        assert!(
            options
                .get_database()
                .is_some_and(|name| name.contains("test") || name.contains("audit")),
            "MOD_MYSQL_TEST_DATABASE_URL database name must contain 'test' or 'audit'"
        );

        let pool = crate::db::create_pool(&database_url).await;
        let unique = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let file_id = u64::try_from(unique % 8_000_000_000_000_000_000).unwrap() + 1;
        let link_id = format!("mod-audit-{unique}");
        let file_name = format!("mod-audit-{unique}.zip");

        let (before_all, _) = query_mod_page(&pool, None, 50, 0).await.unwrap();
        let (before_maps, _) = query_mod_page(&pool, Some("map"), 50, 0).await.unwrap();

        sqlx::query(
            "INSERT INTO skinforge_mods (
                category, file_id, link_id, file_name, file_size, created_by
             ) VALUES ('map', ?, ?, ?, 123, 1)",
        )
        .bind(file_id)
        .bind(&link_id)
        .bind(&file_name)
        .execute(&pool)
        .await
        .unwrap();

        assert!(mod_file_exists(&pool, file_id, &link_id).await.unwrap());
        let (after_all, all_rows) = query_mod_page(&pool, None, 50, 0).await.unwrap();
        let (after_maps, map_rows) = query_mod_page(&pool, Some("map"), 50, 0).await.unwrap();
        assert_eq!(after_all, before_all + 1);
        assert_eq!(after_maps, before_maps + 1);
        assert!(all_rows.iter().any(|row| row.file_name == file_name));
        assert!(map_rows.iter().any(|row| row.file_name == file_name));

        let duplicate = sqlx::query(
            "INSERT INTO skinforge_mods (
                category, file_id, link_id, file_name, file_size, created_by
             ) VALUES ('skin', ?, ?, 'duplicate.zip', 1, 1)",
        )
        .bind(file_id)
        .bind(&link_id)
        .execute(&pool)
        .await
        .unwrap_err();
        assert!(duplicate
            .as_database_error()
            .is_some_and(|error| error.is_unique_violation()));

        sqlx::query("DELETE FROM skinforge_mods WHERE file_id = ? AND link_id = ?")
            .bind(file_id)
            .bind(&link_id)
            .execute(&pool)
            .await
            .unwrap();
        assert!(!mod_file_exists(&pool, file_id, &link_id).await.unwrap());
    }
}
