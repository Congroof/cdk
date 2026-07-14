# Technical Design

## API Contracts

### Client feedback query

Add two unauthenticated routes:

- `POST /api/client/feedback/query`
- `POST /api/client/u/{username}/feedback/query`

Request body:

```json
{
  "machine_code": "MACHINE-001",
  "page": 1,
  "page_size": 20
}
```

Validation:

- `machine_code` is trimmed, required, and limited to 256 characters.
- `page` defaults to 1 and is clamped to a minimum of 1.
- `page_size` defaults to 20 and is clamped to 1..50.

Visibility:

- Default route: `machine_code = ? AND created_by IS NULL`.
- Username-scoped route: resolve the username or return `404 用户不存在`, then query `machine_code = ? AND (created_by = ? OR created_by IS NULL)`.

Success data:

```json
{
  "items": [
    {
      "id": 1,
      "feedback_type": "feature",
      "content": "希望支持批量导出",
      "is_done": false,
      "reply": "已纳入后续版本计划",
      "replied_at": "2026-07-14T10:00:00",
      "done_at": null,
      "created_at": "2026-07-14T09:00:00"
    }
  ],
  "total": 1,
  "page": 1,
  "page_size": 20
}
```

The client DTO is distinct from the management DTO so future admin fields cannot accidentally leak through serialization.

### Admin reply

Add authenticated route:

- `POST /api/feedback/reply`

Request body:

```json
{
  "id": 1,
  "reply": "已纳入后续版本计划"
}
```

Behavior:

- Trim and require `reply`; maximum length is 5000 characters.
- Update `reply` and set `replied_at` to current UTC time.
- Restrict the update to `(created_by = current_user_id OR created_by IS NULL)`.
- Return `404 反馈记录不存在` when no visible row is updated.
- Do not update `is_done` or `done_at`.
- Existing set-done/reopen behavior does not modify reply fields.

## Database

Add columns:

- `reply TEXT NULL`
- `replied_at DATETIME NULL`

Update all schema entry points:

- new numbered migration for existing deployments
- `backend/src/db.rs` create-table definition and idempotent compatibility ALTERs
- `deploy/mysql-init/01_schema.sql`

No new index is needed: client queries use the existing `machine_code` index, and admin replies update by primary key.

## Backend Boundaries

- Request/response and row types remain in `backend/src/models/feedback.rs`.
- Handlers and shared validation remain in `backend/src/handlers/feedback.rs`.
- Protected and public routes are registered in `backend/src/main.rs`.
- Management list keeps its current DTO but gains `reply` and `replied_at`.

## Admin Frontend

- Extend `UserFeedback` with nullable reply fields.
- Add a reply button per row, opening an inline/modal editor consistent with current component conventions.
- Prefill an existing reply so administrators can edit it.
- Save through `/feedback/reply`, show the API message in a toast, close the editor, and refresh the list.
- Display the current reply and timestamp in the list without conflating it with the completion badge.

## Compatibility and Risk

- Existing records expose `reply: null` and `replied_at: null`.
- Existing clients and management requests remain valid because fields and routes are additive.
- Machine code is treated as the client lookup credential. The API documentation must state that it should not be logged or shared and that the query response intentionally omits contact, CDK, metadata, owner, application, and platform fields.
- No transaction is required because each reply operation is one row update and completion state is intentionally independent.

## Rollback

- Application rollback is safe because older binaries ignore the two nullable columns.
- Database columns can remain in place during rollback; dropping them is unnecessary and would destroy reply data.
