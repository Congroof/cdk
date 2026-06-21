use axum::extract::{Query, State};
use axum::{Extension, Json};

use crate::errors::AppError;
use crate::middleware::auth::Claims;
use crate::models::banned::*;
use crate::AppState;

pub async fn ban(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Json(payload): Json<BanRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    if payload.machine_code.trim().is_empty() {
        return Err(AppError::BadRequest("机器码不能为空".to_string()));
    }

    let user_id: (i64,) = sqlx::query_as(
        "SELECT id FROM users WHERE username = ?"
    )
    .bind(&claims.sub)
    .fetch_one(&state.db)
    .await?;

    let existing: Option<(i64,)> = sqlx::query_as(
        "SELECT id FROM banned_machines WHERE machine_code = ? AND created_by = ?"
    )
    .bind(&payload.machine_code)
    .bind(user_id.0)
    .fetch_optional(&state.db)
    .await?;

    if existing.is_some() {
        return Err(AppError::Conflict("该机器码已被封禁".to_string()));
    }

    sqlx::query(
        "INSERT INTO banned_machines (machine_code, reason, created_by) VALUES (?, ?, ?)"
    )
    .bind(&payload.machine_code)
    .bind(&payload.reason)
    .bind(user_id.0)
    .execute(&state.db)
    .await?;

    Ok(Json(serde_json::json!({
        "success": true,
        "data": { "message": "机器码已封禁" },
    })))
}

pub async fn unban(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Json(payload): Json<UnbanRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    let user_id: (i64,) = sqlx::query_as(
        "SELECT id FROM users WHERE username = ?"
    )
    .bind(&claims.sub)
    .fetch_one(&state.db)
    .await?;

    let result = sqlx::query(
        "DELETE FROM banned_machines WHERE machine_code = ? AND created_by = ?"
    )
    .bind(&payload.machine_code)
    .bind(user_id.0)
    .execute(&state.db)
    .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("该机器码未被封禁".to_string()));
    }

    Ok(Json(serde_json::json!({
        "success": true,
        "data": { "message": "机器码已解禁" },
    })))
}

pub async fn list(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Query(params): Query<BannedListQuery>,
) -> Result<Json<serde_json::Value>, AppError> {
    let user_id: (i64,) = sqlx::query_as(
        "SELECT id FROM users WHERE username = ?"
    )
    .bind(&claims.sub)
    .fetch_one(&state.db)
    .await?;

    let page = params.page.unwrap_or(1).max(1);
    let page_size = params.page_size.unwrap_or(10).min(50);
    let offset = (page - 1) * page_size;
    let has_search = params.search.as_ref().is_some_and(|s| !s.is_empty());

    let search_pattern = params.search.as_ref()
        .map(|s| format!("%{}%", s))
        .unwrap_or_default();

    let (total,): (i64,) = if has_search {
        sqlx::query_as(
            "SELECT COUNT(*) FROM banned_machines WHERE created_by = ? AND (machine_code LIKE ? OR reason LIKE ?)"
        )
        .bind(user_id.0)
        .bind(&search_pattern)
        .bind(&search_pattern)
        .fetch_one(&state.db)
        .await?
    } else {
        sqlx::query_as(
            "SELECT COUNT(*) FROM banned_machines WHERE created_by = ?"
        )
        .bind(user_id.0)
        .fetch_one(&state.db)
        .await?
    };

    let items: Vec<BannedMachine> = if has_search {
        sqlx::query_as(
            "SELECT * FROM banned_machines WHERE created_by = ? AND (machine_code LIKE ? OR reason LIKE ?) ORDER BY created_at DESC LIMIT ? OFFSET ?"
        )
        .bind(user_id.0)
        .bind(&search_pattern)
        .bind(&search_pattern)
        .bind(page_size)
        .bind(offset)
        .fetch_all(&state.db)
        .await?
    } else {
        sqlx::query_as(
            "SELECT * FROM banned_machines WHERE created_by = ? ORDER BY created_at DESC LIMIT ? OFFSET ?"
        )
        .bind(user_id.0)
        .bind(page_size)
        .bind(offset)
        .fetch_all(&state.db)
        .await?
    };

    Ok(Json(serde_json::json!({
        "success": true,
        "data": {
            "items": items,
            "total": total,
            "page": page,
            "page_size": page_size,
        },
    })))
}
