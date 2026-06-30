use serde::Deserialize;

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
