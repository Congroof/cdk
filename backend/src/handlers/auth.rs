use axum::extract::State;
use axum::Json;
use jsonwebtoken::{encode, EncodingKey, Header};

use crate::errors::AppError;
use crate::middleware::auth::Claims;
use crate::models::user::{LoginRequest, LoginResponse};
use crate::AppState;

pub async fn login(
    State(state): State<AppState>,
    Json(payload): Json<LoginRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    let user = sqlx::query_as::<_, (i64, String, String)>(
        "SELECT id, username, password_hash FROM users WHERE username = ?"
    )
    .bind(&payload.username)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::Unauthorized("用户名或密码错误".to_string()))?;

    let valid = bcrypt::verify(&payload.password, &user.2)
        .map_err(|_| AppError::Internal("密码验证失败".to_string()))?;

    if !valid {
        return Err(AppError::Unauthorized("用户名或密码错误".to_string()));
    }

    let expiration = chrono::Utc::now()
        .checked_add_signed(chrono::Duration::hours(24))
        .expect("valid timestamp")
        .timestamp() as usize;

    let claims = Claims {
        sub: user.1.clone(),
        exp: expiration,
    };

    let token = encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(state.jwt_secret.as_bytes()),
    )?;

    Ok(Json(serde_json::json!({
        "success": true,
        "data": LoginResponse { token },
    })))
}
