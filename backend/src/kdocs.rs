use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;

use aes_gcm::aead::{Aead, KeyInit, Payload};
use aes_gcm::{Aes256Gcm, Nonce};
use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use rand::RngCore;
use reqwest::header::{HeaderMap, HeaderValue, CONTENT_LENGTH, CONTENT_TYPE, COOKIE, ETAG, RANGE};
use serde::de::DeserializeOwned;
use serde::Deserialize;
use serde_json::json;
use sha1::{Digest as Sha1Digest, Sha1};
use sha2::Sha256;
use sqlx::{FromRow, MySqlPool};
use tokio::sync::Mutex;
use tokio_util::io::ReaderStream;

use crate::models::skinforge::UploadedArtifact;

const API_BASE: &str = "https://365.kdocs.cn";
const AAD: &[u8] = b"cdk-server:kdocs-settings:v1";
const REQUEST_TIMEOUT: Duration = Duration::from_secs(30 * 60);
const CACHE_REFRESH_WINDOW_SECS: i64 = 5 * 60;

#[derive(Clone)]
pub struct KdocsService {
    key: [u8; 32],
    cache: Arc<Mutex<HashMap<(u64, String), CachedUrl>>>,
}

#[derive(Debug, Clone)]
pub struct KdocsSettings {
    pub cookie: String,
    pub group_id: u64,
    pub parent_id: u64,
}

#[derive(Debug, Clone)]
struct CachedUrl {
    url: String,
    expires_at: Option<i64>,
}

#[derive(Debug, FromRow)]
struct SettingsRow {
    cookie_ciphertext: String,
    cookie_nonce: String,
    group_id: u64,
    parent_id: u64,
}

#[derive(Debug, Deserialize)]
struct CreateUploadResponse {
    url: String,
    store: String,
}

#[derive(Debug, Deserialize)]
struct CreateFileResponse {
    #[serde(rename = "id")]
    file_id: u64,
    link_id: String,
    link_url: Option<String>,
}

#[derive(Debug, Deserialize)]
struct DownloadResponse {
    download_url: Option<String>,
    url: Option<String>,
}

#[derive(Debug)]
struct FileDigest {
    size: u64,
    sha1: String,
    sha256: String,
}

impl KdocsService {
    pub fn new(encoded_key: &str) -> Result<Self, String> {
        let bytes = BASE64
            .decode(encoded_key.trim())
            .map_err(|_| "KDOCS_CREDENTIAL_KEY 必须是有效 Base64".to_string())?;
        let key: [u8; 32] = bytes
            .try_into()
            .map_err(|_| "KDOCS_CREDENTIAL_KEY 解码后必须正好为 32 字节".to_string())?;
        Ok(Self {
            key,
            cache: Arc::new(Mutex::new(HashMap::new())),
        })
    }

    #[cfg(test)]
    fn from_key(key: [u8; 32]) -> Self {
        Self {
            key,
            cache: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub fn encrypt_cookie(&self, cookie: &str) -> Result<(String, String), String> {
        let cipher = Aes256Gcm::new_from_slice(&self.key)
            .map_err(|_| "初始化 Cookie 加密器失败".to_string())?;
        let mut nonce_bytes = [0u8; 12];
        rand::rngs::OsRng.fill_bytes(&mut nonce_bytes);
        let ciphertext = cipher
            .encrypt(
                Nonce::from_slice(&nonce_bytes),
                Payload {
                    msg: cookie.as_bytes(),
                    aad: AAD,
                },
            )
            .map_err(|_| "加密云文档 Cookie 失败".to_string())?;
        Ok((BASE64.encode(ciphertext), BASE64.encode(nonce_bytes)))
    }

    pub fn decrypt_cookie(&self, ciphertext: &str, nonce: &str) -> Result<String, String> {
        let ciphertext = BASE64
            .decode(ciphertext)
            .map_err(|_| "数据库中的 Cookie 密文格式无效".to_string())?;
        let nonce = BASE64
            .decode(nonce)
            .map_err(|_| "数据库中的 Cookie nonce 格式无效".to_string())?;
        if nonce.len() != 12 {
            return Err("数据库中的 Cookie nonce 长度无效".to_string());
        }
        let cipher = Aes256Gcm::new_from_slice(&self.key)
            .map_err(|_| "初始化 Cookie 解密器失败".to_string())?;
        let plaintext = cipher
            .decrypt(
                Nonce::from_slice(&nonce),
                Payload {
                    msg: &ciphertext,
                    aad: AAD,
                },
            )
            .map_err(|_| "无法使用当前主密钥解密云文档 Cookie".to_string())?;
        String::from_utf8(plaintext).map_err(|_| "解密后的云文档 Cookie 不是 UTF-8".to_string())
    }

    pub async fn load_settings(&self, pool: &MySqlPool) -> Result<KdocsSettings, String> {
        let row = sqlx::query_as::<_, SettingsRow>(
            "SELECT cookie_ciphertext, cookie_nonce, group_id, parent_id \
             FROM skinforge_kdocs_settings WHERE id = 1",
        )
        .fetch_optional(pool)
        .await
        .map_err(|error| format!("读取云文档配置失败: {error}"))?
        .ok_or_else(|| "尚未配置云文档凭证".to_string())?;

        Ok(KdocsSettings {
            cookie: self.decrypt_cookie(&row.cookie_ciphertext, &row.cookie_nonce)?,
            group_id: row.group_id,
            parent_id: row.parent_id,
        })
    }

    pub async fn validate_settings(&self, settings: &KdocsSettings) -> Result<(), String> {
        csrf_from_cookie(&settings.cookie)?;
        let client = build_api_client(&settings.cookie)?;
        let response = client
            .get(format!(
                "{API_BASE}/3rd/drive/api/v5/files/upload/pre_check"
            ))
            .query(&[
                ("file_name", "skinforge-config-check.bin"),
                ("group_id", &settings.group_id.to_string()),
                ("parent_id", &settings.parent_id.to_string()),
            ])
            .send()
            .await
            .map_err(|error| format!("验证云文档配置失败: {error}"))?;
        if !response.status().is_success() {
            return Err(format!(
                "云文档凭证或目录不可用: HTTP {}",
                response.status()
            ));
        }
        Ok(())
    }

    pub async fn upload_file(
        &self,
        pool: &MySqlPool,
        path: &Path,
        file_name: &str,
    ) -> Result<UploadedArtifact, String> {
        let settings = self.load_settings(pool).await?;
        let path_for_digest = path.to_path_buf();
        let digest = tokio::task::spawn_blocking(move || digest_file(&path_for_digest))
            .await
            .map_err(|error| format!("计算上传文件摘要的后台任务失败: {error}"))??;
        let csrf = csrf_from_cookie(&settings.cookie)?;
        let api_client = build_api_client(&settings.cookie)?;
        let upload_client = build_upload_client()?;
        let upload = create_upload(&api_client, &csrf, &settings, file_name, &digest).await?;
        let (save_key, etag) =
            upload_object(&upload_client, &upload.url, path.to_path_buf(), digest.size).await?;
        let created = create_file(
            &api_client,
            &csrf,
            &settings,
            &upload.store,
            &save_key,
            &etag,
            file_name,
            &digest,
        )
        .await?;

        Ok(UploadedArtifact {
            file_id: created.file_id,
            link_id: created.link_id,
            link_url: created.link_url,
            file_name: file_name.to_string(),
            file_size: digest.size,
            sha1: digest.sha1,
            sha256: digest.sha256,
        })
    }

    pub async fn resolve_download_url(
        &self,
        pool: &MySqlPool,
        file_id: u64,
        link_id: &str,
    ) -> Result<String, String> {
        let key = (file_id, link_id.to_string());
        if let Some(cached) = self.cached_url(&key).await {
            return Ok(cached);
        }

        let settings = self.load_settings(pool).await?;
        let client = build_api_client(&settings.cookie)?;
        let response = client
            .get(format!("{API_BASE}/api/v3/office/file/{file_id}/download"))
            .query(&[
                ("support_checksums", "md5,sha1,sha224,sha256,sha384,sha512"),
                ("get_direct_external_download_url", "true"),
                ("cid", link_id),
            ])
            .send()
            .await
            .map_err(|error| format!("获取 OSS 下载地址失败: {error}"))?;
        let body: DownloadResponse = parse_json_response(response, "获取 OSS 下载地址").await?;
        let url = body
            .download_url
            .or(body.url)
            .ok_or_else(|| "云文档响应中没有下载地址".to_string())?;
        let expires_at = parse_expires(&url);
        self.cache.lock().await.insert(
            key,
            CachedUrl {
                url: url.clone(),
                expires_at,
            },
        );
        Ok(url)
    }

    pub async fn probe_download_url(&self, url: &str) -> Result<(), String> {
        let client = build_upload_client()?;
        let head = client
            .head(url)
            .send()
            .await
            .map_err(|error| format!("探测 OSS 下载地址失败: {error}"))?;
        if head.status().is_success() {
            return Ok(());
        }

        let range = client
            .get(url)
            .header(RANGE, "bytes=0-0")
            .send()
            .await
            .map_err(|error| format!("探测 OSS 下载地址失败: {error}"))?;
        if range.status().is_success() || range.status() == reqwest::StatusCode::PARTIAL_CONTENT {
            Ok(())
        } else {
            Err(format!("OSS 下载地址不可用: HTTP {}", range.status()))
        }
    }

    pub async fn clear_cache(&self) {
        self.cache.lock().await.clear();
    }

    async fn cached_url(&self, key: &(u64, String)) -> Option<String> {
        let now = chrono::Utc::now().timestamp();
        let cache = self.cache.lock().await;
        let cached = cache.get(key)?;
        match cached.expires_at {
            Some(expires_at) if now + CACHE_REFRESH_WINDOW_SECS >= expires_at => None,
            _ => Some(cached.url.clone()),
        }
    }
}

pub fn csrf_from_cookie(cookie: &str) -> Result<String, String> {
    cookie
        .split(';')
        .filter_map(|part| part.trim().split_once('='))
        .find_map(|(name, value)| {
            let value = value.trim();
            (name.trim() == "csrf" && !value.is_empty()).then(|| value.to_string())
        })
        .ok_or_else(|| "云文档 Cookie 中缺少非空 csrf".to_string())
}

pub fn cookie_hint(cookie: &str) -> String {
    let sid = cookie
        .split(';')
        .filter_map(|part| part.trim().split_once('='))
        .find_map(|(name, value)| (name.trim() == "wps_sid").then_some(value.trim()))
        .unwrap_or("");
    let suffix: String = sid
        .chars()
        .rev()
        .take(4)
        .collect::<String>()
        .chars()
        .rev()
        .collect();
    if suffix.is_empty() {
        "已配置（无 wps_sid 摘要）".to_string()
    } else {
        format!("wps_sid=****{suffix}")
    }
}

fn build_api_client(cookie: &str) -> Result<reqwest::Client, String> {
    let mut headers = HeaderMap::new();
    let mut cookie_header =
        HeaderValue::from_str(cookie).map_err(|_| "云文档 Cookie 格式无效".to_string())?;
    cookie_header.set_sensitive(true);
    headers.insert(COOKIE, cookie_header);
    reqwest::Client::builder()
        .timeout(REQUEST_TIMEOUT)
        .default_headers(headers)
        .build()
        .map_err(|error| format!("创建云文档 HTTP 客户端失败: {error}"))
}

fn build_upload_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(REQUEST_TIMEOUT)
        .build()
        .map_err(|error| format!("创建对象存储 HTTP 客户端失败: {error}"))
}

async fn create_upload(
    client: &reqwest::Client,
    csrf: &str,
    settings: &KdocsSettings,
    file_name: &str,
    digest: &FileDigest,
) -> Result<CreateUploadResponse, String> {
    let content_type = content_type_for(file_name);
    let response = client
        .put(format!(
            "{API_BASE}/3rd/drive/api/v5/files/upload/create_update"
        ))
        .json(&json!({
            "groupid": settings.group_id,
            "parentid": settings.parent_id,
            "parent_path": [],
            "size": digest.size,
            "name": file_name,
            "req_by_internal": false,
            "client_stores": "ks3",
            "contenttype": content_type,
            "startswithfilename": file_name,
            "successactionstatus": 201,
            "group_id": settings.group_id,
            "parent_id": settings.parent_id,
            "file_id": 0,
            "with_rapid": true,
            "tried_store": ["ks3"],
            "sha256": digest.sha256,
            "csrfmiddlewaretoken": csrf,
        }))
        .send()
        .await
        .map_err(|error| format!("创建云文档上传任务失败: {error}"))?;
    parse_json_response(response, "创建云文档上传任务").await
}

async fn upload_object(
    client: &reqwest::Client,
    upload_url: &str,
    path: PathBuf,
    file_size: u64,
) -> Result<(String, String), String> {
    let file = tokio::fs::File::open(&path)
        .await
        .map_err(|error| format!("读取上传文件失败（{}）: {error}", path.display()))?;
    let body = reqwest::Body::wrap_stream(ReaderStream::new(file));
    let response = client
        .put(upload_url)
        .header(CONTENT_TYPE, "application/octet-stream")
        .header(CONTENT_LENGTH, file_size)
        .body(body)
        .send()
        .await
        .map_err(|error| format!("上传文件到对象存储失败: {error}"))?;
    if !response.status().is_success() {
        return Err(format!(
            "上传文件到对象存储失败: HTTP {}",
            response.status()
        ));
    }
    let save_key = response
        .headers()
        .get("x-obs-save-key")
        .and_then(|value| value.to_str().ok())
        .ok_or_else(|| "对象存储响应缺少 x-obs-save-key".to_string())?
        .to_string();
    let etag = response
        .headers()
        .get(ETAG)
        .and_then(|value| value.to_str().ok())
        .ok_or_else(|| "对象存储响应缺少 ETag".to_string())?
        .to_string();
    Ok((save_key, etag))
}

#[allow(clippy::too_many_arguments)]
async fn create_file(
    client: &reqwest::Client,
    csrf: &str,
    settings: &KdocsSettings,
    store: &str,
    save_key: &str,
    etag: &str,
    file_name: &str,
    digest: &FileDigest,
) -> Result<CreateFileResponse, String> {
    let response = client
        .post(format!("{API_BASE}/3rd/drive/api/v5/files/file"))
        .json(&json!({
            "key": save_key,
            "groupid": settings.group_id,
            "parentid": settings.parent_id,
            "parent_path": [],
            "name": file_name,
            "isUpNewVer": false,
            "etag": etag,
            "store": store,
            "size": digest.size,
            "sha1": digest.sha1,
            "apiErrorInfo": null,
            "csrfmiddlewaretoken": csrf,
        }))
        .send()
        .await
        .map_err(|error| format!("创建云文档文件失败: {error}"))?;
    parse_json_response(response, "创建云文档文件").await
}

async fn parse_json_response<T: DeserializeOwned>(
    response: reqwest::Response,
    operation: &str,
) -> Result<T, String> {
    if !response.status().is_success() {
        return Err(format!("{operation}失败: HTTP {}", response.status()));
    }
    response
        .json::<T>()
        .await
        .map_err(|error| format!("{operation}响应格式不正确: {error}"))
}

fn digest_file(path: &Path) -> Result<FileDigest, String> {
    use std::io::Read;

    let mut file = std::fs::File::open(path)
        .map_err(|error| format!("读取文件失败（{}）: {error}", path.display()))?;
    let mut sha1 = Sha1::new();
    let mut sha256 = Sha256::new();
    let mut size = 0u64;
    let mut buffer = vec![0u8; 1024 * 1024];
    loop {
        let read = file
            .read(&mut buffer)
            .map_err(|error| format!("读取文件失败（{}）: {error}", path.display()))?;
        if read == 0 {
            break;
        }
        sha1.update(&buffer[..read]);
        sha256.update(&buffer[..read]);
        size += read as u64;
    }
    Ok(FileDigest {
        size,
        sha1: format_hex(&sha1.finalize()),
        sha256: format_hex(&sha256.finalize()),
    })
}

fn parse_expires(url: &str) -> Option<i64> {
    reqwest::Url::parse(url)
        .ok()?
        .query_pairs()
        .find_map(|(name, value)| (name == "Expires").then(|| value.parse::<i64>().ok()))
        .flatten()
}

fn content_type_for(file_name: &str) -> &'static str {
    if file_name.ends_with(".gz") {
        "application/gzip"
    } else if file_name.ends_with(".txt") {
        "text/plain"
    } else if file_name.ends_with(".exe") {
        "application/vnd.microsoft.portable-executable"
    } else {
        "application/octet-stream"
    }
}

fn format_hex(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut out = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        out.push(HEX[(byte >> 4) as usize] as char);
        out.push(HEX[(byte & 0x0f) as usize] as char);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cookie_encryption_round_trips_and_wrong_key_fails() {
        let service = KdocsService::from_key([7u8; 32]);
        let (ciphertext, nonce) = service
            .encrypt_cookie("wps_sid=session; csrf=token")
            .unwrap();
        assert_eq!(
            service.decrypt_cookie(&ciphertext, &nonce).unwrap(),
            "wps_sid=session; csrf=token"
        );
        assert!(KdocsService::from_key([8u8; 32])
            .decrypt_cookie(&ciphertext, &nonce)
            .is_err());
    }

    #[test]
    fn parses_csrf_and_masks_cookie() {
        assert_eq!(
            csrf_from_cookie("wps_sid=abcdefgh; csrf=token").unwrap(),
            "token"
        );
        assert_eq!(
            cookie_hint("wps_sid=abcdefgh; csrf=token"),
            "wps_sid=****efgh"
        );
        assert!(csrf_from_cookie("wps_sid=abcdefgh").is_err());
    }

    #[test]
    fn parses_oss_expiry() {
        assert_eq!(
            parse_expires("https://example.com/file?Expires=1784203564&Signature=x"),
            Some(1784203564)
        );
        assert_eq!(parse_expires("https://example.com/file"), None);
    }
}
