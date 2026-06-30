use std::fs;
use std::io::{BufRead, BufReader, Write};
use std::path::Path;
use std::time::Duration;

use chrono::Utc;
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::config::HashSyncConfig;

const HASH_FILE_NAME: &str = "hashes.game.txt";
const META_FILE_NAME: &str = "hashes.game.meta.json";
const TEMP_FILE_NAME: &str = "hashes.game.txt.download";
const BACKUP_FILE_NAME: &str = "hashes.game.txt.bak";
const MIN_HASH_FILE_SIZE: u64 = 50 * 1024 * 1024;
const HASH_DOWNLOAD_ATTEMPTS: usize = 3;
const HASH_CONNECT_TIMEOUT_SECS: u64 = 15;
const HASH_READ_TIMEOUT_SECS: u64 = 60;
const HASH_REQUEST_TIMEOUT_SECS: u64 = 15 * 60;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct HashMeta {
    version: String,
    etag: Option<String>,
    size: u64,
    sha256: Option<String>,
    url: String,
    source: String,
    updated_at: String,
}

#[derive(Debug)]
struct RemoteHead {
    version: String,
    etag: Option<String>,
    size: Option<u64>,
}

pub fn spawn_hash_sync(config: HashSyncConfig) {
    if !config.enabled {
        tracing::info!("SkinForge hash sync disabled");
        return;
    }

    tokio::spawn(async move {
        if let Err(err) = sync_once(&config).await {
            tracing::error!("SkinForge hash sync failed: {}", err);
        }

        loop {
            tokio::time::sleep(Duration::from_secs(config.interval_hours * 60 * 60)).await;
            if let Err(err) = sync_once(&config).await {
                tracing::error!("SkinForge hash sync failed: {}", err);
            }
        }
    });
}

async fn sync_once(config: &HashSyncConfig) -> Result<(), String> {
    fs::create_dir_all(&config.mirror_dir).map_err(|e| format!("创建 Hash 镜像目录失败: {e}"))?;

    let client = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(HASH_CONNECT_TIMEOUT_SECS))
        .read_timeout(Duration::from_secs(HASH_READ_TIMEOUT_SECS))
        .timeout(Duration::from_secs(HASH_REQUEST_TIMEOUT_SECS))
        .build()
        .map_err(|e| format!("创建 HTTP 客户端失败: {e}"))?;

    let remote = fetch_remote_head(&client, &config.source_url).await?;
    let meta_path = config.mirror_dir.join(META_FILE_NAME);
    let hash_path = config.mirror_dir.join(HASH_FILE_NAME);
    let local_meta = read_meta(&meta_path);

    if hash_path.is_file() && is_up_to_date(local_meta.as_ref(), &remote) {
        tracing::info!("SkinForge hash dictionary is up to date");
        return Ok(());
    }

    tracing::info!(
        "Updating SkinForge hash dictionary from {}",
        config.source_url
    );
    let downloaded = download_hash_file(&client, config, &remote).await?;
    write_meta(&meta_path, &downloaded)?;
    tracing::info!(
        "SkinForge hash dictionary updated: {} bytes, version {}",
        downloaded.size,
        downloaded.version
    );
    Ok(())
}

async fn fetch_remote_head(client: &reqwest::Client, url: &str) -> Result<RemoteHead, String> {
    let response = client
        .head(url)
        .header(reqwest::header::ACCEPT_ENCODING, "identity")
        .send()
        .await
        .map_err(|e| format!("检查远端 Hash 文件失败: {e}"))?;
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

fn is_up_to_date(local: Option<&HashMeta>, remote: &RemoteHead) -> bool {
    let Some(local) = local else {
        return false;
    };

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
) -> Result<HashMeta, String> {
    let temp_path = config.mirror_dir.join(TEMP_FILE_NAME);
    let hash_path = config.mirror_dir.join(HASH_FILE_NAME);

    let downloaded = download_hash_file_with_retries(client, config, remote, &temp_path).await?;
    replace_file(&temp_path, &hash_path)?;

    Ok(downloaded)
}

async fn download_hash_file_with_retries(
    client: &reqwest::Client,
    config: &HashSyncConfig,
    remote: &RemoteHead,
    temp_path: &Path,
) -> Result<HashMeta, String> {
    let mut last_error = None;

    for attempt in 1..=HASH_DOWNLOAD_ATTEMPTS {
        let _ = fs::remove_file(temp_path);

        match download_hash_file_attempt(client, config, remote, temp_path).await {
            Ok(meta) => return Ok(meta),
            Err(err) => {
                let _ = fs::remove_file(temp_path);
                tracing::error!(
                    "SkinForge hash download attempt {}/{} failed: {}",
                    attempt,
                    HASH_DOWNLOAD_ATTEMPTS,
                    err
                );
                last_error = Some(err);
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
) -> Result<HashMeta, String> {
    let response = client
        .get(&config.source_url)
        .header(reqwest::header::ACCEPT_ENCODING, "identity")
        .send()
        .await
        .map_err(|e| format!("下载 Hash 文件失败: {e}"))?;
    if !response.status().is_success() {
        return Err(format!("下载 Hash 文件失败: HTTP {}", response.status()));
    }
    let expected_size = remote.size.or_else(|| response.content_length());

    let mut file =
        fs::File::create(temp_path).map_err(|e| format!("创建临时 Hash 文件失败: {e}"))?;
    let mut stream = response.bytes_stream();
    let mut hasher = Sha256::new();
    let mut downloaded = 0u64;

    while let Some(chunk) = stream.next().await {
        let chunk =
            chunk.map_err(|e| format!("下载 Hash 文件失败，已下载 {downloaded} 字节: {e}"))?;
        file.write_all(&chunk)
            .map_err(|e| format!("写入 Hash 文件失败: {e}"))?;
        hasher.update(&chunk);
        downloaded += chunk.len() as u64;
    }
    file.flush()
        .map_err(|e| format!("写入 Hash 文件失败: {e}"))?;
    drop(file);

    validate_hash_file(temp_path, downloaded, expected_size)?;

    Ok(HashMeta {
        version: remote.version.clone(),
        etag: remote.etag.clone(),
        size: downloaded,
        sha256: Some(format_sha256(hasher.finalize().as_slice())),
        url: format!(
            "{}/{}",
            config.public_base_url.trim_end_matches('/'),
            HASH_FILE_NAME
        ),
        source: config.source_url.clone(),
        updated_at: Utc::now().to_rfc3339(),
    })
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

    let file = fs::File::open(path).map_err(|e| format!("读取 Hash 文件失败: {e}"))?;
    let mut reader = BufReader::new(file);
    let mut first_line = String::new();
    reader
        .read_line(&mut first_line)
        .map_err(|e| format!("读取 Hash 文件失败: {e}"))?;
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
        && hash.bytes().all(|b| b.is_ascii_hexdigit())
        && !path.trim().is_empty()
        && !path.contains('<')
        && !path.contains('>')
}

fn replace_file(temp_path: &Path, final_path: &Path) -> Result<(), String> {
    let backup_path = final_path.with_file_name(BACKUP_FILE_NAME);
    let had_existing = final_path.exists();
    if had_existing {
        let _ = fs::remove_file(&backup_path);
        fs::rename(final_path, &backup_path).map_err(|e| format!("备份旧 Hash 文件失败: {e}"))?;
    }

    match fs::rename(temp_path, final_path) {
        Ok(()) => {
            let _ = fs::remove_file(&backup_path);
            Ok(())
        }
        Err(err) => {
            if had_existing {
                let _ = fs::rename(&backup_path, final_path);
            }
            Err(format!("替换 Hash 文件失败: {err}"))
        }
    }
}

fn read_meta(path: &Path) -> Option<HashMeta> {
    let content = fs::read_to_string(path).ok()?;
    serde_json::from_str(&content).ok()
}

fn write_meta(path: &Path, meta: &HashMeta) -> Result<(), String> {
    let content =
        serde_json::to_string_pretty(meta).map_err(|e| format!("序列化 Hash 元数据失败: {e}"))?;
    fs::write(path, content).map_err(|e| format!("写入 Hash 元数据失败: {e}"))
}

fn format_sha256(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut out = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        out.push(HEX[(byte >> 4) as usize] as char);
        out.push(HEX[(byte & 0x0f) as usize] as char);
    }
    out
}
