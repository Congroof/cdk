# Announcement API

> Executable contract for tenant-owned announcement management and unauthenticated client reads.

## Scenario: One current announcement per backend user

### 1. Scope / Trigger

Read this spec when changing `announcements`, `handlers/announcement.rs`, announcement routes, the Dashboard announcement editor, or client announcement consumption.

Announcements follow the existing username tenant boundary: an authenticated administrator manages only their own row, while a client selects a tenant explicitly through `/client/u/{username}`.

### 2. Signatures

| Method | Path | JWT | Handler contract |
|---|---|---|---|
| `GET` | `/api/announcement` | Required | Return the current JWT user's draft, including `is_enabled` |
| `POST` | `/api/announcement` | Required | Create or update the current JWT user's single row |
| `GET` | `/api/client/u/{username}/announcement` | Not required | Return only the named user's enabled public announcement |

Database uniqueness contract:

```sql
UNIQUE INDEX idx_announcement_created_by (created_by)
```

The table definition must remain identical in `backend/src/db.rs`, the latest numbered migration, and `deploy/mysql-init/01_schema.sql`.

### 3. Contracts

Admin save request:

```json
{
  "title": "版本更新公告",
  "content": "第一行\n第二行",
  "is_enabled": true
}
```

Admin response `data` is either `null` or:

```json
{
  "title": "版本更新公告",
  "content": "第一行\n第二行",
  "is_enabled": true,
  "updated_at": "2026-07-16T18:30:00"
}
```

Public response uses a dedicated whitelist and never includes `is_enabled`, `created_by`, or draft data:

```json
{
  "success": true,
  "data": {
    "title": "版本更新公告",
    "content": "第一行\n第二行",
    "updated_at": "2026-07-16T18:30:00"
  }
}
```

The frontend treats title and content as plain text. Do not render announcement content through `dangerouslySetInnerHTML` or an HTML/Markdown parser.

### 4. Validation & Error Matrix

| Condition | Result |
|---|---|
| Missing/invalid JWT on admin GET or POST | HTTP 401 through auth middleware |
| Title is empty after trimming | HTTP 400, `公告标题不能为空` |
| Title exceeds 128 Unicode characters | HTTP 400, `公告标题过长` |
| Content is empty after trimming | HTTP 400, `公告内容不能为空` |
| Content exceeds 10,000 Unicode characters | HTTP 400, `公告内容过长` |
| Named public username does not exist | HTTP 404, `用户不存在` |
| Announcement is absent or disabled | HTTP 200, `{ "success": true, "data": null }` |
| Same administrator saves again | Upsert the existing row and refresh `updated_at` |

Outer whitespace is removed; line breaks and inner whitespace in content are preserved.

### 5. Good / Base / Bad Cases

- Good: user `admin` and user `partner` each save a row; their JWT and public username routes never cross-read or overwrite each other.
- Base: a new user has no row; both admin GET and public GET return successful `data: null` responses.
- Good: disabling a row keeps the draft visible to its administrator and hides it from the public route.
- Bad: putting the client GET in the protected Router would require a token and break client integration.
- Bad: querying public data without `is_enabled = TRUE` would leak disabled draft content.

### 6. Tests Required

- Unit-test trimming, empty validation, Unicode title boundary, and content length boundary.
- Backend: `cargo fmt --check`, `cargo check`, `cargo test`, `cargo clippy`.
- Frontend: lint the announcement component and Dashboard, then run `npm run build`.
- Integration assertions when a test database is available:
  - two JWT users upsert distinct rows;
  - repeated save keeps one row per `created_by`;
  - public GET returns enabled data, returns null after disable, and returns 404 for an unknown username;
  - admin endpoints reject missing JWT while the public endpoint accepts it.

### 7. Wrong vs Correct

#### Wrong

```rust
// Public route leaks disabled drafts and internal ownership fields.
sqlx::query_as::<_, Announcement>("SELECT * FROM announcements WHERE created_by = ?")
```

```rust
// A separate unrestricted INSERT allows duplicate rows for one administrator.
sqlx::query("INSERT INTO announcements (title, content, created_by) VALUES (?, ?, ?)")
```

#### Correct

```rust
sqlx::query_as::<_, PublicAnnouncement>(
    "SELECT title, content, updated_at FROM announcements \
     WHERE created_by = ? AND is_enabled = TRUE",
)
```

```sql
INSERT INTO announcements (title, content, is_enabled, created_by)
VALUES (?, ?, ?, ?)
ON DUPLICATE KEY UPDATE
  title = VALUES(title),
  content = VALUES(content),
  is_enabled = VALUES(is_enabled),
  updated_at = NOW();
```
