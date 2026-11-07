use std::time::Duration;

use axum::{
    extract::State,
    http::header::CACHE_CONTROL,
    response::{IntoResponse, Response},
    Extension, Json,
};
use base64::{engine::general_purpose::STANDARD, Engine};
use semver::Version;

use crate::{
    errors::AppError,
    middleware::auth::Claims,
    models::ltk_manager::{ManagerReleaseRow, PublicManagerRelease, SaveManagerRequest},
    AppState,
};

const MAX_SIZE: u64 = 512 * 1024 * 1024;
const SELECT_RELEASE: &str = "SELECT version, file_name, file_size, sha256, signature, file_id, link_id, updated_at FROM skinforge_ltk_manager WHERE id = 1";

pub async fn get(State(state): State<AppState>) -> Result<Json<serde_json::Value>, AppError> {
    let release = fetch(&state).await?;
    let data = release.map(|r| {
        serde_json::json!({
            "version": r.version, "platform": "windows-x86_64", "fileName": r.file_name,
            "fileSize": r.file_size, "sha256": r.sha256, "fileId": r.file_id.to_string(),
            "linkId": r.link_id, "updatedAt": r.updated_at,
        })
    });
    Ok(Json(serde_json::json!({ "success": true, "data": data })))
}

pub async fn save(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Json(payload): Json<SaveManagerRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    let (file_id, group_id, parent_id) = validate(&payload)?;
    let settings = state
        .kdocs
        .load_settings(&state.db)
        .await
        .map_err(|_| AppError::BadRequest("请先配置有效的云文档凭证".into()))?;
    if group_id != settings.group_id || parent_id != settings.parent_id {
        return Err(AppError::BadRequest(
            "运行环境清单的目录与服务端配置不一致".into(),
        ));
    }
    let m = payload.manifest;
    let url = resolve(&state, file_id, &m.artifact.link_id).await?;
    tokio::time::timeout(
        Duration::from_secs(30),
        state.kdocs.probe_download_url(&url),
    )
    .await
    .map_err(|_| AppError::ServiceUnavailable("运行环境下载节点探测超时".into()))?
    .map_err(|_| AppError::ServiceUnavailable("运行环境下载节点暂不可用".into()))?;
    let (user_id,): (i64,) = sqlx::query_as("SELECT id FROM users WHERE username = ?")
        .bind(&claims.sub)
        .fetch_one(&state.db)
        .await?;
    upsert(&state.db, &m, file_id, user_id).await?;
    get(State(state)).await
}

async fn upsert(
    pool: &sqlx::MySqlPool,
    m: &crate::models::ltk_manager::ManagerManifest,
    file_id: u64,
    user_id: i64,
) -> Result<(), AppError> {
    // A compatibility pin is replaceable (including rollback), independent of
    // SkinForge's strictly increasing software-updater release singleton.
    sqlx::query("INSERT INTO skinforge_ltk_manager (id, version, file_name, file_size, sha256, signature, file_id, link_id, updated_by, updated_at)
        VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, NOW()) ON DUPLICATE KEY UPDATE
        version = VALUES(version), file_name = VALUES(file_name), file_size = VALUES(file_size),
        sha256 = VALUES(sha256), signature = VALUES(signature), file_id = VALUES(file_id),
        link_id = VALUES(link_id), updated_by = VALUES(updated_by), updated_at = NOW()")
        .bind(&m.version).bind(&m.artifact.file_name).bind(m.artifact.file_size)
        .bind(m.artifact.sha256.to_ascii_lowercase()).bind(m.signature.trim()).bind(file_id)
        .bind(&m.artifact.link_id).bind(user_id).execute(pool).await?;
    Ok(())
}

pub async fn public(State(state): State<AppState>) -> Result<Response, AppError> {
    let r = fetch(&state)
        .await?
        .ok_or_else(|| AppError::NotFound("尚未发布外服运行环境".into()))?;
    let url = resolve(&state, r.file_id, &r.link_id).await?;
    Ok(public_response(r, url))
}

fn public_response(r: ManagerReleaseRow, url: String) -> Response {
    let data = public_data(r, url);
    (
        [(CACHE_CONTROL, "no-store")],
        Json(serde_json::json!({ "success": true, "data": data })),
    )
        .into_response()
}

async fn fetch(state: &AppState) -> Result<Option<ManagerReleaseRow>, AppError> {
    Ok(sqlx::query_as::<_, ManagerReleaseRow>(SELECT_RELEASE)
        .fetch_optional(&state.db)
        .await?)
}

async fn resolve(state: &AppState, file_id: u64, link_id: &str) -> Result<String, AppError> {
    let url = tokio::time::timeout(
        Duration::from_secs(30),
        state
            .kdocs
            .resolve_download_url(&state.db, file_id, link_id),
    )
    .await
    .map_err(|_| AppError::ServiceUnavailable("获取运行环境下载地址超时".into()))?
    .map_err(|_| AppError::ServiceUnavailable("获取运行环境下载地址失败，请稍后重试".into()))?;
    let parsed = reqwest::Url::parse(&url)
        .map_err(|_| AppError::ServiceUnavailable("下载节点地址无效".into()))?;
    if parsed.scheme() != "https"
        || parsed.host_str().is_none()
        || !parsed.username().is_empty()
        || parsed.password().is_some()
        || parsed.fragment().is_some()
    {
        return Err(AppError::ServiceUnavailable("下载节点地址无效".into()));
    }
    Ok(url)
}

fn public_data(r: ManagerReleaseRow, url: String) -> PublicManagerRelease {
    PublicManagerRelease {
        version: r.version,
        platform: "windows-x86_64",
        file_name: r.file_name,
        file_size: r.file_size,
        sha256: r.sha256,
        signature: r.signature,
        url,
    }
}

fn positive(s: &str) -> Result<u64, AppError> {
    if s.is_empty() || !s.bytes().all(|b| b.is_ascii_digit()) || s.starts_with('0') {
        return Err(AppError::BadRequest("云文档标识必须是正整数".into()));
    }
    s.parse::<u64>()
        .ok()
        .filter(|n| *n > 0)
        .ok_or_else(|| AppError::BadRequest("云文档标识必须是正整数".into()))
}

fn validate(p: &SaveManagerRequest) -> Result<(u64, u64, u64), AppError> {
    let m = &p.manifest;
    let a = &m.artifact;
    let version = Version::parse(&m.version)
        .map_err(|_| AppError::BadRequest("运行环境版本格式无效".into()))?;
    if m.schema_version != 1
        || m.product != "ltk-manager"
        || m.platform != "windows-x86_64"
        || m.version.len() > 64
        || !version.pre.is_empty()
        || !version.build.is_empty()
        || version.major > u32::MAX as u64
        || version.minor > u32::MAX as u64
        || version.patch > u32::MAX as u64
        || a.file_name != format!("LTK.Manager_{}_x64-setup.exe", m.version)
        || a.file_name.chars().count() > 255
        || a.file_size == 0
        || a.file_size > MAX_SIZE
        || a.link_id.trim().is_empty()
        || a.link_id.trim() != a.link_id
        || a.link_id.chars().count() > 128
        || a.sha256.len() != 64
        || !a.sha256.bytes().all(|c| c.is_ascii_hexdigit())
        || !valid_signature(&m.signature, &a.file_name)
    {
        return Err(AppError::BadRequest(
            "运行环境清单无效，请使用专用上传脚本生成".into(),
        ));
    }
    Ok((
        positive(&a.file_id)?,
        positive(&a.group_id)?,
        positive(&a.parent_id)?,
    ))
}

fn valid_signature(value: &str, file_name: &str) -> bool {
    if value.is_empty() || value.len() > 4096 {
        return false;
    }
    let Ok(bytes) = STANDARD.decode(value.trim()) else {
        return false;
    };
    let Ok(text) = std::str::from_utf8(&bytes) else {
        return false;
    };
    let lines: Vec<_> = text.lines().collect();
    lines.len() == 4
        && lines[0].starts_with("untrusted comment:")
        && lines[2].starts_with("trusted comment: ")
        && lines[2][17..].split('\t').any(|field| {
            field == format!("file:{file_name}")
                || file_name
                    .strip_prefix("LTK.Manager_")
                    .is_some_and(|suffix| field == format!("file:LTK Manager_{suffix}"))
        })
        && STANDARD
            .decode(lines[1])
            .is_ok_and(|b| b.len() == 74 && b.starts_with(b"ED"))
        && STANDARD.decode(lines[3]).is_ok_and(|b| b.len() == 64)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn request() -> SaveManagerRequest {
        let signature = STANDARD.encode(format!(
            "untrusted comment: timestamp:1\tfile:LTK.Manager_1.33.0_x64-setup.exe\n{}\ntrusted comment: timestamp:1\tfile:LTK.Manager_1.33.0_x64-setup.exe\n{}",
            STANDARD.encode([b"ED".as_slice(), &[0; 72]].concat()),
            STANDARD.encode([0; 64])
        ));
        serde_json::from_value(serde_json::json!({"manifest": { "schemaVersion":1, "product":"ltk-manager", "platform":"windows-x86_64", "version":"1.33.0", "signature":signature,
            "artifact": {"fileId":"1", "linkId":"link", "groupId":"2", "parentId":"3", "fileName":"LTK.Manager_1.33.0_x64-setup.exe", "fileSize":123, "sha256":"a".repeat(64)}}})).unwrap()
    }
    #[test]
    fn validates_contract_and_storage_limits() {
        assert!(validate(&request()).is_ok());
        let mut original_name = request();
        let sig =
            String::from_utf8(STANDARD.decode(&original_name.manifest.signature).unwrap()).unwrap();
        original_name.manifest.signature =
            STANDARD.encode(sig.replace("file:LTK.Manager_", "file:LTK Manager_"));
        assert!(validate(&original_name).is_ok());
        original_name.manifest.signature = STANDARD.encode(sig.replace("1.33.0_x64", "1.32.0_x64"));
        assert!(validate(&original_name).is_err());
        for size in [0, MAX_SIZE + 1] {
            let mut p = request();
            p.manifest.artifact.file_size = size;
            assert!(validate(&p).is_err());
        }
        let mut p = request();
        p.manifest.artifact.file_id = "18446744073709551616".into();
        assert!(validate(&p).is_err());
        let mut p = request();
        p.manifest.artifact.link_id = "x".repeat(129);
        assert!(validate(&p).is_err());
        let mut p = request();
        p.manifest.artifact.sha256 = "z".repeat(64);
        assert!(validate(&p).is_err());
        let mut p = request();
        p.manifest.signature = "bad".into();
        assert!(validate(&p).is_err());
        let mut p = request();
        p.manifest.artifact.file_name = "../cmd.exe".into();
        assert!(validate(&p).is_err());
        let mut p = request();
        p.manifest.platform = "linux-x86_64".into();
        assert!(validate(&p).is_err());
    }
    #[test]
    fn public_response_excludes_private_cloud_ids() {
        let r = ManagerReleaseRow {
            version: "1.33.0".into(),
            file_name: "setup.exe".into(),
            file_size: 3,
            sha256: "a".repeat(64),
            signature: "s".into(),
            file_id: 99,
            link_id: "private".into(),
            updated_at: chrono::Utc::now().naive_utc(),
        };
        let value =
            serde_json::to_value(public_data(r, "https://example.com/file".into())).unwrap();
        for key in ["fileId", "linkId", "cookie", "updatedBy", "updatedAt"] {
            assert!(value.get(key).is_none());
        }
        assert_eq!(value["platform"], "windows-x86_64");
    }
    #[test]
    fn public_metadata_is_never_cacheable() {
        let r = ManagerReleaseRow {
            version: "1.33.0".into(),
            file_name: "LTK.Manager_1.33.0_x64-setup.exe".into(),
            file_size: 3,
            sha256: "a".repeat(64),
            signature: "s".into(),
            file_id: 1,
            link_id: "link".into(),
            updated_at: chrono::Utc::now().naive_utc(),
        };
        let response = public_response(r, "https://example.com/file".into());
        assert_eq!(response.headers()[CACHE_CONTROL], "no-store");
    }

    #[tokio::test]
    #[ignore = "requires isolated localhost MySQL 8 via MANAGER_MYSQL_TEST_DATABASE_URL"]
    async fn mysql_manager_schema_queries_and_http_errors() {
        use sqlx::mysql::MySqlPoolOptions;
        use std::sync::Arc;
        let url = std::env::var("MANAGER_MYSQL_TEST_DATABASE_URL")
            .expect("explicit local test database required");
        let parsed = reqwest::Url::parse(&url).unwrap();
        assert!(matches!(parsed.host_str(), Some("127.0.0.1" | "localhost")));
        // Temporary table shadows any persistent table, bound to one connection.
        let pool = MySqlPoolOptions::new()
            .max_connections(1)
            .connect(&url)
            .await
            .unwrap();
        let sql = include_str!("../../migrations/012_create_skinforge_ltk_manager.sql")
            .replace("CREATE TABLE IF NOT EXISTS", "CREATE TEMPORARY TABLE");
        sqlx::query(&sql).execute(&pool).await.unwrap();
        assert!(sqlx::query_as::<_, ManagerReleaseRow>(SELECT_RELEASE)
            .fetch_optional(&pool)
            .await
            .unwrap()
            .is_none());
        // Always shadow credentials too: this regression must never contact Kdocs,
        // even if the developer chose a local DB containing delivery settings.
        sqlx::query("CREATE TEMPORARY TABLE skinforge_kdocs_settings (id TINYINT UNSIGNED PRIMARY KEY, cookie_ciphertext MEDIUMTEXT NOT NULL, cookie_nonce VARCHAR(64) NOT NULL, group_id BIGINT UNSIGNED NOT NULL, parent_id BIGINT UNSIGNED NOT NULL)")
            .execute(&pool).await.unwrap();
        let kdocs = crate::kdocs::KdocsService::new("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=")
            .unwrap();
        let state = AppState {
            db: pool.clone(),
            jwt_secret: "local-fixture".into(),
            cdk_connections: Arc::new(crate::cdk_events::CdkConnectionRegistry::new()),
            hash_sync: crate::hash_sync::HashSyncController::new(
                crate::config::HashSyncConfig {
                    enabled: false,
                    source_url: "https://example.com/unused".into(),
                    mirror_dir: std::env::temp_dir().join("manager-test-unused"),
                    interval_hours: 24,
                },
                pool.clone(),
                kdocs.clone(),
            ),
            kdocs,
        };
        assert!(matches!(
            public(State(state.clone())).await,
            Err(AppError::NotFound(_))
        ));
        let mut p = request();
        upsert(&pool, &p.manifest, u64::MAX, 1).await.unwrap();
        let row = fetch(&state).await.unwrap().unwrap();
        assert_eq!(row.file_id, u64::MAX);
        assert_eq!(row.file_size, 123);
        assert_eq!(
            get(State(state.clone())).await.unwrap().0["data"]["fileId"],
            u64::MAX.to_string()
        );
        // Explicit compatibility rollback updates the same singleton.
        p.manifest.version = "1.32.0".into();
        p.manifest.artifact.file_name = "LTK.Manager_1.32.0_x64-setup.exe".into();
        upsert(&pool, &p.manifest, 2, 1).await.unwrap();
        assert_eq!(fetch(&state).await.unwrap().unwrap().version, "1.32.0");
        // No Kdocs credentials in this isolated fixture: resolution is a clean 503,
        // not an outbound request, and the underlying secret/query is not exposed.
        let error = public(State(state.clone())).await.unwrap_err();
        assert!(matches!(error, AppError::ServiceUnavailable(_)));
        let error_response = error.into_response();
        assert_eq!(
            error_response.status(),
            axum::http::StatusCode::SERVICE_UNAVAILABLE
        );
        sqlx::query("DROP TEMPORARY TABLE skinforge_kdocs_settings")
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("DROP TEMPORARY TABLE skinforge_ltk_manager")
            .execute(&pool)
            .await
            .unwrap();
    }
}
