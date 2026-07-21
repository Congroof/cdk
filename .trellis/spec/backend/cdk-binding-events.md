# CDK Binding History and Realtime Invalidation

## Scenario: Single-machine CDK rebind

### 1. Scope / Trigger

Read this spec when changing either activate route, `cdkeys.machine_code`, CDK
binding history, the client WebSocket endpoint, Nginx `/api/` proxying, or the
in-memory connection registry. A successful rebind crosses a MySQL transaction
and an online notification; database commit order is the security boundary.

### 2. Signatures

```text
POST /api/client/u/{username}/activate
POST /api/client/activate
GET  /api/client/u/{username}/cdk-events  (WebSocket)

Authorization: Bearer <CDK>
X-SkinForge-Machine: <HWID>
```

```text
cdk_binding_history(
  id, cdk_id, cdk_code, event_type,
  old_machine_code, new_machine_code,
  client_ip, created_by, created_at
)
```

The connection registry key is `(owner_id, cdk_id, machine_code)`. It allows
multiple connections per key, caps all connections at 3000, and uses a bounded
32-command sender for each connection.

### 3. Contracts

- `activate_for_owner` trims and bounds CDK/HWID, resolves the tenant before it
  begins the binding transaction, and trusts only a parseable `X-Real-IP` from
  the private Nginx hop.
- The transaction locks `(code, created_by)` with `SELECT ... FOR UPDATE`, then
  updates `cdkeys` and inserts one successful `activate` or `rebind` history row.
- A rebind notification is sent only after `COMMIT`, only to the old registry
  key, and delivery failure never rolls back the new binding.
- The event envelope is v1 camelCase and contains `version`, `eventId`, `type`,
  `occurredAt`, and `payload.reason`. It must not contain CDK, HWID, IP, or owner.
- Server control bounds are: 30-second Ping, 60-second Pong timeout, 64KB frame
  and message maximum, no durable message queue, and no cross-instance delivery.
- The socket is inserted into the registry before a post-upgrade binding query.
  If rebind committed before insertion, the second query closes it; if rebind
  commits after insertion, registry invalidation reaches it. Do not remove this
  second check or the pre-upgrade-check/registration race reappears.
- Schema changes stay synchronized in `backend/src/db.rs`, the numbered manual
  migration, and `deploy/mysql-init/01_schema.sql`.

### 4. Validation & Error Matrix

| Condition | Result |
|---|---|
| missing/blank CDK or HWID | HTTP 400 |
| CDK > 64 chars or HWID > 256 chars | HTTP 400 |
| unknown tenant/binding, wrong machine, disabled/expired CDK | WebSocket 401 without detail |
| banned current machine | WebSocket 401 / activation error |
| same-machine activation | existing success response; no new history/event |
| history insert fails | transaction rolls back; no success/event |
| registry at 3000 | upgrade closes with 1013; no registry growth |
| client sends text/binary business data | close 1008 |

### 5. Good / Base / Bad Cases

- Good: A is locked, updates to B, writes `A -> B`, commits, then invalidates only A.
- Good: concurrent A -> B and B -> C requests serialize and write ordered history.
- Base: initial activation writes `NULL -> A`; repeated activation on A is idempotent.
- Bad: broadcasting by CDK code lets another tenant/device receive the event.
- Bad: notifying before commit can revoke A even when the binding transaction fails.
- Bad: reading arbitrary `X-Forwarded-For` input records attacker-controlled audit text.

### 6. Tests Required

- Protocol serialization: assert v1/type/reason and absence of credential fields.
- Registry: targeted multi-connection invalidation, idempotent cleanup, and 3000 cap.
- Integration race: pause between pre-upgrade validation and registry insertion,
  commit a rebind, then assert the post-upgrade check closes the stale socket.
- Header parsing: required/bounded credentials and literal IPv4/IPv6 `X-Real-IP`.
- Database integration when a test MySQL is available: unused, same machine,
  disabled, expired, rebind, concurrent rebind, and history failure rollback.
- Deployment probe: existing HTTP endpoint still works and WebSocket returns 101
  through Nginx; then verify old connection receives exactly one invalidation.

### 7. Wrong vs Correct

#### Wrong

```rust
sqlx::query("UPDATE cdkeys SET machine_code = ? WHERE code = ?").execute(&pool).await?;
registry.invalidate_binding(owner, id, old_machine); // update/history not atomic
```

#### Correct

```rust
let mut tx = pool.begin().await?;
let row = select_cdk_for_update(&mut tx, owner, code).await?;
update_binding_and_insert_history(&mut tx, &row, new_machine, client_ip).await?;
tx.commit().await?;
registry.invalidate_binding(owner, row.id, old_machine);
```
