# User Feedback API

> Executable contracts for client submission and authenticated management of `user_feedback`.

---

## Scenario: User feedback submit / client query / admin reply and completion

### 1. Scope / Trigger

- Trigger: new public client routes + authenticated admin routes + `user_feedback` table/migrations.
- Why code-spec depth: cross-layer request/response, schema, validation, and tenant visibility rules.

### 2. Signatures

| Method | Path | Auth |
|--------|------|------|
| `POST` | `/api/client/feedback` | No — `created_by = NULL` |
| `POST` | `/api/client/u/{username}/feedback` | No — resolve user by username; 404 if missing |
| `POST` | `/api/client/feedback/query` | No — anonymous rows for exact machine code |
| `POST` | `/api/client/u/{username}/feedback/query` | No — username-owned + anonymous rows for exact machine code |
| `GET` | `/api/feedback/list` | JWT |
| `POST` | `/api/feedback/set-done` | JWT |
| `POST` | `/api/feedback/reply` | JWT |

Table: `user_feedback` (also `CREATE TABLE IF NOT EXISTS` in `db.rs`; migrations `003_*`, `004_*`, `005_*`). Reply columns are nullable `reply TEXT` and `replied_at DATETIME`.

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

**Submit success `data`**: `{ id, message }` (message 为「反馈已提交」).

**Client query body** (`ClientFeedbackQueryRequest`):

| Field | Type | Constraints |
|-------|------|-------------|
| `machine_code` | string | exact match; required after trim; max 256 |
| `page` | number? | default 1; min 1 |
| `page_size` | number? | default 20; clamped to 1..50 |

**Client query success `data`**: `{ items, total, page, page_size }`, newest first. `items` must use the dedicated allowlisted `ClientFeedbackItem` fields only: `id`, `feedback_type`, `content`, `is_done`, `reply`, `replied_at`, `done_at`, `created_at`.

- Default query visibility: `machine_code = ? AND created_by IS NULL`.
- Username-scoped query visibility: `machine_code = ? AND (created_by = resolved_user_id OR created_by IS NULL)`.
- No match is not an error: return empty `items` and `total: 0`.

**List query**: `page` (default 1, min 1), `page_size` (default 10, max 50), `feedback_type?`, `is_done?`, `search?` (fuzzy on content/contact/machine_code/cdk_code).

**List success `data`**: `{ items, total, pending, done, page, page_size }`.

- DB stores `metadata` as TEXT; list API **parses it back to JSON** in `items` (not raw string). Empty/invalid parse → `null`.
- Admin list items expose nullable `reply` and `replied_at`.

**Visibility (list / set-done / reply)**: rows where `created_by = current_user_id OR created_by IS NULL`.

**set-done body**: `{ id: number, is_done: boolean }`. Updates `done_at` to UTC now when done, else `NULL`.

**set-done success `data`**: `{ message }` — done:「反馈已标记完成」; reopen:「反馈已标记待处理」.

**Reply body** (`ReplyFeedbackRequest`): `{ id: number, reply: string }`; reply is trimmed, required, and max 5000 characters. Save it with `replied_at = UTC now` and return `{ message: "反馈回复已保存" }`.

**State invariant**: reply and completion are independent. Reply updates never change `is_done`/`done_at`; set-done and reopen never clear `reply`/`replied_at`. A pending item may legitimately contain a reply such as「已纳入计划」.

### 4. Validation & Error Matrix

| Condition | Error |
|-----------|--------|
| empty `content` | `BadRequest` 「反馈内容不能为空」 |
| field over max length | `BadRequest` Chinese length message |
| `metadata` not serializable / too long | `BadRequest` 「扩展信息格式错误」/「扩展信息过长」 |
| empty / oversized client query `machine_code` | `BadRequest` 「机器码不能为空」/「机器码过长」 |
| empty / oversized `reply` | `BadRequest` 「反馈回复不能为空」/「反馈回复过长」 |
| unknown `{username}` on scoped submit/query | `NotFound` 「用户不存在」 |
| set-done row not found / not visible | `NotFound` 「反馈记录不存在」 |
| reply row not found / not visible | `NotFound` 「反馈记录不存在」 |
| unauthenticated list/set-done/reply | middleware 401 |

### 5. Good / Base / Bad Cases

- **Good**: `POST /api/client/feedback` with `{ "content": "卡激活失败" }` → 200 + `id`.
- **Base**: reply「已纳入后续版本计划」to a pending item → reply fields change, while `is_done = false` and `done_at = null` remain unchanged.
- **Good query**: username-scoped query sees matching anonymous + same-owner rows, ordered by `created_at DESC, id DESC`.
- **Bad**: empty query machine code → 400; client query never serializes `contact`, `cdk_code`, `metadata`, `created_by`, `app_version`, or `platform`; reply to another user's owned row → 404.

### 6. Tests Required

- Insert anonymous + owned feedback; list as user A sees anonymous + A's rows only.
- Client default query returns only matching anonymous rows; scoped query returns matching anonymous + same-owner rows and never another owner's rows.
- Serialize a client query item and assert the exact allowlist, including absence of management/troubleshooting fields.
- Client query pagination is stable for equal timestamps because `id DESC` is the secondary ordering key.
- Validation matrix unit/handler coverage for empty content and oversized metadata.
- set-done flips `is_done`/`done_at` and returns correct Chinese `message`.
- Reply insert/update sets `reply`/`replied_at` but preserves `is_done`/`done_at`; set-done/reopen preserves reply fields.
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

#### Wrong
```rust
// Reusing the management DTO leaks fields when querying with a machine code.
let items: Vec<Feedback> = rows.into_iter().map(Feedback::from).collect();
```

#### Correct
```rust
// Query and serialize an explicit client allowlist.
let items: Vec<ClientFeedbackItem> = sqlx::query_as(
    "SELECT id, feedback_type, content, is_done, reply, replied_at, done_at, created_at ..."
).fetch_all(&state.db).await?;
```

#### Wrong
```sql
UPDATE user_feedback
SET reply = ?, replied_at = NOW(), is_done = TRUE, done_at = NOW()
```

#### Correct
```sql
UPDATE user_feedback
SET reply = ?, replied_at = ?
WHERE id = ? AND (created_by = ? OR created_by IS NULL)
```

---

## Design Decision: Anonymous feedback visibility

**Context**: Client can submit without binding a backend user.

**Decision**: Anonymous rows (`created_by IS NULL`) are visible and closable by any authenticated admin; owned rows stay scoped to that user.

**Why**: Improves triage of client-reported issues without requiring username in every payload.

**Related**: Full field tables and curl examples live in repo-root `API.md`.

---

## Design Decision: Reply does not imply completion

**Context**: Administrators may reply with an interim result or a future plan before work is complete.

**Decision**: Persist reply content and its timestamp independently from `is_done` and `done_at`. The frontend presents separate reply and completion actions.

**Why**: Prevents「已回复」from being misrepresented as「已完成」and allows clients to see useful progress while the item remains pending.

## Design Decision: Machine-code query uses a safe DTO

**Context**: Machine-code lookup is unauthenticated and therefore has a narrower trust boundary than the JWT-protected management list.

**Decision**: Use a dedicated client response type and an explicit SQL field list. Never reuse the management `Feedback` DTO for the public response.

**Why**: An allowlist prevents present and future admin-only fields from leaking through automatic serialization.
