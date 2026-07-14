# Implementation Plan

1. Extend all `user_feedback` schema definitions with nullable reply fields and add a numbered migration.
2. Add Rust row/domain/client DTOs and request types for machine-code query and admin reply.
3. Implement default and username-scoped client query handlers with exact matching, tenant visibility, pagination, and safe response serialization.
4. Implement authenticated reply update without changing completion fields.
5. Register the three new routes.
6. Extend management frontend types and add reply display/editor behavior to `FeedbackList`.
7. Update `API.md` and `.trellis/spec/backend/feedback-api.md` with the new contracts and independent status rule.
8. Run backend formatting, build/check/tests and frontend lint/build; review the final diff for cross-layer consistency and accidental data exposure.

## Validation Commands

- `cd backend && cargo fmt --check`
- `cd backend && cargo test`
- `cd backend && cargo build`
- `cd frontend && npm run lint`
- `cd frontend && npm run build`

## Risky Areas

- Client DTO must remain allowlisted rather than reusing the management DTO.
- Default and username-scoped query visibility must not leak another administrator's owned feedback.
- Reply updates must not mutate `is_done` or `done_at`.
- Startup compatibility ALTERs must tolerate both fresh and already-migrated databases.
