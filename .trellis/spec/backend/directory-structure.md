# Directory Structure

> Backend code organization for the CDK Server (Rust + Axum).

---

## Overview

The backend is a single Rust binary crate under `backend/`. It uses a flat module structure — no workspace, no sub-crates.

---

## Directory Layout

```
backend/
├── Cargo.toml
├── .env / .env.example
├── migrations/          # SQL migration files (manual, numbered)
│   ├── 001_init.sql
│   ├── 002_add_created_by.sql
│   ├── 003_create_user_feedback.sql
│   └── 004_add_feedback_done_fields.sql
└── src/
    ├── main.rs          # Entry point: AppState, router, server startup
    ├── config.rs        # Config struct loaded from env vars
    ├── db.rs            # Pool creation + auto-migration (CREATE TABLE IF NOT EXISTS)
    ├── errors.rs        # AppError enum + IntoResponse impl
    ├── handlers/        # Route handler functions (one file per domain)
    │   ├── mod.rs
    │   ├── auth.rs      # Login handler
    │   ├── cdk.rs       # CDK CRUD + validate/activate
    │   ├── banned.rs    # Machine ban handlers
    │   └── feedback.rs  # Client feedback submit + admin list/set-done
    ├── middleware/       # Axum middleware layers
    │   ├── mod.rs
    │   └── auth.rs      # JWT auth middleware
    └── models/          # Request/Response structs + DB row types
        ├── mod.rs
        ├── user.rs
        ├── cdk.rs
        ├── banned.rs
        └── feedback.rs
```

---

## Module Organization

- **One handler file per domain** (auth, cdk, banned, feedback). All handler functions for that domain live in the same file.
- **Models mirror handlers**: each handler file has a corresponding model file with its request structs, response structs, and DB row types.
- **No service layer**: business logic lives directly in handler functions. The codebase is small enough that handlers call SQLx directly.

---

## Naming Conventions

| Item | Convention | Example |
|------|-----------|---------|
| File names | snake_case | `error_handling.rs`, `auth.rs` |
| Handler functions | snake_case verb | `generate`, `validate`, `list` |
| Struct names | PascalCase | `CdkRow`, `GenerateRequest` |
| Enum variants | PascalCase | `AppError::BadRequest` |
| SQL table names | snake_case plural | `cdkeys`, `usage_logs`, `banned_machines`, `user_feedback` |
| Route paths | kebab-case or slash-separated nouns | `/api/cdk/list`, `/api/client/validate` |

---

## Where to Put New Code

| Type | Location |
|------|----------|
| New API endpoint | Add handler fn in existing `handlers/<domain>.rs` or create new file |
| New request/response type | `models/<domain>.rs` |
| New middleware | `middleware/<name>.rs` + register in `mod.rs` |
| New table | Add to `db.rs` (CREATE TABLE IF NOT EXISTS) + add migration SQL |
| Config values | `config.rs` → add field + env var |
