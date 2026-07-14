# User Feedback API

> Executable contracts for client submission and authenticated management of `user_feedback`.

---

## Scenario: User feedback submit / list / set-done

### 1. Scope / Trigger

- Trigger: new public client routes + authenticated admin routes + `user_feedback` table/migrations.
- Why code-spec depth: cross-layer request/response, schema, validation, and tenant visibility rules.

### 2. Signatures

| Method | Path | Auth |
|--------|------|------|
| `POST` | `/api/client/feedback` | No — `created_by = NULL` |
| `POST` | `/api/client/u/{username}/feedback` | No — resolve user by username; 404 if missing |
| `GET` | `/api/feedback/list` | JWT |
| `POST` | `/api/feedback/set-done` | JWT |

Table: `user_feedback` (also `CREATE TABLE IF NOT EXISTS` in `db.rs`; migrations `003_*`, `004_*`).

Handlers/models: `handlers/feedback.rs`, `models/feedback.rs`.

### 3. Contracts

**Submit body** (`SubmitFeedbackRequest`):

| Field | Type | Constraints |
|-------|------|-------------|
| `feedback_type` | string? | default `general`, max 32 |
| `content` | string | required, non-empty after trim, max 5000 |
| `contact` | string? | max 128 |
| `machine_code` | string? | max 256 |
| `cdk_code` | string? | max 64 |
| `app_version` | string? | max 64 |
| `platform` | string? | max 64 |
| `metadata` | JSON value? | serialized to TEXT; max 10000 chars after `serde_json::to_string` |

**Submit success `data`**: `{ id, message }` (message 如「反馈提交成功」).

**List query**: `page` (default 1, min 1), `page_size` (default 10, max 50), `feedback_type?`, `is_done?`, `search?` (fuzzy on content/contact/machine_code/cdk_code).

**List success `data`**: `{ items, total, pending, done, page, page_size }`.

- DB stores `metadata` as TEXT; list API **parses it back to JSON** in `items` (not raw string). Empty/invalid parse → `null`.

**Visibility (list / set-done)**: rows where `created_by = current_user_id OR created_by IS NULL`.

**set-done body**: `{ id: number, is_done: boolean }`. Updates `done_at` to UTC now when done, else `NULL`.

**set-done success `data`**: `{ message }` — done:「反馈已标记完成」; reopen:「反馈已标记待处理」.

### 4. Validation & Error Matrix

| Condition | Error |
|-----------|--------|
| empty `content` | `BadRequest` 「反馈内容不能为空」 |
| field over max length | `BadRequest` Chinese length message |
| `metadata` not serializable / too long | `BadRequest` 「扩展信息格式错误」/「扩展信息过长」 |
| unknown `{username}` on scoped submit | `NotFound` 「用户不存在」 |
| set-done row not found / not visible | `NotFound` 「反馈不存在」 |
| unauthenticated list/set-done | middleware 401 |

### 5. Good / Base / Bad Cases

- **Good**: `POST /api/client/feedback` with `{ "content": "卡激活失败" }` → 200 + `id`.
- **Base**: `POST /api/client/u/admin/feedback` with type + metadata object → stored under admin's `created_by`.
- **Bad**: `content: ""` → 400; list without Bearer → 401; set-done on another user's owned row (non-null other `created_by`) → 404.

### 6. Tests Required

- Insert anonymous + owned feedback; list as user A sees anonymous + A's rows only.
- Validation matrix unit/handler coverage for empty content and oversized metadata.
- set-done flips `is_done`/`done_at` and returns correct Chinese `message`.
- Frontend: toast prefers API `message` over hard-coded strings.

### 7. Wrong vs Correct

#### Wrong
```rust
// Treat list metadata as display string without parsing
item.metadata // Option<String> in API JSON
```

#### Correct
```rust
// Persist TEXT; expose JSON Value (or null) in list items
serde_json::from_str::<Value>(&stored).ok()
```

#### Wrong
```sql
WHERE created_by = ?
-- hides anonymous client feedback from all admins
```

#### Correct
```sql
WHERE (created_by = ? OR created_by IS NULL)
```

---

## Design Decision: Anonymous feedback visibility

**Context**: Client can submit without binding a backend user.

**Decision**: Anonymous rows (`created_by IS NULL`) are visible and closable by any authenticated admin; owned rows stay scoped to that user.

**Why**: Improves triage of client-reported issues without requiring username in every payload.

**Related**: Full field tables and curl examples live in repo-root `API.md`.
