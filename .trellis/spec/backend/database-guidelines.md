# Database Guidelines

> MySQL access patterns for the CDK Server backend.

---

## Stack

- **Database**: MySQL with `utf8mb4` charset
- **Driver**: SQLx 0.8 (async, compile-time-unchecked queries)
- **Query style**: Raw SQL strings via `sqlx::query` / `sqlx::query_as`
- **No ORM**: No Diesel, no SeaORM — all queries are hand-written SQL

---

## Connection Pool

Pool is created in `db.rs::create_pool()` with max 10 connections. The pool is stored in `AppState` and passed to handlers via Axum's `State` extractor.

```rust
// AppState in main.rs
pub struct AppState {
    pub db: sqlx::MySqlPool,
    pub jwt_secret: String,
}
```

---

## Migration Strategy

Migrations are **auto-applied on startup** in `db.rs`:

1. Connect to MySQL server (without DB name)
2. `CREATE DATABASE IF NOT EXISTS` with utf8mb4
3. Connect to the target database
4. `CREATE TABLE IF NOT EXISTS` for each table
5. Optional `ALTER TABLE` for adding columns to existing deployments

Migration SQL files in `backend/migrations/` are for documentation/manual use — the actual migration logic runs in Rust code at startup.

**When adding a new table:**
- Add `CREATE TABLE IF NOT EXISTS` in `db.rs`
- Also create a numbered `.sql` file in `migrations/` for reference

---

## Query Patterns

### Single row fetch

```rust
let user: (i64, String) = sqlx::query_as("SELECT id, username FROM users WHERE username = ?")
    .bind(&claims.sub)
    .fetch_one(&state.db)
    .await?;
```

### Optional row

```rust
let row = sqlx::query_as::<_, CdkRow>("SELECT * FROM cdkeys WHERE code = ?")
    .bind(&payload.code)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::NotFound("CDK 不存在".to_string()))?;
```

### Multiple rows

```rust
let rows: Vec<(String, i64)> = sqlx::query_as(
    "SELECT status, COUNT(*) FROM cdkeys WHERE created_by = ? GROUP BY status"
)
.bind(user_id.0)
.fetch_all(&state.db)
.await?;
```

### MySQL aggregate result types

Decode `COUNT(*)` as `i64` unless the SQL expression explicitly returns an unsigned type. MySQL/MariaDB metadata can expose the aggregate as signed `BIGINT`; decoding it into Rust `u64` then fails at runtime with a SQLx type mismatch.

```rust
let (total,): (i64,) = sqlx::query_as("SELECT COUNT(*) FROM skinforge_mods")
    .fetch_one(&state.db)
    .await?;
```

Do not infer a SQLx decode type from the literal's value. MySQL exposes an
untyped-looking `SELECT 1` as signed `BIGINT`, so decoding it into `u8` fails
at runtime even though the value is one. For existence checks, select a real
typed column and check `fetch_optional(...).is_some()`, or use an explicitly
cast expression whose MySQL type has been verified by an integration test.

```rust
let row: Option<(u64,)> = sqlx::query_as(
    "SELECT file_id FROM skinforge_mods WHERE file_id = ? AND link_id = ? LIMIT 1",
)
.bind(file_id)
.bind(link_id)
.fetch_optional(pool)
.await?;
let exists = row.is_some();
```

### Database URL parsing

Never derive the database name or server URL with `rfind('/')` or other string
slicing. Production URLs may include query parameters such as
`?ssl-mode=required`; string slicing can include the query in `TABLE_SCHEMA`
comparisons or discard connection options on the server-level connection.
Parse once with `MySqlConnectOptions`, use `get_database()` for schema checks,
and clone the options with an empty database for `CREATE DATABASE`.

### Runtime SQL verification

This project uses unchecked runtime SQL strings, so `cargo check`, Clippy, and
ordinary unit tests do not validate MySQL metadata. Every change involving
aggregates, literal projections, unsigned integers, nullable columns, schema
inspection, or migration SQL must execute the exact production query against
MySQL 8 before release. Keep a local-only ignored integration test for queries
that require a database and run it explicitly in the release gate.

### INSERT / UPDATE

```rust
let result = sqlx::query("UPDATE cdkeys SET status = 'disabled' WHERE code = ? AND created_by = ?")
    .bind(&payload.code)
    .bind(user_id.0)
    .execute(&state.db)
    .await?;

if result.rows_affected() == 0 {
    return Err(AppError::NotFound("...".to_string()));
}
```

---

## Row Types vs Domain Types

The project uses a **two-struct pattern**:

- `CdkRow` — derives `sqlx::FromRow`, fields match DB columns exactly (String for enums)
- `Cdk` — domain struct with proper Rust types (enum for status), derives `Serialize`
- `impl From<CdkRow> for Cdk` converts between them

This separation exists because SQLx's FromRow requires String for MySQL ENUM columns.

---

## Dynamic Query Building

For optional filters (status, search, date range), the project builds SQL dynamically:

```rust
let mut conditions = vec!["created_by = ?".to_string()];
if has_status { conditions.push("status = ?".to_string()); }
if has_search { conditions.push("(code LIKE ? OR machine_code LIKE ?)".to_string()); }
let where_clause = format!(" WHERE {}", conditions.join(" AND "));
```

Bindings are applied conditionally using a `bind_filters!` macro or sequential `.bind()` calls.

---

## Naming Conventions

| Item | Convention | Example |
|------|-----------|---------|
| Table names | snake_case, plural | `cdkeys`, `usage_logs`, `banned_machines` |
| Column names | snake_case | `machine_code`, `created_at`, `valid_duration` |
| Indexes | `idx_<table_prefix>_<column>` | `idx_code`, `idx_bm_created_by` |
| Enum values in DB | lowercase strings | `'unused'`, `'activated'`, `'expired'`, `'disabled'` |
| Timestamps | `DATETIME DEFAULT NOW()` | `created_at`, `activated_at` |
| Foreign keys | column name = referenced table singular + `_id` | `created_by` (references `users.id`) |

---

## Anti-Patterns to Avoid

- Do NOT use SQLx compile-time checked queries (`sqlx::query!`) — this project uses runtime string queries
- Do NOT introduce an ORM — keep raw SQL for consistency
- Do NOT use transactions unless strictly required — current handlers use simple sequential queries
- Do NOT hardcode user IDs — always resolve from JWT claims via `SELECT id FROM users WHERE username = ?`
- Do NOT decode `SELECT 1` into a small integer based on its value; select a typed column instead
- Do NOT parse `DATABASE_URL` with string slicing
