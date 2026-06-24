# Backend Development Guidelines

> Coding conventions for the CDK Server backend (Rust + Axum + SQLx + MySQL).

---

## Tech Stack

- **Language**: Rust (Edition 2021)
- **Web Framework**: Axum 0.8
- **Database**: MySQL via SQLx 0.8 (raw SQL, no ORM)
- **Auth**: JWT (jsonwebtoken 9) + bcrypt
- **Logging**: tracing + tracing-subscriber

---

## Pre-Development Checklist

Before writing backend code, read these guideline files:

1. [Directory Structure](./directory-structure.md) — where files go, module organization
2. [Database Guidelines](./database-guidelines.md) — query patterns, row/domain type split, naming
3. [Error Handling](./error-handling.md) — AppError enum, response format, when to use each variant
4. [Logging Guidelines](./logging-guidelines.md) — what/when/how to log
5. [Quality Guidelines](./quality-guidelines.md) — code style, build commands, anti-patterns

---

## Guidelines Index

| Guide | Description | Status |
|-------|-------------|--------|
| [Directory Structure](./directory-structure.md) | Module organization and file layout | Filled |
| [Database Guidelines](./database-guidelines.md) | SQLx query patterns, migrations, naming | Filled |
| [Error Handling](./error-handling.md) | AppError enum, HTTP mapping, conventions | Filled |
| [Logging Guidelines](./logging-guidelines.md) | tracing usage, log levels | Filled |
| [Quality Guidelines](./quality-guidelines.md) | Code style, linting, anti-patterns | Filled |

---

## Quick Reference

- All handlers return `Result<Json<serde_json::Value>, AppError>`
- All responses use envelope: `{ "success": true/false, "data": {...} }` or `{ "success": false, "error": "..." }`
- Error messages are in Chinese
- JWT claims are extracted via `Extension(claims): Extension<Claims>`
- User ID is resolved from claims: `SELECT id FROM users WHERE username = ?`
