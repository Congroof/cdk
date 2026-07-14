use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize)]
pub struct Feedback {
    pub id: i64,
    pub feedback_type: String,
    pub content: String,
    pub contact: Option<String>,
    pub machine_code: Option<String>,
    pub cdk_code: Option<String>,
    pub app_version: Option<String>,
    pub platform: Option<String>,
    pub metadata: Option<serde_json::Value>,
    pub reply: Option<String>,
    pub replied_at: Option<chrono::NaiveDateTime>,
    pub created_by: Option<i64>,
    pub is_done: bool,
    pub done_at: Option<chrono::NaiveDateTime>,
    pub created_at: chrono::NaiveDateTime,
}

#[derive(Debug, sqlx::FromRow)]
pub struct FeedbackRow {
    pub id: i64,
    pub feedback_type: String,
    pub content: String,
    pub contact: Option<String>,
    pub machine_code: Option<String>,
    pub cdk_code: Option<String>,
    pub app_version: Option<String>,
    pub platform: Option<String>,
    pub metadata: Option<String>,
    pub reply: Option<String>,
    pub replied_at: Option<chrono::NaiveDateTime>,
    pub created_by: Option<i64>,
    pub is_done: bool,
    pub done_at: Option<chrono::NaiveDateTime>,
    pub created_at: chrono::NaiveDateTime,
}

impl From<FeedbackRow> for Feedback {
    fn from(row: FeedbackRow) -> Self {
        let metadata = row
            .metadata
            .and_then(|value| serde_json::from_str::<serde_json::Value>(&value).ok());

        Feedback {
            id: row.id,
            feedback_type: row.feedback_type,
            content: row.content,
            contact: row.contact,
            machine_code: row.machine_code,
            cdk_code: row.cdk_code,
            app_version: row.app_version,
            platform: row.platform,
            metadata,
            reply: row.reply,
            replied_at: row.replied_at,
            created_by: row.created_by,
            is_done: row.is_done,
            done_at: row.done_at,
            created_at: row.created_at,
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct SubmitFeedbackRequest {
    pub feedback_type: Option<String>,
    pub content: String,
    pub contact: Option<String>,
    pub machine_code: Option<String>,
    pub cdk_code: Option<String>,
    pub app_version: Option<String>,
    pub platform: Option<String>,
    pub metadata: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
pub struct FeedbackListQuery {
    pub page: Option<u32>,
    pub page_size: Option<u32>,
    pub feedback_type: Option<String>,
    pub is_done: Option<bool>,
    pub search: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct SetFeedbackDoneRequest {
    pub id: i64,
    pub is_done: bool,
}

#[derive(Debug, Deserialize)]
pub struct ClientFeedbackQueryRequest {
    pub machine_code: String,
    pub page: Option<u32>,
    pub page_size: Option<u32>,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct ClientFeedbackItem {
    pub id: i64,
    pub feedback_type: String,
    pub content: String,
    pub is_done: bool,
    pub reply: Option<String>,
    pub replied_at: Option<chrono::NaiveDateTime>,
    pub done_at: Option<chrono::NaiveDateTime>,
    pub created_at: chrono::NaiveDateTime,
}

#[derive(Debug, Deserialize)]
pub struct ReplyFeedbackRequest {
    pub id: i64,
    pub reply: String,
}
