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

- Currently **no automated tests** in the project
- Verification is done manually via API calls (curl / frontend)
- When adding tests: use `#[tokio::test]` with a test database

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
