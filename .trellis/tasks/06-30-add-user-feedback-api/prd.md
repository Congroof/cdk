# Add User Feedback API

## Background

Clients need a lightweight way to submit user feedback to the CDK server. The server should persist feedback with enough context for later troubleshooting, while keeping submission unauthenticated for client-side use and admin access scoped to the logged-in user.

## Goals

- Add a `user_feedback` table for feedback records.
- Add unauthenticated client feedback submission routes:
  - `POST /api/client/feedback` stores feedback without an owner.
  - `POST /api/client/u/{username}/feedback` stores feedback under the specified owner.
- Do not add administrator/management feedback APIs in this change.
- Document table schema, request fields, responses, examples, and integration notes in `API.md`.

## Non-Goals

- No frontend management UI in this change.
- No notification/webhook pipeline.
- No file upload or attachment support.

## Data Model

Table: `user_feedback`

- `id BIGINT AUTO_INCREMENT PRIMARY KEY`
- `feedback_type VARCHAR(32) NOT NULL DEFAULT 'general'`
- `content TEXT NOT NULL`
- `contact VARCHAR(128) NULL`
- `machine_code VARCHAR(256) NULL`
- `cdk_code VARCHAR(64) NULL`
- `app_version VARCHAR(64) NULL`
- `platform VARCHAR(64) NULL`
- `metadata TEXT NULL`
- `created_by BIGINT NULL`
- `created_at DATETIME DEFAULT NOW()`

Indexes:

- `idx_feedback_created_by (created_by)`
- `idx_feedback_created_at (created_at)`
- `idx_feedback_machine_code (machine_code)`
- `idx_feedback_cdk_code (cdk_code)`
- `idx_feedback_type (feedback_type)`

## API Behavior

### Submit feedback

Request fields:

- `feedback_type`: optional string, defaults to `general`, max 32 chars.
- `content`: required string, non-empty, max 5000 chars.
- `contact`: optional string, max 128 chars.
- `machine_code`: optional string, max 256 chars.
- `cdk_code`: optional string, max 64 chars.
- `app_version`: optional string, max 64 chars.
- `platform`: optional string, max 64 chars.
- `metadata`: optional JSON value, serialized to text, max 10000 chars after serialization.

Response:

- Returns `id` and `message` when stored successfully.

## Acceptance Criteria

- Server starts with `user_feedback` table auto-created.
- Manual migration SQL exists for the new table.
- New routes are registered in `main.rs`.
- Input validation returns Chinese `BadRequest` messages.
- `cargo fmt --check` and `cargo build` pass for the backend.
- `API.md` contains integration documentation for the new endpoints and table.
