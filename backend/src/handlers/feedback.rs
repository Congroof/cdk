use axum::extract::{Path, Query, State};
use axum::{Extension, Json};
use chrono::Utc;

use crate::errors::AppError;
use crate::middleware::auth::Claims;
use crate::models::feedback::*;
use crate::AppState;

const DEFAULT_FEEDBACK_TYPE: &str = "general";
const MAX_FEEDBACK_TYPE_LEN: usize = 32;
const MAX_CONTENT_LEN: usize = 5000;
const MAX_CONTACT_LEN: usize = 128;
const MAX_MACHINE_CODE_LEN: usize = 256;
const MAX_CDK_CODE_LEN: usize = 64;
const MAX_APP_VERSION_LEN: usize = 64;
const MAX_PLATFORM_LEN: usize = 64;
const MAX_METADATA_LEN: usize = 10000;

pub async fn submit(
    State(state): State<AppState>,
    Json(payload): Json<SubmitFeedbackRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    insert_feedback(&state, None, payload).await
}

pub async fn submit_for_user(
    State(state): State<AppState>,
    Path(username): Path<String>,
    Json(payload): Json<SubmitFeedbackRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    let owner_id = sqlx::query_as::<_, (i64,)>("SELECT id FROM users WHERE username = ?")
        .bind(&username)
        .fetch_optional(&state.db)
        .await?
        .ok_or_else(|| AppError::NotFound("用户不存在".to_string()))?;

    insert_feedback(&state, Some(owner_id.0), payload).await
}

pub async fn list(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Query(params): Query<FeedbackListQuery>,
) -> Result<Json<serde_json::Value>, AppError> {
    let user_id: (i64,) = sqlx::query_as("SELECT id FROM users WHERE username = ?")
        .bind(&claims.sub)
        .fetch_one(&state.db)
        .await?;

    let page = params.page.unwrap_or(1).max(1);
    let page_size = params.page_size.unwrap_or(10).min(50);
    let offset = (page - 1) * page_size;
    let has_type = params
        .feedback_type
        .as_ref()
        .is_some_and(|value| !value.trim().is_empty());
    let has_search = params
        .search
        .as_ref()
        .is_some_and(|value| !value.trim().is_empty());
    let search_pattern = params
        .search
        .as_ref()
        .map(|value| format!("%{}%", value.trim()))
        .unwrap_or_default();

    let mut conditions = vec!["(created_by = ? OR created_by IS NULL)".to_string()];
    if has_type {
        conditions.push("feedback_type = ?".to_string());
    }
    if params.is_done.is_some() {
        conditions.push("is_done = ?".to_string());
    }
    if has_search {
        conditions.push(
            "(content LIKE ? OR contact LIKE ? OR machine_code LIKE ? OR cdk_code LIKE ?)"
                .to_string(),
        );
    }

    let where_clause = format!(" WHERE {}", conditions.join(" AND "));
    let count_sql = format!("SELECT COUNT(*) FROM user_feedback{}", where_clause);
    let data_sql = format!(
        "SELECT * FROM user_feedback{} ORDER BY is_done ASC, created_at DESC LIMIT ? OFFSET ?",
        where_clause
    );

    macro_rules! bind_filters {
        ($query:expr) => {{
            let mut query = $query.bind(user_id.0);
            if has_type {
                query = query.bind(params.feedback_type.as_ref().unwrap().trim());
            }
            if let Some(is_done) = params.is_done {
                query = query.bind(is_done);
            }
            if has_search {
                query = query
                    .bind(&search_pattern)
                    .bind(&search_pattern)
                    .bind(&search_pattern)
                    .bind(&search_pattern);
            }
            query
        }};
    }

    let total: (i64,) = bind_filters!(sqlx::query_as(&count_sql))
        .fetch_one(&state.db)
        .await?;

    let (pending,): (i64,) = sqlx::query_as(
        "SELECT COUNT(*) FROM user_feedback WHERE (created_by = ? OR created_by IS NULL) AND is_done = FALSE"
    )
    .bind(user_id.0)
    .fetch_one(&state.db)
    .await?;

    let (done,): (i64,) = sqlx::query_as(
        "SELECT COUNT(*) FROM user_feedback WHERE (created_by = ? OR created_by IS NULL) AND is_done = TRUE"
    )
    .bind(user_id.0)
    .fetch_one(&state.db)
    .await?;

    let rows: Vec<FeedbackRow> = bind_filters!(sqlx::query_as(&data_sql))
        .bind(page_size)
        .bind(offset)
        .fetch_all(&state.db)
        .await?;
    let items: Vec<Feedback> = rows.into_iter().map(Feedback::from).collect();

    Ok(Json(serde_json::json!({
        "success": true,
        "data": {
            "items": items,
            "total": total.0,
            "pending": pending,
            "done": done,
            "page": page,
            "page_size": page_size,
        },
    })))
}

pub async fn set_done(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Json(payload): Json<SetFeedbackDoneRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    let user_id: (i64,) = sqlx::query_as("SELECT id FROM users WHERE username = ?")
        .bind(&claims.sub)
        .fetch_one(&state.db)
        .await?;

    let done_at = if payload.is_done {
        Some(Utc::now().naive_utc())
    } else {
        None
    };
    let result = sqlx::query(
        "UPDATE user_feedback SET is_done = ?, done_at = ? WHERE id = ? AND (created_by = ? OR created_by IS NULL)"
    )
    .bind(payload.is_done)
    .bind(done_at)
    .bind(payload.id)
    .bind(user_id.0)
    .execute(&state.db)
    .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("反馈记录不存在".to_string()));
    }

    Ok(Json(serde_json::json!({
        "success": true,
        "data": {
            "message": if payload.is_done { "反馈已标记完成" } else { "反馈已标记待处理" },
        },
    })))
}

async fn insert_feedback(
    state: &AppState,
    owner_id: Option<i64>,
    payload: SubmitFeedbackRequest,
) -> Result<Json<serde_json::Value>, AppError> {
    let feedback_type = validate_optional_string(
        payload.feedback_type,
        DEFAULT_FEEDBACK_TYPE,
        MAX_FEEDBACK_TYPE_LEN,
        "反馈类型过长",
    )?;
    let content = payload.content.trim().to_string();
    if content.is_empty() {
        return Err(AppError::BadRequest("反馈内容不能为空".to_string()));
    }
    if content.chars().count() > MAX_CONTENT_LEN {
        return Err(AppError::BadRequest("反馈内容过长".to_string()));
    }

    let contact = validate_nullable_string(payload.contact, MAX_CONTACT_LEN, "联系方式过长")?;
    let machine_code =
        validate_nullable_string(payload.machine_code, MAX_MACHINE_CODE_LEN, "机器码过长")?;
    let cdk_code = validate_nullable_string(payload.cdk_code, MAX_CDK_CODE_LEN, "CDK 过长")?;
    let app_version =
        validate_nullable_string(payload.app_version, MAX_APP_VERSION_LEN, "应用版本过长")?;
    let platform = validate_nullable_string(payload.platform, MAX_PLATFORM_LEN, "平台信息过长")?;
    let metadata = serialize_metadata(payload.metadata)?;

    let result = sqlx::query(
        "INSERT INTO user_feedback \
         (feedback_type, content, contact, machine_code, cdk_code, app_version, platform, metadata, created_by) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&feedback_type)
    .bind(&content)
    .bind(&contact)
    .bind(&machine_code)
    .bind(&cdk_code)
    .bind(&app_version)
    .bind(&platform)
    .bind(&metadata)
    .bind(owner_id)
    .execute(&state.db)
    .await?;

    Ok(Json(serde_json::json!({
        "success": true,
        "data": {
            "id": result.last_insert_id(),
            "message": "反馈已提交",
        },
    })))
}

fn validate_optional_string(
    value: Option<String>,
    default_value: &str,
    max_len: usize,
    error_message: &str,
) -> Result<String, AppError> {
    let value = value
        .map(|item| item.trim().to_string())
        .filter(|item| !item.is_empty())
        .unwrap_or_else(|| default_value.to_string());

    if value.chars().count() > max_len {
        return Err(AppError::BadRequest(error_message.to_string()));
    }

    Ok(value)
}

fn validate_nullable_string(
    value: Option<String>,
    max_len: usize,
    error_message: &str,
) -> Result<Option<String>, AppError> {
    let value = value
        .map(|item| item.trim().to_string())
        .filter(|item| !item.is_empty());

    if value
        .as_ref()
        .is_some_and(|item| item.chars().count() > max_len)
    {
        return Err(AppError::BadRequest(error_message.to_string()));
    }

    Ok(value)
}

fn serialize_metadata(metadata: Option<serde_json::Value>) -> Result<Option<String>, AppError> {
    let Some(metadata) = metadata else {
        return Ok(None);
    };

    let value = serde_json::to_string(&metadata)
        .map_err(|_| AppError::BadRequest("扩展信息格式错误".to_string()))?;
    if value.chars().count() > MAX_METADATA_LEN {
        return Err(AppError::BadRequest("扩展信息过长".to_string()));
    }

    Ok(Some(value))
}
