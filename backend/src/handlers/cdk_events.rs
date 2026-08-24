use std::time::{Duration, Instant};

use axum::extract::ws::{CloseFrame, Message, WebSocket};
use axum::extract::{Path, State, WebSocketUpgrade};
use axum::http::header::AUTHORIZATION;
use axum::http::HeaderMap;
use axum::response::Response;
use chrono::{DateTime, NaiveDateTime, Utc};

use crate::cdk_events::{CdkConnectionCommand, CdkConnectionKey, CdkInvalidationReason};
use crate::errors::AppError;
use crate::usage::{persist_interval, persist_intervals_best_effort, USAGE_CHECKPOINT_INTERVAL};
use crate::AppState;

const MACHINE_HEADER: &str = "x-skinforge-machine";
const MAX_CREDENTIAL_LEN: usize = 256;
const MAX_MESSAGE_SIZE: usize = 64 * 1024;
const SOCKET_BUFFER_SIZE: usize = 8 * 1024;
const MAX_WRITE_BUFFER_SIZE: usize = MAX_MESSAGE_SIZE;
const HEARTBEAT_INTERVAL: Duration = Duration::from_secs(30);
const HEARTBEAT_TIMEOUT: Duration = Duration::from_secs(60);

pub async fn connect(
    State(state): State<AppState>,
    Path(username): Path<String>,
    headers: HeaderMap,
    ws: WebSocketUpgrade,
) -> Result<Response, AppError> {
    let cdk = bearer_credential(&headers)?;
    let machine_code = header_credential(&headers, MACHINE_HEADER)?;

    let owner_id = sqlx::query_as::<_, (i64,)>("SELECT id FROM users WHERE username = ?")
        .bind(&username)
        .fetch_optional(&state.db)
        .await?
        .ok_or_else(connection_denied)?
        .0;

    let now = Utc::now().naive_utc();
    let binding = sqlx::query_as::<_, (i64, NaiveDateTime)>(
        "SELECT id, expires_at FROM cdkeys \
         WHERE code = ? AND created_by = ? AND status = 'activated' \
         AND machine_code = ? AND expires_at IS NOT NULL AND expires_at >= ?",
    )
    .bind(cdk)
    .bind(owner_id)
    .bind(machine_code)
    .bind(now)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(connection_denied)?;

    let banned = sqlx::query_as::<_, (i64,)>(
        "SELECT id FROM banned_machines WHERE machine_code = ? AND created_by = ?",
    )
    .bind(machine_code)
    .bind(owner_id)
    .fetch_optional(&state.db)
    .await?;
    if banned.is_some() {
        return Err(connection_denied());
    }

    let registry = state.cdk_connections.clone();
    let db = state.db.clone();
    let key = CdkConnectionKey::new(owner_id, binding.0, machine_code);
    Ok(ws
        .read_buffer_size(SOCKET_BUFFER_SIZE)
        .write_buffer_size(SOCKET_BUFFER_SIZE)
        .max_write_buffer_size(MAX_WRITE_BUFFER_SIZE)
        .max_frame_size(MAX_MESSAGE_SIZE)
        .max_message_size(MAX_MESSAGE_SIZE)
        .on_upgrade(move |socket| handle_socket(socket, registry, db, key)))
}

fn bearer_credential(headers: &HeaderMap) -> Result<&str, AppError> {
    let value = headers
        .get(AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.strip_prefix("Bearer "))
        .map(str::trim)
        .filter(|value| !value.is_empty() && value.len() <= MAX_CREDENTIAL_LEN)
        .ok_or_else(connection_denied)?;
    Ok(value)
}

fn header_credential<'a>(headers: &'a HeaderMap, name: &str) -> Result<&'a str, AppError> {
    headers
        .get(name)
        .and_then(|value| value.to_str().ok())
        .map(str::trim)
        .filter(|value| !value.is_empty() && value.len() <= MAX_CREDENTIAL_LEN)
        .ok_or_else(connection_denied)
}

fn connection_denied() -> AppError {
    AppError::Unauthorized("客户端授权无效".to_string())
}

async fn handle_socket(
    mut socket: WebSocket,
    registry: std::sync::Arc<crate::cdk_events::CdkConnectionRegistry>,
    db: sqlx::MySqlPool,
    key: CdkConnectionKey,
) {
    let Some(mut registration) = registry.register(key.clone()) else {
        let _ = socket
            .send(Message::Close(Some(CloseFrame {
                code: 1013,
                reason: "连接数已达上限".into(),
            })))
            .await;
        return;
    };

    // Close the gap between the pre-upgrade DB check and registry insertion.
    // If a rebind committed before this connection was registered, this second
    // check observes it. If it commits afterwards, the registry sees this entry.
    let current_expiry = sqlx::query_as::<_, (NaiveDateTime,)>(
        "SELECT c.expires_at FROM cdkeys c \
         WHERE c.id = ? AND c.created_by = ? AND c.status = 'activated' \
         AND c.machine_code = ? AND c.expires_at IS NOT NULL AND c.expires_at >= ? \
         AND NOT EXISTS (SELECT 1 FROM banned_machines b \
             WHERE b.created_by = c.created_by AND b.machine_code = c.machine_code)",
    )
    .bind(key.cdk_id)
    .bind(key.owner_id)
    .bind(&key.machine_code)
    .bind(Utc::now().naive_utc())
    .fetch_optional(&db)
    .await
    .ok()
    .flatten()
    .map(|row| row.0);
    let Some(mut expires_at) = current_expiry else {
        persist_removed_tail(&registry, &db, &key, registration.connection_id).await;
        let _ = socket
            .send(Message::Close(Some(CloseFrame {
                code: 1008,
                reason: "CDK 绑定已失效".into(),
            })))
            .await;
        return;
    };

    let mut heartbeat = tokio::time::interval(HEARTBEAT_INTERVAL);
    heartbeat.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
    let mut last_pong = Instant::now();
    let expiry_sleep = tokio::time::sleep_until(expiry_deadline(expires_at));
    tokio::pin!(expiry_sleep);

    loop {
        tokio::select! {
            _ = &mut expiry_sleep => {
                match refresh_binding_expiry(&db, &key).await {
                    Ok(BindingExpiry::Valid(new_expires_at)) => {
                        expires_at = new_expires_at;
                        expiry_sleep.as_mut().reset(expiry_deadline(expires_at));
                    }
                    Ok(BindingExpiry::Invalid(reason)) => {
                        let outcome = registry.invalidate_binding(
                            key.owner_id,
                            key.cdk_id,
                            &key.machine_code,
                            reason,
                        );
                        persist_intervals_best_effort(&db, &outcome.usage_intervals).await;
                        expiry_sleep.as_mut().reset(tokio::time::Instant::now() + HEARTBEAT_TIMEOUT);
                    }
                    Err(error) => {
                        tracing::error!("Refresh CDK expiry failed: {}", error);
                        expiry_sleep.as_mut().reset(tokio::time::Instant::now() + HEARTBEAT_TIMEOUT);
                    }
                }
            }
            _ = heartbeat.tick() => {
                if last_pong.elapsed() >= HEARTBEAT_TIMEOUT {
                    break;
                }
                if socket.send(Message::Ping(Vec::new().into())).await.is_err() {
                    break;
                }
            }
            command = registration.receiver.recv() => {
                let Some(CdkConnectionCommand::Invalidate(event)) = command else {
                    break;
                };
                let Ok(json) = serde_json::to_string(&event) else {
                    break;
                };
                let _ = socket.send(Message::Text(json.into())).await;
                let _ = socket.send(Message::Close(Some(CloseFrame {
                    code: 1008,
                    reason: "CDK 已换绑".into(),
                }))).await;
                break;
            }
            message = socket.recv() => {
                match message {
                    Some(Ok(Message::Pong(_))) => {
                        last_pong = Instant::now();
                        persist_checkpoint(&registry, &db, &key).await;
                    }
                    Some(Ok(Message::Ping(payload))) => {
                        persist_checkpoint(&registry, &db, &key).await;
                        if socket.send(Message::Pong(payload)).await.is_err() {
                            break;
                        }
                    }
                    Some(Ok(Message::Close(_))) | None | Some(Err(_)) => break,
                    Some(Ok(Message::Text(_))) | Some(Ok(Message::Binary(_))) => {
                        let _ = socket.send(Message::Close(Some(CloseFrame {
                            code: 1008,
                            reason: "不接受客户端业务消息".into(),
                        }))).await;
                        break;
                    }
                }
            }
        }
    }

    persist_removed_tail(&registry, &db, &key, registration.connection_id).await;
}

enum BindingExpiry {
    Valid(NaiveDateTime),
    Invalid(CdkInvalidationReason),
}

async fn refresh_binding_expiry(
    db: &sqlx::MySqlPool,
    key: &CdkConnectionKey,
) -> Result<BindingExpiry, sqlx::Error> {
    let row = sqlx::query_as::<_, (String, Option<String>, Option<NaiveDateTime>, i64)>(
        "SELECT c.status, c.machine_code, c.expires_at, \
         EXISTS(SELECT 1 FROM banned_machines b \
             WHERE b.created_by = c.created_by AND b.machine_code = c.machine_code) \
         FROM cdkeys c WHERE c.id = ? AND c.created_by = ?",
    )
    .bind(key.cdk_id)
    .bind(key.owner_id)
    .fetch_optional(db)
    .await?;

    let Some((status, machine_code, expires_at, banned)) = row else {
        return Ok(BindingExpiry::Invalid(CdkInvalidationReason::Invalid));
    };
    if banned != 0 {
        return Ok(BindingExpiry::Invalid(CdkInvalidationReason::Banned));
    }
    if status == "disabled" {
        return Ok(BindingExpiry::Invalid(CdkInvalidationReason::Disabled));
    }
    if machine_code.as_deref() != Some(key.machine_code.as_str()) {
        return Ok(BindingExpiry::Invalid(CdkInvalidationReason::Rebound));
    }
    if status != "activated" {
        let reason = if status == "expired" {
            CdkInvalidationReason::Expired
        } else {
            CdkInvalidationReason::Invalid
        };
        return Ok(BindingExpiry::Invalid(reason));
    }

    let Some(expires_at) = expires_at else {
        return Ok(BindingExpiry::Invalid(CdkInvalidationReason::Invalid));
    };
    if expires_at > Utc::now().naive_utc() {
        return Ok(BindingExpiry::Valid(expires_at));
    }

    let result = sqlx::query(
        "UPDATE cdkeys SET status = 'expired' \
         WHERE id = ? AND created_by = ? AND status = 'activated' AND expires_at <= ?",
    )
    .bind(key.cdk_id)
    .bind(key.owner_id)
    .bind(Utc::now().naive_utc())
    .execute(db)
    .await?;
    if result.rows_affected() > 0 {
        return Ok(BindingExpiry::Invalid(CdkInvalidationReason::Expired));
    }

    let refreshed = sqlx::query_as::<_, (String, Option<String>, Option<NaiveDateTime>)>(
        "SELECT status, machine_code, expires_at FROM cdkeys WHERE id = ? AND created_by = ?",
    )
    .bind(key.cdk_id)
    .bind(key.owner_id)
    .fetch_optional(db)
    .await?;
    match refreshed {
        Some((status, machine_code, Some(expires_at)))
            if status == "activated"
                && machine_code.as_deref() == Some(key.machine_code.as_str())
                && expires_at > Utc::now().naive_utc() =>
        {
            Ok(BindingExpiry::Valid(expires_at))
        }
        Some((status, _, _)) if status == "disabled" => {
            Ok(BindingExpiry::Invalid(CdkInvalidationReason::Disabled))
        }
        Some((status, _, _)) if status == "expired" => {
            Ok(BindingExpiry::Invalid(CdkInvalidationReason::Expired))
        }
        Some((_, machine_code, _))
            if machine_code.as_deref() != Some(key.machine_code.as_str()) =>
        {
            Ok(BindingExpiry::Invalid(CdkInvalidationReason::Rebound))
        }
        _ => Ok(BindingExpiry::Invalid(CdkInvalidationReason::Invalid)),
    }
}

fn expiry_deadline(expires_at: NaiveDateTime) -> tokio::time::Instant {
    let expires_at = DateTime::<Utc>::from_naive_utc_and_offset(expires_at, Utc);
    let remaining = expires_at
        .signed_duration_since(Utc::now())
        .to_std()
        .unwrap_or(Duration::ZERO);
    tokio::time::Instant::now() + remaining
}

async fn persist_checkpoint(
    registry: &crate::cdk_events::CdkConnectionRegistry,
    db: &sqlx::MySqlPool,
    key: &CdkConnectionKey,
) {
    let Some(interval) = registry.checkpoint_usage(key, Utc::now(), USAGE_CHECKPOINT_INTERVAL)
    else {
        return;
    };
    if let Err(error) = persist_interval(db, &interval).await {
        tracing::error!("Persist CDK usage checkpoint failed: {}", error);
        registry.restore_checkpoint(&interval);
    }
}

async fn persist_removed_tail(
    registry: &crate::cdk_events::CdkConnectionRegistry,
    db: &sqlx::MySqlPool,
    key: &CdkConnectionKey,
    connection_id: uuid::Uuid,
) {
    let Some(interval) = registry.remove(key, connection_id) else {
        return;
    };
    if let Err(error) = persist_interval(db, &interval).await {
        tracing::error!("Persist final CDK usage interval failed: {}", error);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn credentials_are_required_and_bounded() {
        let mut headers = HeaderMap::new();
        headers.insert(AUTHORIZATION, "Bearer CDK-123".parse().unwrap());
        headers.insert(MACHINE_HEADER, "HWID-123".parse().unwrap());

        assert_eq!(bearer_credential(&headers).unwrap(), "CDK-123");
        assert_eq!(
            header_credential(&headers, MACHINE_HEADER).unwrap(),
            "HWID-123"
        );

        headers.insert(MACHINE_HEADER, " ".parse().unwrap());
        assert!(header_credential(&headers, MACHINE_HEADER).is_err());
    }
}
