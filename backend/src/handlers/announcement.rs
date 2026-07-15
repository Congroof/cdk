use axum::extract::{Path, State};
use axum::{Extension, Json};

use crate::errors::AppError;
use crate::middleware::auth::Claims;
use crate::models::announcement::{Announcement, PublicAnnouncement, SaveAnnouncementRequest};
use crate::AppState;

const MAX_TITLE_LEN: usize = 128;
const MAX_CONTENT_LEN: usize = 10_000;

struct ValidatedAnnouncement {
    title: String,
    content: String,
    is_enabled: bool,
}

pub async fn get(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
) -> Result<Json<serde_json::Value>, AppError> {
    let owner_id = current_user_id(&state, &claims.sub).await?;
    let announcement = sqlx::query_as::<_, Announcement>(
        "SELECT title, content, is_enabled, updated_at \
         FROM announcements WHERE created_by = ?",
    )
    .bind(owner_id)
    .fetch_optional(&state.db)
    .await?;

    Ok(Json(serde_json::json!({
        "success": true,
        "data": announcement,
    })))
}

pub async fn save(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Json(payload): Json<SaveAnnouncementRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    let owner_id = current_user_id(&state, &claims.sub).await?;
    let announcement = validate_announcement(payload)?;

    sqlx::query(
        "INSERT INTO announcements (title, content, is_enabled, created_by) \
         VALUES (?, ?, ?, ?) \
         ON DUPLICATE KEY UPDATE title = VALUES(title), content = VALUES(content), \
         is_enabled = VALUES(is_enabled), updated_at = NOW()",
    )
    .bind(&announcement.title)
    .bind(&announcement.content)
    .bind(announcement.is_enabled)
    .bind(owner_id)
    .execute(&state.db)
    .await?;

    let saved = sqlx::query_as::<_, Announcement>(
        "SELECT title, content, is_enabled, updated_at \
         FROM announcements WHERE created_by = ?",
    )
    .bind(owner_id)
    .fetch_one(&state.db)
    .await?;

    Ok(Json(serde_json::json!({
        "success": true,
        "data": saved,
    })))
}

pub async fn get_for_client(
    State(state): State<AppState>,
    Path(username): Path<String>,
) -> Result<Json<serde_json::Value>, AppError> {
    let owner_id = sqlx::query_as::<_, (i64,)>("SELECT id FROM users WHERE username = ?")
        .bind(&username)
        .fetch_optional(&state.db)
        .await?
        .ok_or_else(|| AppError::NotFound("用户不存在".to_string()))?;

    let announcement = sqlx::query_as::<_, PublicAnnouncement>(
        "SELECT title, content, updated_at FROM announcements \
         WHERE created_by = ? AND is_enabled = TRUE",
    )
    .bind(owner_id.0)
    .fetch_optional(&state.db)
    .await?;

    Ok(Json(serde_json::json!({
        "success": true,
        "data": announcement,
    })))
}

async fn current_user_id(state: &AppState, username: &str) -> Result<i64, AppError> {
    let (user_id,): (i64,) = sqlx::query_as("SELECT id FROM users WHERE username = ?")
        .bind(username)
        .fetch_one(&state.db)
        .await?;
    Ok(user_id)
}

fn validate_announcement(
    payload: SaveAnnouncementRequest,
) -> Result<ValidatedAnnouncement, AppError> {
    let title = payload.title.trim().to_string();
    if title.is_empty() {
        return Err(AppError::BadRequest("公告标题不能为空".to_string()));
    }
    if title.chars().count() > MAX_TITLE_LEN {
        return Err(AppError::BadRequest("公告标题过长".to_string()));
    }

    let content = payload.content.trim().to_string();
    if content.is_empty() {
        return Err(AppError::BadRequest("公告内容不能为空".to_string()));
    }
    if content.chars().count() > MAX_CONTENT_LEN {
        return Err(AppError::BadRequest("公告内容过长".to_string()));
    }

    Ok(ValidatedAnnouncement {
        title,
        content,
        is_enabled: payload.is_enabled,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn request(title: &str, content: &str) -> SaveAnnouncementRequest {
        SaveAnnouncementRequest {
            title: title.to_string(),
            content: content.to_string(),
            is_enabled: true,
        }
    }

    #[test]
    fn validation_trims_outer_whitespace_and_preserves_inner_newlines() {
        let announcement = validate_announcement(request("  更新公告  ", "  第一行\n第二行  "))
            .expect("valid announcement");

        assert_eq!(announcement.title, "更新公告");
        assert_eq!(announcement.content, "第一行\n第二行");
    }

    #[test]
    fn validation_rejects_empty_fields() {
        assert!(matches!(
            validate_announcement(request("   ", "正文")),
            Err(AppError::BadRequest(_))
        ));
        assert!(matches!(
            validate_announcement(request("标题", "\n\t")),
            Err(AppError::BadRequest(_))
        ));
    }

    #[test]
    fn validation_counts_unicode_characters() {
        assert!(validate_announcement(request(&"公".repeat(MAX_TITLE_LEN), "正文")).is_ok());
        assert!(matches!(
            validate_announcement(request(&"公".repeat(MAX_TITLE_LEN + 1), "正文")),
            Err(AppError::BadRequest(_))
        ));
        assert!(matches!(
            validate_announcement(request("标题", &"文".repeat(MAX_CONTENT_LEN + 1))),
            Err(AppError::BadRequest(_))
        ));
    }
}
