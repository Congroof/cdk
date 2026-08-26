# Quality Guidelines

> Code standards and quality expectations for the CDK Server backend.

---

## Build & Check Commands

```bash
cd backend
cargo build          # Compile
cargo clippy         # Lint (warnings as errors in CI)
cargo fmt --check    # Format check
```

---

## Code Style

- **Edition**: Rust 2021
- **Formatting**: `rustfmt` default settings
- **Linting**: Clippy default lints
- **Imports**: Group by stdlib → external crates → local modules, separated by blank lines

```rust
use axum::extract::{Query, State};
use axum::Json;
use chrono::Utc;

use crate::errors::AppError;
use crate::models::cdk::*;
use crate::AppState;
```

---

## Handler Function Signature

All handlers follow the same pattern:

```rust
pub async fn handler_name(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,    // only for protected routes
    Json(payload): Json<RequestType>,        // for POST
    Query(params): Query<QueryType>,         // for GET with params
) -> Result<Json<serde_json::Value>, AppError> {
    // ...
}
```

---

## Response Envelope

**Always** wrap responses in the standard envelope:

```rust
Ok(Json(serde_json::json!({
    "success": true,
    "data": { /* ... */ },
})))
```

Never return bare data or non-standard structures.

---

## Testing

- Unit tests run with `cargo test`; bug fixes must include a focused regression.
- Runtime SQL is not checked at compile time. Database-sensitive changes must
  include a `#[tokio::test]` against MySQL 8 and exercise the exact production
  query/helper.
- Tests requiring a local database should be marked `#[ignore]`, require an
  explicit localhost-only URL, and be run separately so a missing database
  cannot masquerade as a passing integration test.
- MOD database regression command:

```bash
MOD_MYSQL_TEST_DATABASE_URL=mysql://USER:PASSWORD@127.0.0.1:3306/TEST_DB \
  cargo test mysql_mod_queries_decode_real_mysql_types -- --ignored --nocapture
```

- For cross-layer changes, also run frontend lint/build and a local HTTP smoke
  matrix for success, validation, auth, not-found, and cache headers.

---

## Dependency Policy

- Keep dependencies minimal — only add crates that solve a real problem
- Pin major versions in Cargo.toml (e.g., `axum = "0.8"`, not `axum = "*"`)
- Prefer well-maintained, widely-used crates from the Rust ecosystem

---

## Anti-Patterns

- Do NOT use `.unwrap()` in handler code — always propagate errors with `?`
- Do NOT use `expect()` in handlers (only acceptable in main/startup code for required config)
- Do NOT introduce `unsafe` code
- Do NOT add unused dependencies
- Do NOT use `clone()` unnecessarily — prefer references where possible
- Do NOT mix Chinese and English in the same error message string
