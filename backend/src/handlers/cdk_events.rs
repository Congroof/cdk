use std::time::{Duration, Instant};

use axum::extract::ws::{CloseFrame, Message, WebSocket};
use axum::extract::{Path, State, WebSocketUpgrade};
use axum::http::header::AUTHORIZATION;
use axum::http::HeaderMap;
use axum::response::Response;

use crate::cdk_events::{CdkConnectionCommand, CdkConnectionKey};
use crate::errors::AppError;
use crate::AppState;

const MACHINE_HEADER: &str = "x-skinforge-machine";
const MAX_CREDENTIAL_LEN: usize = 256;
const MAX_MESSAGE_SIZE: usize = 64 * 1024;
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

    let binding = sqlx::query_as::<_, (i64,)>(
        "SELECT id FROM cdkeys \
         WHERE code = ? AND created_by = ? AND status = 'activated' \
         AND machine_code = ? AND (expires_at IS NULL OR expires_at >= NOW())",
    )
    .bind(cdk)
    .bind(owner_id)
    .bind(machine_code)
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
    let binding_is_current = sqlx::query_as::<_, (i64,)>(
        "SELECT id FROM cdkeys \
         WHERE id = ? AND created_by = ? AND status = 'activated' \
         AND machine_code = ? AND (expires_at IS NULL OR expires_at >= NOW())",
    )
    .bind(key.cdk_id)
    .bind(key.owner_id)
    .bind(&key.machine_code)
    .fetch_optional(&db)
    .await
    .ok()
    .flatten()
    .is_some();
    if !binding_is_current {
        registry.remove(&key, registration.connection_id);
        let _ = socket
            .send(Message::Close(Some(CloseFrame {
                code: 1008,
                reason: "CDK 绑定已失效".into(),
            })))
            .await;
        return;
    }

    let mut heartbeat = tokio::time::interval(HEARTBEAT_INTERVAL);
    heartbeat.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
    let mut last_pong = Instant::now();

    loop {
        tokio::select! {
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
                    Some(Ok(Message::Pong(_))) => last_pong = Instant::now(),
                    Some(Ok(Message::Ping(payload))) => {
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

    registry.remove(&key, registration.connection_id);
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
