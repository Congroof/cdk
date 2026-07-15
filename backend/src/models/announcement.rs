use chrono::NaiveDateTime;
use serde::{Deserialize, Serialize};
use sqlx::FromRow;

#[derive(Debug, Serialize, FromRow)]
pub struct Announcement {
    pub title: String,
    pub content: String,
    pub is_enabled: bool,
    pub updated_at: NaiveDateTime,
}

#[derive(Debug, Serialize, FromRow)]
pub struct PublicAnnouncement {
    pub title: String,
    pub content: String,
    pub updated_at: NaiveDateTime,
}

#[derive(Debug, Deserialize)]
pub struct SaveAnnouncementRequest {
    pub title: String,
    pub content: String,
    pub is_enabled: bool,
}
