# Feedback Query and Admin Reply

## Background

The server already accepts unauthenticated client feedback and lets authenticated administrators list feedback and toggle its completion state. Client users currently cannot retrieve their submitted feedback or see an administrator's result.

## Goal

Let a client retrieve feedback submitted by its exact machine code and see the processing result, while letting an authenticated administrator write a reply from the existing feedback management page.

## Confirmed Facts

- Client submission routes are unauthenticated and may store `machine_code` on `user_feedback`.
- Management list and set-done routes require JWT and use the existing visibility rule: the current administrator's owned rows plus anonymous rows.
- `user_feedback.machine_code` already has an index.
- The current schema has `is_done` and `done_at`, but no reply fields.
- The repository contains an admin frontend only; client integration is delivered as an API contract and documentation.

## Requirements

### Client query

- Add unauthenticated default and username-scoped client endpoints that query feedback by an exact, non-empty `machine_code`, mirroring the two existing submission scopes.
- The default endpoint returns anonymous feedback only; the username-scoped endpoint returns feedback owned by that user plus anonymous feedback, matching the existing management visibility rule.
- Use request-body input so the machine code is not placed in URL paths or query strings.
- Return matching feedback records in newest-first order with bounded pagination.
- Return only client-safe fields: `id`, `feedback_type`, `content`, `is_done`, `reply`, `replied_at`, `done_at`, and `created_at`.
- Do not expose `contact`, `cdk_code`, `metadata`, `created_by`, app version, platform, or other internal/admin context.
- An unknown machine code returns a successful empty list; invalid or oversized input returns a Chinese `BadRequest` error.

### Admin reply

- Add nullable `reply TEXT` and `replied_at DATETIME` fields to `user_feedback`.
- Add an authenticated management endpoint that writes or updates the reply for a feedback ID.
- Apply the same tenant visibility rule as the existing list and set-done endpoints.
- Trim reply text, reject empty replies, and enforce a documented maximum length.
- Saving or editing a reply must not change `is_done` or `done_at`; reply and completion are independent because a reply may describe a planned or interim result.
- Marking feedback complete or reopening it must not clear the persisted reply.
- Include reply fields in the existing management list response.
- Add a reply action and reply editor to the existing feedback management UI, including loading state and success/error toast behavior.

### Compatibility and documentation

- Preserve all existing submission, list, filtering, set-done, and reopen behavior unless explicitly changed by the reply lifecycle decision.
- Update startup schema compatibility logic, a numbered migration, deploy MySQL initialization schema, Rust models/handlers/routes, frontend types/UI, API documentation, and the feedback executable spec.

## Acceptance Criteria

- A client can submit feedback with a machine code, query that exact machine code, and receive the submitted feedback in newest-first order.
- The client response never exposes admin-only or troubleshooting fields.
- An authenticated administrator can reply only to a feedback record visible under the current visibility rule.
- The management list and UI display the persisted reply and reply timestamp.
- The client query displays the same persisted reply and processing timestamps.
- Empty or oversized machine codes/replies produce Chinese validation errors.
- Querying a machine code with no feedback returns `success: true` with an empty `items` array.
- Backend formatting/build/tests and frontend lint/build checks pass according to project conventions.
- `API.md` contains request/response examples and security notes for both new endpoints.

## Out of Scope

- Client application UI changes outside this repository.
- Reply history, threaded conversation, attachments, push notifications, polling infrastructure, or webhooks.
- New authentication or machine registration mechanisms.
- Deleting feedback.

## Open Question

- None.
