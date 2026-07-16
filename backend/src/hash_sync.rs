use std::fs;
use std::io::{self, BufRead, BufReader, BufWriter, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

use chrono::Utc;
use flate2::write::GzEncoder;
use flate2::Compression;
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use sqlx::MySqlPool;
use tokio::io::AsyncWriteExt;

use crate::config::HashSyncConfig;
use crate::kdocs::KdocsService;
use crate::models::skinforge::{
    HashManagementStatus, HashPendingSummary, HashReleaseRow, HashReleaseSummary,
    HashSyncStatusRow, PendingHashUploads,
};

const HASH_FILE_NAME: &str = "hashes.game.txt";
const META_FILE_NAME: &str = "hashes.game.candidate.json";
const PENDING_FILE_NAME: &str = "hashes.game.pending-upload.json";
const TEMP_FILE_NAME: &str = "hashes.game.txt.download";
const BACKUP_FILE_NAME: &str = "hashes.game.txt.bak";
const GZIP_FILE_NAME: &str = "hashes.game.txt.gz";
const GZIP_TEMP_FILE_NAME: &str = "hashes.game.txt.gz.compressing";
const GZIP_BACKUP_FILE_NAME: &str = "hashes.game.txt.gz.bak";
const MIN_HASH_FILE_SIZE: u64 = 50 * 1024 * 1024;
const HASH_DOWNLOAD_ATTEMPTS: usize = 3;
const HASH_CONNECT_TIMEOUT_SECS: u64 = 15;
const HASH_READ_TIMEOUT_SECS: u64 = 60;
const HASH_REQUEST_TIMEOUT_SECS: u64 = 60 * 60;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CandidateMeta {
    version: String,
    etag: Option<String>,
    size: u64,
    sha256: String,
    source: String,
    updated_at: String,
}

#[derive(Debug)]
struct RemoteHead {
    version: String,
    etag: Option<String>,
    size: Option<u64>,
}

pub struct HashSyncController {
    config: HashSyncConfig,
    pool: MySqlPool,
    kdocs: KdocsService,
    running: AtomicBool,
}

impl HashSyncController {
    pub fn new(config: HashSyncConfig, pool: MySqlPool, kdocs: KdocsService) -> Arc<Self> {
        Arc::new(Self {
            config,
            pool,
            kdocs,
            running: AtomicBool::new(false),
        })
    }

    pub fn spawn_schedule(self: &Arc<Self>) {
        if !self.config.enabled {
            tracing::info!("SkinForge hash sync disabled");
            return;
        }

        let controller = Arc::clone(self);
        tokio::spawn(async move {
            controller.trigger();
            loop {
                tokio::time::sleep(Duration::from_secs(
                    controller.config.interval_hours * 60 * 60,
                ))
                .await;
                controller.trigger();
            }
        });
    }

    pub fn trigger(self: &Arc<Self>) -> bool {
        if self
            .running
            .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
            .is_err()
        {
            return false;
        }

        let controller = Arc::clone(self);
        tokio::spawn(async move {
            if let Err(error) = controller.record_attempt().await {
                tracing::error!("Record SkinForge hash sync attempt failed: {}", error);
            }
            let result = controller.sync_once().await;
            match result {
                Ok(version) => {
                    if let Err(error) = controller.record_success(&version).await {
                        tracing::error!("Record SkinForge hash sync success failed: {}", error);
                    }
                    tracing::info!("SkinForge hash dictionary published: {}", version);
                }
                Err(error) => {
                    tracing::error!("SkinForge hash sync failed: {}", error);
                    if let Err(record_error) = controller.record_failure(&error).await {
                        tracing::error!(
                            "Record SkinForge hash sync failure failed: {}",
                            record_error
                        );
                    }
                }
            }
            controller.running.store(false, Ordering::Release);
        });
        true
    }

    pub fn is_running(&self) -> bool {
        self.running.load(Ordering::Acquire)
    }

    pub async fn management_status(&self) -> Result<HashManagementStatus, String> {
        let sync = sqlx::query_as::<_, HashSyncStatusRow>(
            "SELECT last_attempt_at, last_success_at, last_error, \
             last_candidate_version, updated_at \
             FROM skinforge_hash_sync_status WHERE id = 1",
        )
        .fetch_one(&self.pool)
        .await
        .map_err(|error| format!("读取 Hash 同步状态失败: {error}"))?;
        let current = sqlx::query_as::<_, HashReleaseSummary>(
            "SELECT version, canonical_size, canonical_sha256, txt_file_name, txt_size, \
             gzip_file_name, gzip_size, published_at \
             FROM skinforge_hash_releases WHERE id = 1",
        )
        .fetch_optional(&self.pool)
        .await
        .map_err(|error| format!("读取当前 Hash 发布失败: {error}"))?;
        let pending = read_json::<PendingHashUploads>(
            &self.config.mirror_dir.join(PENDING_FILE_NAME),
        )
        .map(|record| HashPendingSummary {
            version: record.version,
            txt_uploaded: record.txt.is_some(),
            gzip_uploaded: record.gzip.is_some(),
        });
        Ok(HashManagementStatus {
            running: self.is_running(),
            sync,
            current,
            pending,
        })
    }

    async fn sync_once(&self) -> Result<String, String> {
        fs::create_dir_all(&self.config.mirror_dir)
            .map_err(|error| format!("创建 Hash staging 目录失败: {error}"))?;
        let client = build_hash_client()?;
        let remote = fetch_remote_head(&client, &self.config.source_url).await?;
        self.record_candidate(&remote.version).await?;

        let meta_path = self.config.mirror_dir.join(META_FILE_NAME);
        let hash_path = self.config.mirror_dir.join(HASH_FILE_NAME);
        let gzip_path = self.config.mirror_dir.join(GZIP_FILE_NAME);
        let pending_path = self.config.mirror_dir.join(PENDING_FILE_NAME);
        let candidate = match read_json::<CandidateMeta>(&meta_path) {
            Some(meta) if hash_path.is_file() && is_up_to_date(&meta, &remote) => meta,
            _ => {
                tracing::info!(
                    "Updating SkinForge hash staging from {}",
                    self.config.source_url
                );
                let downloaded =
                    download_hash_file(&client, &self.config, &remote, &hash_path).await?;
                write_json_atomic(&meta_path, &downloaded)?;
                downloaded
            }
        };

        ensure_gzip_file(&hash_path, &gzip_path).await?;

        if self
            .current_release_is_usable(&candidate.version, &candidate.sha256)
            .await?
        {
            return Ok(candidate.version);
        }

        let mut pending = read_json::<PendingHashUploads>(&pending_path)
            .filter(|record| {
                record.version == candidate.version
                    && record
                        .canonical_sha256
                        .eq_ignore_ascii_case(&candidate.sha256)
            })
            .unwrap_or(PendingHashUploads {
                version: candidate.version.clone(),
                canonical_sha256: candidate.sha256.clone(),
                txt: None,
                gzip: None,
            });

        if pending.txt.is_none() {
            let uploaded = self
                .kdocs
                .upload_file(&self.pool, &hash_path, HASH_FILE_NAME)
                .await?;
            if !uploaded.sha256.eq_ignore_ascii_case(&candidate.sha256) {
                return Err("上传前后的规范 Hash SHA-256 不一致".to_string());
            }
            pending.txt = Some(uploaded);
            write_json_atomic(&pending_path, &pending)?;
        }

        if pending.gzip.is_none() {
            pending.gzip = Some(
                self.kdocs
                    .upload_file(&self.pool, &gzip_path, GZIP_FILE_NAME)
                    .await?,
            );
            write_json_atomic(&pending_path, &pending)?;
        }

        let txt = pending
            .txt
            .as_ref()
            .ok_or_else(|| "缺少 TXT 上传记录".to_string())?;
        let gzip = pending
            .gzip
            .as_ref()
            .ok_or_else(|| "缺少 gzip 上传记录".to_string())?;
        let (txt_url, gzip_url) = tokio::try_join!(
            self.kdocs
                .resolve_download_url(&self.pool, txt.file_id, &txt.link_id),
            self.kdocs
                .resolve_download_url(&self.pool, gzip.file_id, &gzip.link_id)
        )?;
        tokio::try_join!(
            self.kdocs.probe_download_url(&txt_url),
            self.kdocs.probe_download_url(&gzip_url)
        )?;

        let mut transaction = self
            .pool
            .begin()
            .await
            .map_err(|error| format!("开始 Hash 发布事务失败: {error}"))?;
        sqlx::query(
            "INSERT INTO skinforge_hash_releases (
                id, version, etag, canonical_size, canonical_sha256, source,
                txt_file_id, txt_link_id, txt_file_name, txt_size, txt_sha256,
                gzip_file_id, gzip_link_id, gzip_file_name, gzip_size, gzip_sha256, published_at
             ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
             ON DUPLICATE KEY UPDATE
                version = VALUES(version), etag = VALUES(etag),
                canonical_size = VALUES(canonical_size),
                canonical_sha256 = VALUES(canonical_sha256), source = VALUES(source),
                txt_file_id = VALUES(txt_file_id), txt_link_id = VALUES(txt_link_id),
                txt_file_name = VALUES(txt_file_name), txt_size = VALUES(txt_size),
                txt_sha256 = VALUES(txt_sha256), gzip_file_id = VALUES(gzip_file_id),
                gzip_link_id = VALUES(gzip_link_id), gzip_file_name = VALUES(gzip_file_name),
                gzip_size = VALUES(gzip_size), gzip_sha256 = VALUES(gzip_sha256),
                published_at = NOW()",
        )
        .bind(&candidate.version)
        .bind(&candidate.etag)
        .bind(candidate.size)
        .bind(&candidate.sha256)
        .bind(&candidate.source)
        .bind(txt.file_id)
        .bind(&txt.link_id)
        .bind(&txt.file_name)
        .bind(txt.file_size)
        .bind(&txt.sha256)
        .bind(gzip.file_id)
        .bind(&gzip.link_id)
        .bind(&gzip.file_name)
        .bind(gzip.file_size)
        .bind(&gzip.sha256)
        .execute(&mut *transaction)
        .await
        .map_err(|error| format!("写入当前 Hash 发布失败: {error}"))?;
        transaction
            .commit()
            .await
            .map_err(|error| format!("提交 Hash 发布事务失败: {error}"))?;

        let _ = fs::remove_file(pending_path);
        self.kdocs.clear_cache().await;
        Ok(candidate.version)
    }

    async fn current_release_is_usable(
        &self,
        version: &str,
        canonical_sha256: &str,
    ) -> Result<bool, String> {
        let current = sqlx::query_as::<_, HashReleaseRow>(
            "SELECT version, etag, canonical_size, canonical_sha256, source,
             txt_file_id, txt_link_id, txt_size, txt_sha256,
             gzip_file_id, gzip_link_id, gzip_size, gzip_sha256, published_at
             FROM skinforge_hash_releases WHERE id = 1",
        )
        .fetch_optional(&self.pool)
        .await
        .map_err(|error| format!("读取当前 Hash 发布失败: {error}"))?;
        let Some(current) = current else {
            return Ok(false);
        };
        if current.version != version
            || !current
                .canonical_sha256
                .eq_ignore_ascii_case(canonical_sha256)
        {
            return Ok(false);
        }
        let resolved = tokio::try_join!(
            self.kdocs
                .resolve_download_url(&self.pool, current.txt_file_id, &current.txt_link_id),
            self.kdocs.resolve_download_url(
                &self.pool,
                current.gzip_file_id,
                &current.gzip_link_id
            )
        );
        let Ok((txt_url, gzip_url)) = resolved else {
            return Ok(false);
        };
        Ok(tokio::try_join!(
            self.kdocs.probe_download_url(&txt_url),
            self.kdocs.probe_download_url(&gzip_url)
        )
        .is_ok())
    }

    async fn record_attempt(&self) -> Result<(), String> {
        sqlx::query(
            "UPDATE skinforge_hash_sync_status
             SET last_attempt_at = NOW(), last_error = NULL, updated_at = NOW()
             WHERE id = 1",
        )
        .execute(&self.pool)
        .await
        .map_err(|error| format!("更新 Hash 同步尝试状态失败: {error}"))?;
        Ok(())
    }

    async fn record_candidate(&self, version: &str) -> Result<(), String> {
        sqlx::query(
            "UPDATE skinforge_hash_sync_status
             SET last_candidate_version = ?, updated_at = NOW() WHERE id = 1",
        )
        .bind(version)
        .execute(&self.pool)
        .await
        .map_err(|error| format!("更新 Hash 候选版本失败: {error}"))?;
        Ok(())
    }

    async fn record_success(&self, version: &str) -> Result<(), String> {
        sqlx::query(
            "UPDATE skinforge_hash_sync_status
             SET last_success_at = NOW(), last_error = NULL,
                 last_candidate_version = ?, updated_at = NOW()
             WHERE id = 1",
        )
        .bind(version)
        .execute(&self.pool)
        .await
        .map_err(|error| format!("更新 Hash 同步成功状态失败: {error}"))?;
        Ok(())
    }

    async fn record_failure(&self, error: &str) -> Result<(), String> {
        sqlx::query(
            "UPDATE skinforge_hash_sync_status
             SET last_error = ?, updated_at = NOW() WHERE id = 1",
        )
        .bind(truncate_error(error))
        .execute(&self.pool)
        .await
        .map_err(|db_error| format!("更新 Hash 同步失败状态失败: {db_error}"))?;
        Ok(())
    }
}

fn build_hash_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(HASH_CONNECT_TIMEOUT_SECS))
        .read_timeout(Duration::from_secs(HASH_READ_TIMEOUT_SECS))
        .timeout(Duration::from_secs(HASH_REQUEST_TIMEOUT_SECS))
        .build()
        .map_err(|error| format!("创建 Hash HTTP 客户端失败: {error}"))
}

async fn fetch_remote_head(client: &reqwest::Client, url: &str) -> Result<RemoteHead, String> {
    let response = client
        .head(url)
        .header(reqwest::header::ACCEPT_ENCODING, "identity")
        .send()
        .await
        .map_err(|error| format!("检查远端 Hash 文件失败: {error}"))?;
    if !response.status().is_success() {
        return Err(format!(
            "检查远端 Hash 文件失败: HTTP {}",
            response.status()
        ));
    }
    let headers = response.headers();
    let version = headers
        .get(reqwest::header::LAST_MODIFIED)
        .and_then(|value| value.to_str().ok())
        .map(str::to_string)
        .unwrap_or_else(|| Utc::now().to_rfc3339());
    let etag = headers
        .get(reqwest::header::ETAG)
        .and_then(|value| value.to_str().ok())
        .map(str::to_string);
    let size = headers
        .get(reqwest::header::CONTENT_LENGTH)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.parse::<u64>().ok());
    Ok(RemoteHead {
        version,
        etag,
        size,
    })
}

fn is_up_to_date(local: &CandidateMeta, remote: &RemoteHead) -> bool {
    if let (Some(local_etag), Some(remote_etag)) = (&local.etag, &remote.etag) {
        return local_etag == remote_etag;
    }
    if let Some(remote_size) = remote.size {
        return local.version == remote.version && local.size == remote_size;
    }
    local.version == remote.version
}

async fn download_hash_file(
    client: &reqwest::Client,
    config: &HashSyncConfig,
    remote: &RemoteHead,
    hash_path: &Path,
) -> Result<CandidateMeta, String> {
    let temp_path = config.mirror_dir.join(TEMP_FILE_NAME);
    let downloaded = download_hash_file_with_retries(client, config, remote, &temp_path).await?;
    replace_file(&temp_path, hash_path, BACKUP_FILE_NAME)?;
    Ok(downloaded)
}

async fn download_hash_file_with_retries(
    client: &reqwest::Client,
    config: &HashSyncConfig,
    remote: &RemoteHead,
    temp_path: &Path,
) -> Result<CandidateMeta, String> {
    let mut last_error = None;
    for attempt in 1..=HASH_DOWNLOAD_ATTEMPTS {
        let _ = fs::remove_file(temp_path);
        match download_hash_file_attempt(client, config, remote, temp_path).await {
            Ok(meta) => return Ok(meta),
            Err(error) => {
                let _ = fs::remove_file(temp_path);
                tracing::error!(
                    "SkinForge hash download attempt {}/{} failed: {}",
                    attempt,
                    HASH_DOWNLOAD_ATTEMPTS,
                    error
                );
                last_error = Some(error);
            }
        }
        if attempt < HASH_DOWNLOAD_ATTEMPTS {
            tokio::time::sleep(Duration::from_secs(attempt as u64 * 5)).await;
        }
    }
    Err(last_error.unwrap_or_else(|| "下载 Hash 文件失败".to_string()))
}

async fn download_hash_file_attempt(
    client: &reqwest::Client,
    config: &HashSyncConfig,
    remote: &RemoteHead,
    temp_path: &Path,
) -> Result<CandidateMeta, String> {
    let response = client
        .get(&config.source_url)
        .header(reqwest::header::ACCEPT_ENCODING, "identity")
        .send()
        .await
        .map_err(|error| format!("下载 Hash 文件失败: {error}"))?;
    if !response.status().is_success() {
        return Err(format!("下载 Hash 文件失败: HTTP {}", response.status()));
    }
    let expected_size = remote.size.or_else(|| response.content_length());
    let mut file = tokio::fs::File::create(temp_path)
        .await
        .map_err(|error| format!("创建临时 Hash 文件失败: {error}"))?;
    let mut stream = response.bytes_stream();
    let mut hasher = Sha256::new();
    let mut downloaded = 0u64;
    while let Some(chunk) = stream.next().await {
        let chunk = chunk
            .map_err(|error| format!("下载 Hash 文件失败，已下载 {downloaded} 字节: {error}"))?;
        file.write_all(&chunk)
            .await
            .map_err(|error| format!("写入 Hash 文件失败: {error}"))?;
        hasher.update(&chunk);
        downloaded += chunk.len() as u64;
    }
    file.flush()
        .await
        .map_err(|error| format!("写入 Hash 文件失败: {error}"))?;
    drop(file);
    validate_hash_file(temp_path, downloaded, expected_size)?;
    Ok(CandidateMeta {
        version: remote.version.clone(),
        etag: remote.etag.clone(),
        size: downloaded,
        sha256: format_hex(&hasher.finalize()),
        source: config.source_url.clone(),
        updated_at: Utc::now().to_rfc3339(),
    })
}

async fn ensure_gzip_file(hash_path: &Path, gzip_path: &Path) -> Result<bool, String> {
    if is_gzip_up_to_date(hash_path, gzip_path) {
        return Ok(false);
    }
    if gzip_path.exists() {
        fs::remove_file(gzip_path).map_err(|error| format!("移除过期 gzip 失败: {error}"))?;
    }
    let hash_path = hash_path.to_path_buf();
    let gzip_path = gzip_path.to_path_buf();
    tokio::task::spawn_blocking(move || compress_hash_file(&hash_path, &gzip_path))
        .await
        .map_err(|error| format!("生成 gzip 的后台任务失败: {error}"))??;
    Ok(true)
}

fn is_gzip_up_to_date(hash_path: &Path, gzip_path: &Path) -> bool {
    let Ok(hash_meta) = fs::metadata(hash_path) else {
        return false;
    };
    let Ok(gzip_meta) = fs::metadata(gzip_path) else {
        return false;
    };
    if gzip_meta.len() == 0 {
        return false;
    }
    match (hash_meta.modified(), gzip_meta.modified()) {
        (Ok(hash_modified), Ok(gzip_modified)) => gzip_modified >= hash_modified,
        _ => false,
    }
}

fn compress_hash_file(hash_path: &Path, gzip_path: &Path) -> Result<(), String> {
    let temp_path = gzip_path.with_file_name(GZIP_TEMP_FILE_NAME);
    let _ = fs::remove_file(&temp_path);
    let result = (|| {
        let input =
            fs::File::open(hash_path).map_err(|error| format!("读取 Hash 文件失败: {error}"))?;
        let output = fs::File::create(&temp_path)
            .map_err(|error| format!("创建临时 gzip 文件失败: {error}"))?;
        let writer = BufWriter::new(output);
        let mut encoder = GzEncoder::new(writer, Compression::default());
        io::copy(&mut BufReader::new(input), &mut encoder)
            .map_err(|error| format!("压缩 Hash 文件失败: {error}"))?;
        let mut writer = encoder
            .finish()
            .map_err(|error| format!("完成 gzip 文件失败: {error}"))?;
        writer
            .flush()
            .map_err(|error| format!("写入 gzip 文件失败: {error}"))?;
        drop(writer);
        if fs::metadata(&temp_path)
            .map_err(|error| format!("检查 gzip 文件失败: {error}"))?
            .len()
            == 0
        {
            return Err("gzip Hash 文件异常: 文件为空".to_string());
        }
        replace_file(&temp_path, gzip_path, GZIP_BACKUP_FILE_NAME)
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temp_path);
    }
    result
}

fn validate_hash_file(
    path: &Path,
    downloaded: u64,
    expected_size: Option<u64>,
) -> Result<(), String> {
    if downloaded < MIN_HASH_FILE_SIZE {
        let _ = fs::remove_file(path);
        return Err("Hash 文件异常: 文件过小".to_string());
    }
    if let Some(expected_size) = expected_size {
        if downloaded != expected_size {
            let _ = fs::remove_file(path);
            return Err(format!(
                "Hash 文件异常: 大小不一致，已下载 {downloaded}，预期 {expected_size}"
            ));
        }
    }
    let file = fs::File::open(path).map_err(|error| format!("读取 Hash 文件失败: {error}"))?;
    let mut reader = BufReader::new(file);
    let mut first_line = String::new();
    reader
        .read_line(&mut first_line)
        .map_err(|error| format!("读取 Hash 文件失败: {error}"))?;
    if !is_valid_hash_line(first_line.trim_end()) {
        let _ = fs::remove_file(path);
        return Err("Hash 文件格式异常".to_string());
    }
    Ok(())
}

fn is_valid_hash_line(line: &str) -> bool {
    let Some((hash, path)) = line.split_once(' ') else {
        return false;
    };
    hash.len() == 16
        && hash.bytes().all(|byte| byte.is_ascii_hexdigit())
        && !path.trim().is_empty()
        && !path.contains('<')
        && !path.contains('>')
}

fn replace_file(temp_path: &Path, final_path: &Path, backup_file_name: &str) -> Result<(), String> {
    let backup_path = final_path.with_file_name(backup_file_name);
    let had_existing = final_path.exists();
    if had_existing {
        let _ = fs::remove_file(&backup_path);
        fs::rename(final_path, &backup_path)
            .map_err(|error| format!("备份旧 Hash 文件失败: {error}"))?;
    }
    match fs::rename(temp_path, final_path) {
        Ok(()) => {
            let _ = fs::remove_file(&backup_path);
            Ok(())
        }
        Err(error) => {
            if had_existing {
                let _ = fs::rename(&backup_path, final_path);
            }
            Err(format!("替换 Hash 文件失败: {error}"))
        }
    }
}

fn read_json<T: for<'de> Deserialize<'de>>(path: &Path) -> Option<T> {
    let content = fs::read_to_string(path).ok()?;
    serde_json::from_str(&content).ok()
}

fn write_json_atomic<T: Serialize>(path: &Path, value: &T) -> Result<(), String> {
    let temp_path = PathBuf::from(format!("{}.writing", path.display()));
    let content = serde_json::to_string_pretty(value)
        .map_err(|error| format!("序列化 JSON 失败: {error}"))?;
    fs::write(&temp_path, format!("{content}\n"))
        .map_err(|error| format!("写入临时 JSON 失败: {error}"))?;
    fs::rename(&temp_path, path).map_err(|error| format!("提交 JSON 文件失败: {error}"))
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

fn truncate_error(error: &str) -> String {
    error.chars().take(2000).collect()
}

#[cfg(test)]
mod tests {
    use std::io::Read;

    use flate2::read::GzDecoder;

    use super::*;

    #[tokio::test]
    async fn ensure_gzip_file_creates_missing_file_and_round_trips_content() {
        let dir =
            std::env::temp_dir().join(format!("cdk-server-hash-sync-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        let hash_path = dir.join(HASH_FILE_NAME);
        let gzip_path = dir.join(GZIP_FILE_NAME);
        let content = b"0123456789abcdef path/to/game/file.bin\n".repeat(1024);
        fs::write(&hash_path, &content).unwrap();

        assert!(ensure_gzip_file(&hash_path, &gzip_path).await.unwrap());
        assert!(!ensure_gzip_file(&hash_path, &gzip_path).await.unwrap());

        let mut decoded = Vec::new();
        GzDecoder::new(fs::File::open(&gzip_path).unwrap())
            .read_to_end(&mut decoded)
            .unwrap();
        assert_eq!(decoded, content);
        assert!(is_gzip_up_to_date(&hash_path, &gzip_path));

        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn pending_upload_json_round_trips() {
        let dir =
            std::env::temp_dir().join(format!("cdk-server-hash-pending-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join(PENDING_FILE_NAME);
        let pending = PendingHashUploads {
            version: "v1".to_string(),
            canonical_sha256: "a".repeat(64),
            txt: None,
            gzip: None,
        };
        write_json_atomic(&path, &pending).unwrap();
        let decoded: PendingHashUploads = read_json(&path).unwrap();
        assert_eq!(decoded.version, "v1");
        assert_eq!(decoded.canonical_sha256, "a".repeat(64));
        fs::remove_dir_all(dir).unwrap();
    }
}
