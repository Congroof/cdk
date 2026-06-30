use axum::extract::{Path, State};
use axum::Json;

use crate::errors::AppError;
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
