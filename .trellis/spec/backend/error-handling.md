# Error Handling

> How errors are structured, returned, and logged in the CDK Server backend.

---

## Error Type

All handlers return `Result<Json<serde_json::Value>, AppError>`. The `AppError` enum in `errors.rs` defines all error variants:

```rust
pub enum AppError {
    BadRequest(String),    // 400 — invalid input, business rule violation
    Unauthorized(String),  // 401 — missing/invalid JWT
    NotFound(String),      // 404 — resource not found
    Conflict(String),      // 409 — concurrent modification detected
    Internal(String),      // 500 — unexpected server error
}
```

---

## Response Format

All error responses use a consistent JSON envelope:

```json
{
  "success": false,
  "error": "Human-readable error message in Chinese"
}
```

The `IntoResponse` impl maps each variant to its HTTP status code and builds this JSON body.

---

## Error Messages

- Error messages are written in **Chinese** for user-facing errors (BadRequest, NotFound, Conflict)
- Internal errors log the real error with `tracing::error!` but return a generic "内部服务器错误" to the client
- Unauthorized errors may include technical detail ("Token 无效: ...")

---

## Conversion Traits

```rust
impl From<sqlx::Error> for AppError {
    fn from(err: sqlx::Error) -> Self {
        AppError::Internal(err.to_string())
    }
}

impl From<jsonwebtoken::errors::Error> for AppError {
    fn from(err: jsonwebtoken::errors::Error) -> Self {
        AppError::Unauthorized(format!("Token 无效: {}", err))
    }
}
```

The `?` operator automatically converts SQLx and JWT errors into `AppError`.

---

## Usage Patterns in Handlers

### Input validation (early return)

```rust
if payload.count == 0 || payload.count > 100 {
    return Err(AppError::BadRequest("生成数量须在 1-100 之间".to_string()));
}
```

### Resource not found

```rust
.fetch_optional(&state.db)
.await?
.ok_or_else(|| AppError::NotFound("CDK 不存在".to_string()))?;
```

### Optimistic concurrency check

```rust
if result.rows_affected() == 0 {
    return Err(AppError::Conflict("CDK 状态已变更，请重试".to_string()));
}
```

---

## When to Use Each Variant

| Variant | Use when... |
|---------|-------------|
| `BadRequest` | Input validation fails, business rule violated, banned machine |
| `Unauthorized` | Missing auth header, invalid token, wrong credentials |
| `NotFound` | `fetch_optional` returns None for a required resource |
| `Conflict` | `rows_affected() == 0` on an UPDATE with a WHERE condition |
| `Internal` | Unexpected errors (DB connection failure, serialization error) |

---

## Anti-Patterns

- Do NOT use `unwrap()` or `expect()` in handlers — always use `?` with AppError conversion
- Do NOT expose internal error details to clients (use `tracing::error!` for logging, return generic message)
- Do NOT create new error variants without adding them to the enum and implementing the status code mapping
