use std::time::Duration;

use chrono::{DateTime, Days, FixedOffset, NaiveDate, TimeZone, Utc};
use sqlx::MySqlPool;

use crate::cdk_events::CdkUsageInterval;

pub const USAGE_CHECKPOINT_INTERVAL: Duration = Duration::from_secs(5 * 60);
const RETENTION_DAYS: i64 = 365;
const RETENTION_CLEANUP_INTERVAL: Duration = Duration::from_secs(24 * 60 * 60);
const CHINA_OFFSET_SECONDS: i32 = 8 * 60 * 60;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DailyUsageSegment {
    pub usage_date: NaiveDate,
    pub duration_seconds: i64,
    pub first_active: DateTime<Utc>,
    pub last_active: DateTime<Utc>,
}

pub async fn persist_interval(
    pool: &MySqlPool,
    interval: &CdkUsageInterval,
) -> Result<(), sqlx::Error> {
    for segment in split_interval(interval.started_at, interval.ended_at) {
        sqlx::query(
            "INSERT INTO cdk_usage_daily \
             (created_by, machine_code, usage_date, duration_seconds, first_active, last_active) \
             VALUES (?, ?, ?, ?, ?, ?) \
             ON DUPLICATE KEY UPDATE \
             duration_seconds = duration_seconds + VALUES(duration_seconds), \
             first_active = LEAST(first_active, VALUES(first_active)), \
             last_active = GREATEST(last_active, VALUES(last_active)), \
             updated_at = NOW()",
        )
        .bind(interval.owner_id)
        .bind(&interval.machine_code)
        .bind(segment.usage_date)
        .bind(segment.duration_seconds)
        .bind(segment.first_active.naive_utc())
        .bind(segment.last_active.naive_utc())
        .execute(pool)
        .await?;
    }

    Ok(())
}

pub async fn persist_intervals_best_effort(pool: &MySqlPool, intervals: &[CdkUsageInterval]) {
    for interval in intervals {
        if let Err(error) = persist_interval(pool, interval).await {
            tracing::error!("Persist CDK usage interval failed: {}", error);
        }
    }
}

pub fn split_interval(
    started_at: DateTime<Utc>,
    ended_at: DateTime<Utc>,
) -> Vec<DailyUsageSegment> {
    if ended_at <= started_at {
        return Vec::new();
    }

    let china = FixedOffset::east_opt(CHINA_OFFSET_SECONDS)
        .expect("Asia/Shanghai fixed offset must be valid");
    let mut cursor = started_at;
    let mut segments = Vec::new();

    while cursor < ended_at {
        let local_date = cursor.with_timezone(&china).date_naive();
        let next_date = local_date
            .checked_add_days(Days::new(1))
            .expect("usage date must have a following day");
        let next_midnight = china
            .from_local_datetime(
                &next_date
                    .and_hms_opt(0, 0, 0)
                    .expect("midnight must be a valid time"),
            )
            .single()
            .expect("fixed offset midnight must be unambiguous")
            .with_timezone(&Utc);
        let segment_end = ended_at.min(next_midnight);
        let duration_seconds = (segment_end - cursor).num_seconds();

        if duration_seconds > 0 {
            segments.push(DailyUsageSegment {
                usage_date: local_date,
                duration_seconds,
                first_active: cursor,
                last_active: segment_end,
            });
        }
        cursor = segment_end;
    }

    segments
}

pub fn china_date(at: DateTime<Utc>) -> NaiveDate {
    FixedOffset::east_opt(CHINA_OFFSET_SECONDS)
        .expect("Asia/Shanghai fixed offset must be valid")
        .from_utc_datetime(&at.naive_utc())
        .date_naive()
}

pub fn spawn_retention_cleanup(pool: MySqlPool) {
    tokio::spawn(async move {
        loop {
            if let Err(error) = cleanup_expired_usage(&pool).await {
                tracing::error!("Clean expired CDK usage data failed: {}", error);
            }
            tokio::time::sleep(RETENTION_CLEANUP_INTERVAL).await;
        }
    });
}

async fn cleanup_expired_usage(pool: &MySqlPool) -> Result<(), sqlx::Error> {
    let now = Utc::now();
    let usage_cutoff = china_date(now) - chrono::Duration::days(RETENTION_DAYS);
    let log_cutoff = (now - chrono::Duration::days(RETENTION_DAYS)).naive_utc();

    sqlx::query("DELETE FROM cdk_usage_daily WHERE usage_date < ?")
        .bind(usage_cutoff)
        .execute(pool)
        .await?;
    sqlx::query("DELETE FROM usage_logs WHERE created_at < ?")
        .bind(log_cutoff)
        .execute(pool)
        .await?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use chrono::TimeZone;

    use super::*;

    #[test]
    fn splits_interval_at_china_midnight() {
        let start = Utc.with_ymd_and_hms(2026, 8, 24, 15, 59, 30).unwrap();
        let end = Utc.with_ymd_and_hms(2026, 8, 24, 16, 1, 0).unwrap();

        let segments = split_interval(start, end);

        assert_eq!(segments.len(), 2);
        assert_eq!(segments[0].usage_date.to_string(), "2026-08-24");
        assert_eq!(segments[0].duration_seconds, 30);
        assert_eq!(segments[1].usage_date.to_string(), "2026-08-25");
        assert_eq!(segments[1].duration_seconds, 60);
    }

    #[test]
    fn ignores_empty_or_reversed_intervals() {
        let now = Utc.with_ymd_and_hms(2026, 8, 24, 0, 0, 0).unwrap();

        assert!(split_interval(now, now).is_empty());
        assert!(split_interval(now, now - chrono::Duration::seconds(1)).is_empty());
    }
}
