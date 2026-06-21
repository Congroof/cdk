use axum::extract::{Query, State};
use axum::{Extension, Json};
use chrono::Utc;
use rand::Rng;

use crate::errors::AppError;
use crate::middleware::auth::Claims;
use crate::models::cdk::*;
use crate::AppState;

pub async fn usage_stats(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Query(params): Query<UsageStatsQuery>,
) -> Result<Json<serde_json::Value>, AppError> {
    let user_id: (i64,) = sqlx::query_as(
        "SELECT id FROM users WHERE username = ?"
    )
    .bind(&claims.sub)
    .fetch_one(&state.db)
    .await?;

    let days = params.days.unwrap_or(30).max(1).min(365);
    let now = Utc::now().naive_utc();
    let since = now - chrono::Duration::days(days as i64);
    let today_str = now.format("%Y-%m-%d").to_string();

    let (unique_machines,): (i64,) = sqlx::query_as(
        "SELECT COUNT(DISTINCT machine_code) FROM usage_logs WHERE created_by = ? AND created_at >= ?"
    )
    .bind(user_id.0)
    .bind(since)
    .fetch_one(&state.db)
    .await?;

    let (active_today,): (i64,) = sqlx::query_as(
        "SELECT COUNT(DISTINCT machine_code) FROM usage_logs WHERE created_by = ? AND DATE(created_at) = ?"
    )
    .bind(user_id.0)
    .bind(&today_str)
    .fetch_one(&state.db)
    .await?;

    let (total_requests,): (i64,) = sqlx::query_as(
        "SELECT COUNT(*) FROM usage_logs WHERE created_by = ? AND created_at >= ?"
    )
    .bind(user_id.0)
    .bind(since)
    .fetch_one(&state.db)
    .await?;

    let has_search = params.search.as_ref().is_some_and(|s| !s.is_empty());
    let search_pattern = params.search.as_ref()
        .map(|s| format!("%{}%", s))
        .unwrap_or_default();

    let machine_rows: Vec<(String, i64, chrono::NaiveDateTime, chrono::NaiveDateTime, i64, i64)> = if has_search {
        sqlx::query_as(
            "SELECT machine_code, COUNT(DISTINCT cdk_code), \
             MIN(created_at), MAX(created_at), \
             COUNT(DISTINCT DATE(created_at)), COUNT(*) \
             FROM usage_logs WHERE created_by = ? AND created_at >= ? AND machine_code LIKE ? \
             GROUP BY machine_code ORDER BY MAX(created_at) DESC"
        )
        .bind(user_id.0)
        .bind(since)
        .bind(&search_pattern)
        .fetch_all(&state.db)
        .await?
    } else {
        sqlx::query_as(
            "SELECT machine_code, COUNT(DISTINCT cdk_code), \
             MIN(created_at), MAX(created_at), \
             COUNT(DISTINCT DATE(created_at)), COUNT(*) \
             FROM usage_logs WHERE created_by = ? AND created_at >= ? \
             GROUP BY machine_code ORDER BY MAX(created_at) DESC"
        )
        .bind(user_id.0)
        .bind(since)
        .fetch_all(&state.db)
        .await?
    };

    let machines: Vec<MachineStats> = machine_rows.into_iter().map(|r| MachineStats {
        machine_code: r.0,
        cdk_count: r.1,
        first_seen: r.2,
        last_seen: r.3,
        active_days: r.4,
        total_requests: r.5,
    }).collect();

    let trend_rows: Vec<(String, i64, i64)> = sqlx::query_as(
        "SELECT DATE_FORMAT(created_at, '%Y-%m-%d'), COUNT(*), \
         COUNT(DISTINCT machine_code) \
         FROM usage_logs WHERE created_by = ? AND created_at >= ? \
         GROUP BY DATE_FORMAT(created_at, '%Y-%m-%d') ORDER BY DATE_FORMAT(created_at, '%Y-%m-%d') ASC"
    )
    .bind(user_id.0)
    .bind(since)
    .fetch_all(&state.db)
    .await?;

    let daily_trend: Vec<DailyTrend> = trend_rows.into_iter().map(|r| DailyTrend {
        date: r.0,
        requests: r.1,
        unique_machines: r.2,
    }).collect();

    Ok(Json(serde_json::json!({
        "success": true,
        "data": {
            "overview": {
                "unique_machines": unique_machines,
                "active_today": active_today,
                "total_requests": total_requests,
            },
            "machines": machines,
            "daily_trend": daily_trend,
        },
    })))
}

pub async fn machine_usage(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Query(params): Query<MachineUsageQuery>,
) -> Result<Json<serde_json::Value>, AppError> {
    let user_id: (i64,) = sqlx::query_as(
        "SELECT id FROM users WHERE username = ?"
    )
    .bind(&claims.sub)
    .fetch_one(&state.db)
    .await?;

    let days = params.days.unwrap_or(30).max(1).min(365);
    let since = Utc::now().naive_utc() - chrono::Duration::days(days as i64);

    let daily_rows: Vec<(String, i64, chrono::NaiveDateTime, chrono::NaiveDateTime)> = sqlx::query_as(
        "SELECT DATE_FORMAT(created_at, '%Y-%m-%d'), COUNT(*), \
         MIN(created_at), MAX(created_at) \
         FROM usage_logs WHERE created_by = ? AND machine_code = ? AND created_at >= ? \
         GROUP BY DATE_FORMAT(created_at, '%Y-%m-%d') \
         ORDER BY DATE_FORMAT(created_at, '%Y-%m-%d') DESC"
    )
    .bind(user_id.0)
    .bind(&params.machine_code)
    .bind(since)
    .fetch_all(&state.db)
    .await?;

    let daily_usage: Vec<serde_json::Value> = daily_rows.into_iter().map(|r| {
        let duration_minutes = (r.3 - r.2).num_minutes();
        serde_json::json!({
            "date": r.0,
            "requests": r.1,
            "first_active": r.2,
            "last_active": r.3,
            "duration_minutes": duration_minutes,
        })
    }).collect();

    let cdk_rows: Vec<(String, i64, chrono::NaiveDateTime)> = sqlx::query_as(
        "SELECT cdk_code, COUNT(*), MAX(created_at) \
         FROM usage_logs WHERE created_by = ? AND machine_code = ? AND created_at >= ? \
         GROUP BY cdk_code ORDER BY MAX(created_at) DESC"
    )
    .bind(user_id.0)
    .bind(&params.machine_code)
    .bind(since)
    .fetch_all(&state.db)
    .await?;

    let cdks: Vec<serde_json::Value> = cdk_rows.into_iter().map(|r| {
        serde_json::json!({
            "code": r.0,
            "requests": r.1,
            "last_used": r.2,
        })
    }).collect();

    Ok(Json(serde_json::json!({
        "success": true,
        "data": {
            "machine_code": params.machine_code,
            "daily_usage": daily_usage,
            "cdks": cdks,
        },
    })))
}

fn generate_license_key() -> String {
    let mut rng = rand::thread_rng();
    let chars: Vec<char> = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789abcdefghjkmnpqrstuvwxyz".chars().collect();
    let segment = |rng: &mut rand::rngs::ThreadRng, len: usize| -> String {
        (0..len).map(|_| chars[rng.gen_range(0..chars.len())]).collect()
    };
    format!(
        "{}-{}-{}-{}-{}",
        segment(&mut rng, 5),
        segment(&mut rng, 5),
        segment(&mut rng, 5),
        segment(&mut rng, 5),
        segment(&mut rng, 5),
    )
}

pub async fn generate(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Json(payload): Json<GenerateRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    if payload.count == 0 || payload.count > 100 {
        return Err(AppError::BadRequest("生成数量须在 1-100 之间".to_string()));
    }
    if payload.valid_duration <= 0 {
        return Err(AppError::BadRequest("有效时长须大于 0".to_string()));
    }

    let unit = payload.valid_unit.as_deref().unwrap_or("days");
    if unit != "days" && unit != "hours" {
        return Err(AppError::BadRequest("单位须为 days 或 hours".to_string()));
    }

    let user_id: (i64,) = sqlx::query_as(
        "SELECT id FROM users WHERE username = ?"
    )
    .bind(&claims.sub)
    .fetch_one(&state.db)
    .await?;

    let mut codes = Vec::new();
    for _ in 0..payload.count {
        let code = generate_license_key();
        sqlx::query(
            "INSERT INTO cdkeys (code, valid_duration, valid_unit, status, remark, created_by) VALUES (?, ?, ?, 'unused', ?, ?)"
        )
        .bind(&code)
        .bind(payload.valid_duration)
        .bind(unit)
        .bind(&payload.remark)
        .bind(user_id.0)
        .execute(&state.db)
        .await?;
        codes.push(code);
    }

    Ok(Json(serde_json::json!({
        "success": true,
        "data": { "codes": codes, "count": codes.len() },
    })))
}

pub async fn list(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Query(params): Query<ListQuery>,
) -> Result<Json<serde_json::Value>, AppError> {
    let now = Utc::now().naive_utc();

    let user_id: (i64,) = sqlx::query_as(
        "SELECT id FROM users WHERE username = ?"
    )
    .bind(&claims.sub)
    .fetch_one(&state.db)
    .await?;
    
    // 动态更新已过期的 CDK 状态
    sqlx::query("UPDATE cdkeys SET status = 'expired' WHERE status = 'activated' AND expires_at IS NOT NULL AND expires_at < ? AND created_by = ?")
        .bind(now)
        .bind(user_id.0)
        .execute(&state.db)
        .await?;

    let page = params.page.unwrap_or(1).max(1);
    let page_size = params.page_size.unwrap_or(10).min(50);
    let offset = (page - 1) * page_size;

    let valid_statuses = ["unused", "activated", "expired", "disabled"];
    let has_status = params.status.as_ref()
        .is_some_and(|s| !s.is_empty() && valid_statuses.contains(&s.as_str()));
    let has_search = params.search.as_ref().is_some_and(|s| !s.is_empty());

    let mut conditions = vec!["created_by = ?".to_string()];
    if has_status {
        conditions.push("status = ?".to_string());
    }
    if has_search {
        conditions.push("(code LIKE ? OR machine_code LIKE ? OR remark LIKE ?)".to_string());
    }

    let where_clause = format!(" WHERE {}", conditions.join(" AND "));

    let count_sql = format!("SELECT COUNT(*) FROM cdkeys{}", where_clause);
    let data_sql = format!(
        "SELECT * FROM cdkeys{} ORDER BY created_at DESC LIMIT ? OFFSET ?",
        where_clause
    );

    let search_pattern = params.search.as_ref()
        .map(|s| format!("%{}%", s))
        .unwrap_or_default();

    macro_rules! bind_filters {
        ($q:expr) => {{
            let mut q = $q.bind(user_id.0);
            if has_status {
                q = q.bind(params.status.as_ref().unwrap());
            }
            if has_search {
                q = q.bind(&search_pattern).bind(&search_pattern).bind(&search_pattern);
            }
            q
        }};
    }

    let total: (i64,) = bind_filters!(sqlx::query_as(&count_sql))
        .fetch_one(&state.db)
        .await?;

    let rows: Vec<CdkRow> = bind_filters!(sqlx::query_as(&data_sql))
        .bind(page_size)
        .bind(offset)
        .fetch_all(&state.db)
        .await?;

    let items: Vec<Cdk> = rows.into_iter().map(Cdk::from).collect();

    Ok(Json(serde_json::json!({
        "success": true,
        "data": {
            "items": items,
            "total": total.0,
            "page": page,
            "page_size": page_size,
        },
    })))
}

pub async fn validate(
    State(state): State<AppState>,
    Json(payload): Json<ValidateRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    let admin_id: (i64,) = sqlx::query_as(
        "SELECT id FROM users WHERE username = 'admin'"
    )
    .fetch_one(&state.db)
    .await?;

    if let Some(ref mc) = payload.machine_code {
        let banned: Option<(i64,)> = sqlx::query_as(
            "SELECT id FROM banned_machines WHERE machine_code = ? AND created_by = ?"
        )
        .bind(mc)
        .bind(admin_id.0)
        .fetch_optional(&state.db)
        .await?;
        if banned.is_some() {
            return Err(AppError::BadRequest("该机器码已被封禁，无法验证".to_string()));
        }

        let _ = sqlx::query(
            "INSERT INTO usage_logs (machine_code, cdk_code, action, created_by) VALUES (?, ?, 'validate', ?)"
        )
        .bind(mc)
        .bind(&payload.code)
        .bind(admin_id.0)
        .execute(&state.db)
        .await;
    }

    let row = sqlx::query_as::<_, CdkRow>(
        "SELECT * FROM cdkeys WHERE code = ? AND (created_by = ? OR created_by IS NULL)"
    )
    .bind(&payload.code)
    .bind(admin_id.0)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::NotFound("CDK 不存在".to_string()))?;

    let cdk = Cdk::from(row);

    let response = match cdk.status {
        CdkStatus::Disabled => ValidateResponse {
            valid: false,
            status: Some(CdkStatus::Disabled),
            expires_at: cdk.expires_at,
            message: "CDK 已被禁用".to_string(),
        },
        CdkStatus::Unused => ValidateResponse {
            valid: true,
            status: Some(CdkStatus::Unused),
            expires_at: None,
            message: "CDK 有效，尚未激活".to_string(),
        },
        CdkStatus::Activated => {
            if let Some(expires_at) = cdk.expires_at {
                if Utc::now().naive_utc() > expires_at {
                    sqlx::query("UPDATE cdkeys SET status = 'expired' WHERE id = ?")
                        .bind(cdk.id)
                        .execute(&state.db)
                        .await?;
                    ValidateResponse {
                        valid: false,
                        status: Some(CdkStatus::Expired),
                        expires_at: Some(expires_at),
                        message: "CDK 已过期".to_string(),
                    }
                } else {
                    let machine_match = payload.machine_code.as_ref()
                        .map(|mc| cdk.machine_code.as_ref() == Some(mc))
                        .unwrap_or(true);
                    ValidateResponse {
                        valid: machine_match,
                        status: Some(CdkStatus::Activated),
                        expires_at: Some(expires_at),
                        message: if machine_match {
                            "CDK 有效".to_string()
                        } else {
                            "机器码不匹配，但支持换绑".to_string()
                        },
                    }
                }
            } else {
                ValidateResponse {
                    valid: true,
                    status: Some(CdkStatus::Activated),
                    expires_at: None,
                    message: "CDK 有效".to_string(),
                }
            }
        }
        CdkStatus::Expired => ValidateResponse {
            valid: false,
            status: Some(CdkStatus::Expired),
            expires_at: cdk.expires_at,
            message: "CDK 已过期".to_string(),
        },
    };

    Ok(Json(serde_json::json!({
        "success": true,
        "data": response,
    })))
}

pub async fn activate(
    State(state): State<AppState>,
    Json(payload): Json<ActivateRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    if payload.code.is_empty() || payload.machine_code.is_empty() {
        return Err(AppError::BadRequest("激活码和机器码不能为空".to_string()));
    }

    let admin_id: (i64,) = sqlx::query_as(
        "SELECT id FROM users WHERE username = 'admin'"
    )
    .fetch_one(&state.db)
    .await?;

    let banned: Option<(i64,)> = sqlx::query_as(
        "SELECT id FROM banned_machines WHERE machine_code = ? AND created_by = ?"
    )
    .bind(&payload.machine_code)
    .bind(admin_id.0)
    .fetch_optional(&state.db)
    .await?;
    if banned.is_some() {
        return Err(AppError::BadRequest("该机器码已被封禁，无法激活".to_string()));
    }

    let _ = sqlx::query(
        "INSERT INTO usage_logs (machine_code, cdk_code, action, created_by) VALUES (?, ?, 'activate', ?)"
    )
    .bind(&payload.machine_code)
    .bind(&payload.code)
    .bind(admin_id.0)
    .execute(&state.db)
    .await;

    let row = sqlx::query_as::<_, CdkRow>(
        "SELECT * FROM cdkeys WHERE code = ? AND (created_by = ? OR created_by IS NULL)"
    )
    .bind(&payload.code)
    .bind(admin_id.0)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::NotFound("CDK 不存在".to_string()))?;

    let hours = row.duration_as_hours();
    let cdk = Cdk::from(row);

    match cdk.status {
        CdkStatus::Disabled => {
            return Err(AppError::BadRequest("CDK 已被禁用".to_string()));
        }
        CdkStatus::Expired => {
            return Err(AppError::BadRequest("CDK 已过期".to_string()));
        }
        CdkStatus::Activated => {
            if let Some(expires_at) = cdk.expires_at {
                if Utc::now().naive_utc() > expires_at {
                    sqlx::query("UPDATE cdkeys SET status = 'expired' WHERE id = ?")
                        .bind(cdk.id)
                        .execute(&state.db)
                        .await?;
                    return Err(AppError::BadRequest("CDK 已过期".to_string()));
                }
            }
            if cdk.machine_code.as_deref() == Some(&payload.machine_code) {
                return Ok(Json(serde_json::json!({
                    "success": true,
                    "data": {
                        "message": "CDK 已激活于此机器",
                        "expires_at": cdk.expires_at,
                    },
                })));
            }
            
            // 允许换绑：更新机器码
            let result = sqlx::query(
                "UPDATE cdkeys SET machine_code = ? WHERE id = ?"
            )
            .bind(&payload.machine_code)
            .bind(cdk.id)
            .execute(&state.db)
            .await?;

            if result.rows_affected() == 0 {
                return Err(AppError::Conflict("CDK 状态已变更，请重试".to_string()));
            }

            return Ok(Json(serde_json::json!({
                "success": true,
                "data": {
                    "message": "CDK 换绑成功",
                    "expires_at": cdk.expires_at,
                },
            })));
        }
        CdkStatus::Unused => {}
    }

    let now = Utc::now().naive_utc();
    let expires_at = now + chrono::Duration::hours(hours);

    let result = sqlx::query(
        "UPDATE cdkeys SET status = 'activated', machine_code = ?, activated_at = ?, expires_at = ? WHERE id = ? AND status = 'unused'"
    )
    .bind(&payload.machine_code)
    .bind(now)
    .bind(expires_at)
    .bind(cdk.id)
    .execute(&state.db)
    .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::Conflict("CDK 状态已变更，请重试".to_string()));
    }

    Ok(Json(serde_json::json!({
        "success": true,
        "data": {
            "message": "CDK 激活成功",
            "expires_at": expires_at,
        },
    })))
}

pub async fn disable(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Json(payload): Json<DisableRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    let user_id: (i64,) = sqlx::query_as(
        "SELECT id FROM users WHERE username = ?"
    )
    .bind(&claims.sub)
    .fetch_one(&state.db)
    .await?;

    let result = sqlx::query(
        "UPDATE cdkeys SET status = 'disabled' WHERE code = ? AND status != 'disabled' AND created_by = ?"
    )
    .bind(&payload.code)
    .bind(user_id.0)
    .execute(&state.db)
    .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("CDK 不存在或已被禁用".to_string()));
    }

    Ok(Json(serde_json::json!({
        "success": true,
        "data": { "message": "CDK 已禁用" },
    })))
}

pub async fn stats(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
) -> Result<Json<serde_json::Value>, AppError> {
    let now = Utc::now().naive_utc();

    let user_id: (i64,) = sqlx::query_as(
        "SELECT id FROM users WHERE username = ?"
    )
    .bind(&claims.sub)
    .fetch_one(&state.db)
    .await?;
    
    // 动态更新已过期的 CDK 状态
    sqlx::query("UPDATE cdkeys SET status = 'expired' WHERE status = 'activated' AND expires_at IS NOT NULL AND expires_at < ? AND created_by = ?")
        .bind(now)
        .bind(user_id.0)
        .execute(&state.db)
        .await?;

    let rows: Vec<(String, i64)> = sqlx::query_as(
        "SELECT status, COUNT(*) FROM cdkeys WHERE created_by = ? GROUP BY status"
    )
    .bind(user_id.0)
    .fetch_all(&state.db)
    .await?;

    let mut total: i64 = 0;
    let mut unused: i64 = 0;
    let mut activated: i64 = 0;
    let mut expired: i64 = 0;
    let mut disabled: i64 = 0;

    for (status, count) in &rows {
        total += count;
        match status.as_str() {
            "unused" => unused = *count,
            "activated" => activated = *count,
            "expired" => expired = *count,
            "disabled" => disabled = *count,
            _ => {}
        }
    }

    Ok(Json(serde_json::json!({
        "success": true,
        "data": { "total": total, "unused": unused, "activated": activated, "expired": expired, "disabled": disabled },
    })))
}

pub async fn export(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Query(params): Query<ExportQuery>,
) -> Result<Json<serde_json::Value>, AppError> {
    let now = Utc::now().naive_utc();

    let user_id: (i64,) = sqlx::query_as(
        "SELECT id FROM users WHERE username = ?"
    )
    .bind(&claims.sub)
    .fetch_one(&state.db)
    .await?;
    
    // 动态更新已过期的 CDK 状态
    sqlx::query("UPDATE cdkeys SET status = 'expired' WHERE status = 'activated' AND expires_at IS NOT NULL AND expires_at < ? AND created_by = ?")
        .bind(now)
        .bind(user_id.0)
        .execute(&state.db)
        .await?;

    let valid_statuses = ["unused", "activated", "expired", "disabled"];
    let has_status = params.status.as_ref()
        .is_some_and(|s| !s.is_empty() && valid_statuses.contains(&s.as_str()));
    let has_from = params.date_from.as_ref().is_some_and(|s| !s.is_empty());
    let has_to = params.date_to.as_ref().is_some_and(|s| !s.is_empty());

    let mut conditions = vec!["created_by = ?".to_string()];
    if has_status { conditions.push("status = ?".to_string()); }
    if has_from { conditions.push("created_at >= ?".to_string()); }
    if has_to { conditions.push("created_at < DATE_ADD(?, INTERVAL 1 DAY)".to_string()); }

    let where_clause = format!(" WHERE {}", conditions.join(" AND "));

    let sql = format!("SELECT * FROM cdkeys{} ORDER BY created_at DESC LIMIT 10000", where_clause);
    let mut query = sqlx::query_as::<_, CdkRow>(&sql).bind(user_id.0);

    if has_status { query = query.bind(params.status.as_ref().unwrap()); }
    if has_from { query = query.bind(params.date_from.as_ref().unwrap()); }
    if has_to { query = query.bind(params.date_to.as_ref().unwrap()); }

    let rows = query.fetch_all(&state.db).await?;
    let items: Vec<Cdk> = rows.into_iter().map(Cdk::from).collect();

    Ok(Json(serde_json::json!({
        "success": true,
        "data": { "items": items },
    })))
}

pub async fn user_validate(
    State(state): State<AppState>,
    axum::extract::Path(username): axum::extract::Path<String>,
    Json(payload): Json<ValidateRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    let owner_id: (i64,) = sqlx::query_as(
        "SELECT id FROM users WHERE username = ?"
    )
    .bind(&username)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::NotFound("CDK 不存在".to_string()))?;

    if let Some(ref mc) = payload.machine_code {
        let banned: Option<(i64,)> = sqlx::query_as(
            "SELECT id FROM banned_machines WHERE machine_code = ? AND created_by = ?"
        )
        .bind(mc)
        .bind(owner_id.0)
        .fetch_optional(&state.db)
        .await?;
        if banned.is_some() {
            return Err(AppError::BadRequest("该机器码已被封禁，无法验证".to_string()));
        }

        let _ = sqlx::query(
            "INSERT INTO usage_logs (machine_code, cdk_code, action, created_by) VALUES (?, ?, 'validate', ?)"
        )
        .bind(mc)
        .bind(&payload.code)
        .bind(owner_id.0)
        .execute(&state.db)
        .await;
    }

    let row = sqlx::query_as::<_, CdkRow>(
        "SELECT * FROM cdkeys WHERE code = ? AND created_by = ?"
    )
    .bind(&payload.code)
    .bind(owner_id.0)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::NotFound("CDK 不存在".to_string()))?;

    let cdk = Cdk::from(row);

    let response = match cdk.status {
        CdkStatus::Disabled => ValidateResponse {
            valid: false,
            status: Some(CdkStatus::Disabled),
            expires_at: cdk.expires_at,
            message: "CDK 已被禁用".to_string(),
        },
        CdkStatus::Unused => ValidateResponse {
            valid: true,
            status: Some(CdkStatus::Unused),
            expires_at: None,
            message: "CDK 有效，尚未激活".to_string(),
        },
        CdkStatus::Activated => {
            if let Some(expires_at) = cdk.expires_at {
                if Utc::now().naive_utc() > expires_at {
                    sqlx::query("UPDATE cdkeys SET status = 'expired' WHERE id = ?")
                        .bind(cdk.id)
                        .execute(&state.db)
                        .await?;
                    ValidateResponse {
                        valid: false,
                        status: Some(CdkStatus::Expired),
                        expires_at: Some(expires_at),
                        message: "CDK 已过期".to_string(),
                    }
                } else {
                    let machine_match = payload.machine_code.as_ref()
                        .map(|mc| cdk.machine_code.as_ref() == Some(mc))
                        .unwrap_or(true);
                    ValidateResponse {
                        valid: machine_match,
                        status: Some(CdkStatus::Activated),
                        expires_at: Some(expires_at),
                        message: if machine_match {
                            "CDK 有效".to_string()
                        } else {
                            "机器码不匹配，但支持换绑".to_string()
                        },
                    }
                }
            } else {
                ValidateResponse {
                    valid: true,
                    status: Some(CdkStatus::Activated),
                    expires_at: None,
                    message: "CDK 有效".to_string(),
                }
            }
        }
        CdkStatus::Expired => ValidateResponse {
            valid: false,
            status: Some(CdkStatus::Expired),
            expires_at: cdk.expires_at,
            message: "CDK 已过期".to_string(),
        },
    };

    Ok(Json(serde_json::json!({
        "success": true,
        "data": response,
    })))
}

pub async fn user_activate(
    State(state): State<AppState>,
    axum::extract::Path(username): axum::extract::Path<String>,
    Json(payload): Json<ActivateRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    if payload.code.is_empty() || payload.machine_code.is_empty() {
        return Err(AppError::BadRequest("激活码和机器码不能为空".to_string()));
    }

    let owner_id: (i64,) = sqlx::query_as(
        "SELECT id FROM users WHERE username = ?"
    )
    .bind(&username)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::NotFound("CDK 不存在".to_string()))?;

    let banned: Option<(i64,)> = sqlx::query_as(
        "SELECT id FROM banned_machines WHERE machine_code = ? AND created_by = ?"
    )
    .bind(&payload.machine_code)
    .bind(owner_id.0)
    .fetch_optional(&state.db)
    .await?;
    if banned.is_some() {
        return Err(AppError::BadRequest("该机器码已被封禁，无法激活".to_string()));
    }

    let _ = sqlx::query(
        "INSERT INTO usage_logs (machine_code, cdk_code, action, created_by) VALUES (?, ?, 'activate', ?)"
    )
    .bind(&payload.machine_code)
    .bind(&payload.code)
    .bind(owner_id.0)
    .execute(&state.db)
    .await;

    let row = sqlx::query_as::<_, CdkRow>(
        "SELECT * FROM cdkeys WHERE code = ? AND created_by = ?"
    )
    .bind(&payload.code)
    .bind(owner_id.0)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::NotFound("CDK 不存在".to_string()))?;

    let hours = row.duration_as_hours();
    let cdk = Cdk::from(row);

    match cdk.status {
        CdkStatus::Disabled => {
            return Err(AppError::BadRequest("CDK 已被禁用".to_string()));
        }
        CdkStatus::Expired => {
            return Err(AppError::BadRequest("CDK 已过期".to_string()));
        }
        CdkStatus::Activated => {
            if let Some(expires_at) = cdk.expires_at {
                if Utc::now().naive_utc() > expires_at {
                    sqlx::query("UPDATE cdkeys SET status = 'expired' WHERE id = ?")
                        .bind(cdk.id)
                        .execute(&state.db)
                        .await?;
                    return Err(AppError::BadRequest("CDK 已过期".to_string()));
                }
            }
            if cdk.machine_code.as_deref() == Some(&payload.machine_code) {
                return Ok(Json(serde_json::json!({
                    "success": true,
                    "data": {
                        "message": "CDK 已激活于此机器",
                        "expires_at": cdk.expires_at,
                    },
                })));
            }
            
            let result = sqlx::query(
                "UPDATE cdkeys SET machine_code = ? WHERE id = ?"
            )
            .bind(&payload.machine_code)
            .bind(cdk.id)
            .execute(&state.db)
            .await?;

            if result.rows_affected() == 0 {
                return Err(AppError::Conflict("CDK 状态已变更，请重试".to_string()));
            }

            return Ok(Json(serde_json::json!({
                "success": true,
                "data": {
                    "message": "CDK 换绑成功",
                    "expires_at": cdk.expires_at,
                },
            })));
        }
        CdkStatus::Unused => {}
    }

    let now = Utc::now().naive_utc();
    let expires_at = now + chrono::Duration::hours(hours);

    let result = sqlx::query(
        "UPDATE cdkeys SET status = 'activated', machine_code = ?, activated_at = ?, expires_at = ? WHERE id = ? AND status = 'unused'"
    )
    .bind(&payload.machine_code)
    .bind(now)
    .bind(expires_at)
    .bind(cdk.id)
    .execute(&state.db)
    .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::Conflict("CDK 状态已变更，请重试".to_string()));
    }

    Ok(Json(serde_json::json!({
        "success": true,
        "data": {
            "message": "CDK 激活成功",
            "expires_at": expires_at,
        },
    })))
}
