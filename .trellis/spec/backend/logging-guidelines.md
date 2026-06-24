# Logging Guidelines

> How logging is configured and used in the CDK Server backend.

---

## Stack

- **Crate**: `tracing` (for instrumentation) + `tracing-subscriber` (for output)
- **Initialization**: `tracing_subscriber::fmt::init()` called once in `main()`
- **Output**: Stdout, default format (timestamp + level + message)

---

## Log Levels in Use

| Level | Usage | Example |
|-------|-------|---------|
| `tracing::info!` | Server lifecycle events | `"Server running on {}"`, `"Database '{}' ready"` |
| `tracing::error!` | Internal errors before returning 500 | `"Internal error: {}"` in `AppError::Internal` |

The project currently only uses `info!` and `error!`. No `debug!`, `warn!`, or `trace!` in application code.

---

## Where Logging Happens

1. **Startup** (`main.rs`, `db.rs`): Server bind address, database ready confirmation
2. **Error response** (`errors.rs`): Internal errors are logged before returning a generic message to client

---

## Conventions

- Keep logging minimal — only log what's operationally useful
- Internal errors: always log the original error message before returning generic "内部服务器错误"
- Do NOT log request bodies or sensitive data (passwords, tokens, CDK codes)
- Do NOT add per-request access logging in application code — rely on reverse proxy (Nginx) for access logs

---

## Adding New Logs

When adding new log statements:

```rust
// Lifecycle / startup events
tracing::info!("Description of what happened");

// Errors that need investigation
tracing::error!("Context: {}", error_details);

// Debug info (only if needed for troubleshooting, usually behind a flag)
tracing::debug!("Variable state: {:?}", value);
```

---

## Anti-Patterns

- Do NOT use `println!` or `eprintln!` — always use `tracing::` macros
- Do NOT log on every successful request (too noisy in production)
- Do NOT log user credentials, JWT tokens, or full CDK codes
