# CDK Binding History and Realtime Invalidation

## Scenario: Single-machine CDK rebind

### 1. Scope / Trigger

Read this spec when changing the tenant activate route, `cdkeys.machine_code`, CDK
binding history, the cross-CDK multi-device overview, the client WebSocket
endpoint, Nginx `/api/` proxying, or the in-memory connection registry. A
successful rebind crosses a MySQL transaction and an online notification;
database commit order is the security boundary.

### 2. Signatures

```text
POST /api/client/u/{username}/activate
GET  /api/client/u/{username}/cdk-events  (WebSocket)
GET  /api/cdk/{cdk_id}/binding-history?page=1&page_size=50  (JWT admin)
GET  /api/cdk/multi-device-bindings?page=1&page_size=20&search=...  (JWT admin)
GET  /api/cdk/stats  (JWT admin)

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

The WebSocket transport and reverse-proxy capacity settings are:

```text
Axum read/write buffer:       8 KiB per connection
Axum max write/frame/message: 64 KiB
Nginx worker_connections:     8192 per worker
Required process nofile:      greater than 2 * expected proxied WebSockets
```

### 3. Contracts

- `POST /api/client/u/{username}/validate` and
  `POST /api/client/u/{username}/activate` both require the flat JSON fields
  `code`, `machine_code`, and SemVer `version`. Both reject versions below the
  shared `MIN_CLIENT_VERSION` (`2.5.3`) before any database query or activation
  side effect. Legacy generic/admin activation routes are not exposed.
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
  and message maximum, 8KB read/write buffers, a 64KB maximum write buffer, no
  durable message queue, and no cross-instance delivery. Keep the explicit 8KB
  buffers: Tungstenite otherwise eagerly allocates its 128KB default read buffer
  for every idle socket.
- The WebSocket handshake requires a non-null future `expires_at`. Each accepted
  socket owns a Tokio deadline for that timestamp; when it fires, re-read the
  binding once. A concurrent extension resets the deadline, while expiration,
  disable, rebind, or ban emits the existing v1 envelope with reason
  `expired` / `disabled` / `rebound` / `banned` and closes every targeted socket.
  Do not replace this with fixed-interval per-connection CDK queries.
- Online duration is deduplicated by `(owner_id, machine_code)`, even though
  invalidation and online-device counting remain keyed by
  `(owner_id, cdk_id, machine_code)`. The first socket starts usage and the last
  socket ends it; overlapping reconnects never double-count time.
- Pong handling checkpoints at most once per device every five minutes into
  `cdk_usage_daily`. Store one additive row per owner/machine/Asia-Shanghai day,
  split intervals at China midnight, flush the final tail on disconnect, and
  expose the unpersisted in-memory tail in `machine-usage`. Never persist each
  Ping/Pong or infer new online duration from `usage_logs` request gaps.
- `cdk_usage_daily` and `usage_logs` retain 365 days. Schema changes remain
  synchronized in `db.rs`, numbered migrations, and MySQL init SQL.
- Nginx terminates the public connection and opens a separate upstream connection,
  so one proxied WebSocket consumes roughly two Nginx connection slots. The image
  must raise Debian's packaged `worker_connections 768` default to 8192 and fail
  its build if that replacement no longer matches. Do not lower a larger container
  `nofile` limit merely to mirror this application minimum.
- The socket is inserted into the registry before a post-upgrade binding query.
  If rebind committed before insertion, the second query closes it; if rebind
  commits after insertion, registry invalidation reaches it. Do not remove this
  second check or the pre-upgrade-check/registration race reappears.
- Schema changes stay synchronized in `backend/src/db.rs`, the numbered manual
  migration, and `deploy/mysql-init/01_schema.sql`.
- The admin binding-history route resolves the JWT username to `users.id`, then
  checks `cdkeys.id = cdk_id AND created_by = owner` before reading history.
  Unknown and cross-tenant IDs both return `CDK 不存在`; never reveal whether
  another tenant owns the requested numeric ID.
- Binding-history metrics come only from committed `cdk_binding_history` rows.
  `binding_count` counts all rows, `rebind_count` counts `event_type = rebind`,
  and a machine's recorded binding count groups rows where it is
  `new_machine_code`. Do not derive these values from `usage_logs`, which also
  contains failed/mismatched validation attempts.
- Machine membership is the distinct union of every non-null
  `old_machine_code` and `new_machine_code`. This preserves pre-history bindings:
  a legacy first row `A -> B` proves that both A and B used the CDK even though
  there is no earlier `NULL -> A` row.
- A machine summary exposes `binding_count_complete`. It is complete when its
  first evidence is a `new_machine_code` event; it is incomplete when the first
  evidence is an older `old_machine_code` event or no new-target event exists.
  The UI must render incomplete counts as `历史记录，次数未知`, never as a
  fabricated zero or one.
- The history response exposes `summary`, `machines`, `events`, and `pagination`.
  `summary.current_machine_code` comes from `cdkeys`; events use stable
  `created_at DESC, id DESC` ordering with page size default 50 and maximum 100.
  Machine summaries return at most the 100 most recently bound machines while
  `summary.machine_count` retains the complete distinct count. The desktop UI
  must label the metric `成功绑定次数` and disclose when machine rows are truncated.
- The multi-device overview returns only owned CDKs whose old/new machine union
  has at least two distinct values and whose committed `rebind` history count is
  at least 6 (`rebind_count > 5`) and strictly greater than that CDK's distinct
  machine count (`rebind_count > machine_count`). Both thresholds belong in the
  shared server-side query used by total and data queries; never filter only the
  current frontend page. Current CDK status is not a filter. The endpoint is
  tenant-scoped by the JWT owner, defaults to 20 rows, clamps page and page size
  to 1 and 100, and rejects search text over 256 characters. Search matches the
  CDK code, current machine, or either side of any historical binding row.
  Ordering is stable: `last_bound_at DESC, machine_count DESC, cdk_id DESC`.
- The multi-device overview is a bounded summary, not a second full-history
  response. It returns the current machine, distinct machine count, successful
  binding count, rebind count, and latest binding time; the existing protected
  binding-history route remains the source for the complete machine/event detail.
- Client IP is admin-only audit data. It may appear in the JWT-protected history
  timeline, but must not enter public client responses or WebSocket events.
- `GET /api/cdk/stats` returns `online_devices` in addition to the persisted CDK
  status counts. Resolve the JWT username to `owner_id`, then count the registry's
  unique `(owner_id, cdk_id, machine_code)` keys for that owner. Never expose the
  raw global `connection_count`: one binding may have overlapping reconnects or
  multiple sockets, and it would also mix tenants.
- `online_devices` is a request-time snapshot of the current Axum instance only.
  It is not durable, does not aggregate multiple server instances, and must not be
  inferred from `usage_logs`, binding history, or activated CDK rows. The desktop
  CDK overview refreshes it on page load and manual refresh; `MobileCdk` does not
  consume it.

### 4. Validation & Error Matrix

| Condition | Result |
|---|---|
| tenant validate/activate omits `version` | JSON rejection; handler and database are not reached |
| tenant validate/activate has malformed SemVer | HTTP 400 `客户端版本号格式无效` |
| tenant validate/activate version is below `2.5.3` | HTTP 400 `客户端版本过低，最低要求版本 2.5.3` |
| missing/blank CDK or HWID | HTTP 400 |
| CDK > 64 chars or HWID > 256 chars | HTTP 400 |
| unknown tenant/binding, wrong machine, disabled/expired CDK | WebSocket 401 without detail |
| banned current machine | WebSocket 401 / activation error |
| connected CDK reaches `expires_at` without extension | `expired` event and close at deadline |
| connected CDK is extended before its old deadline check commits | deadline resets to new expiry |
| admin disables an online CDK | commit, `disabled` event, close, final usage flush |
| admin bans an online machine | insert ban, `banned` event, close, final usage flush |
| same-machine activation | existing success response; no new history/event |
| history insert fails | transaction rolls back; no success/event |
| registry at 3000 | upgrade closes with 1013; no registry growth |
| client sends text/binary business data | close 1008 |
| packaged Nginx default no longer matches the Dockerfile replacement | image build fails at the post-replacement assertion |
| deployed Nginx still reports `worker_connections 768` | image was not rebuilt/recreated; do not publish the WS-dependent client |
| history CDK does not exist or belongs to another tenant | admin HTTP 404 `CDK 不存在` |
| history page is 0 / page size is 0 | clamp both to 1 |
| history page size exceeds 100 | clamp to 100 |
| CDK exists but has no history rows | success with zero counts and empty arrays |
| legacy first history row is `A -> B` | machine count is 2; A shows `binding_count_complete = false` |
| multi-device search exceeds 256 characters | admin HTTP 400 |
| multi-device page is 0 / page size is 0 | clamp both to 1 |
| multi-device page size exceeds 100 | clamp to 100 |
| tenant has no CDK used by two machines | success with empty items and zero total |
| multi-device CDK has 5 committed rebind rows | exclude it from items and total |
| multi-device CDK has at least 6 rebind rows but `rebind_count <= machine_count` | exclude it from items and total |
| multi-device CDK has at least 6 rebind rows and `rebind_count > machine_count` | include it regardless of current activated/expired/disabled status |
| another tenant has a multi-device CDK | exclude it from results and search |
| tenant has no registered WebSocket keys | `online_devices = 0` |
| one binding has multiple registered connections | `online_devices` counts it once |
| other tenants have registered connections | exclude them from the current JWT user's count |

### 5. Good / Base / Bad Cases

- Good: SkinForge `2.5.3` sends the same compile-time version on validate and
  activate, so either authorization path passes the same minimum-version gate.
- Bad: validating the version only in `user_validate` lets an old client call
  `user_activate`, receive `valid`, and enter the main UI without validation.
- Good: A is locked, updates to B, writes `A -> B`, commits, then invalidates only A.
- Good: concurrent A -> B and B -> C requests serialize and write ordered history.
- Good: 600 idle sockets use the explicit 8KB read buffer and fit beneath the
  Nginx 8192-slot reverse-proxy limit with ordinary HTTP headroom.
- Base: initial activation writes `NULL -> A`; repeated activation on A is idempotent.
- Base: keep a container `nofile` value above the required connection count when
  the runtime already supplies a higher limit.
- Bad: broadcasting by CDK code lets another tenant/device receive the event.
- Bad: notifying before commit can revoke A even when the binding transaction fails.
- Bad: reading arbitrary `X-Forwarded-For` input records attacker-controlled audit text.
- Bad: treating `MAX_CONNECTIONS = 3000` as sufficient while Nginx still allows
  only 768 connections per worker.
- Good: A -> B -> A produces machine A count 2, machine B count 1, binding count
  3, and rebind count 2; current machine A is marked from `cdkeys`.
- Good: a legacy first event A -> B makes the CDK eligible for the multi-device
  machine-membership aggregation and lists both machines; A's count is labeled
  unknown/incomplete. It enters the overview list only when it has at least six
  committed rebind events and its rebind count is greater than its machine count.
- Good: an expired CDK with six committed rebind rows and two historical machines
  remains visible because current status is descriptive data, not a filter.
- Base: a multi-device CDK with exactly five committed rebind rows is absent from
  both paged items and the pagination total.
- Base: a CDK with six committed rebind rows and six historical machines is absent
  from both paged items and the pagination total because the comparison is strict.
- Good: a fully recorded `NULL -> A`, then `A -> B`, lists both machines with
  complete per-machine binding counts.
- Base: a pre-history CDK returns its current `cdkeys.machine_code` with zero
  history counts rather than fabricating an activation event.
- Bad: querying history by `cdk_id` without `created_by` lets one tenant enumerate
  another tenant's machine codes and client IPs.
- Bad: counting `usage_logs` labels failed guesses and periodic validation calls
  as successful CDK usage.
- Bad: counting only `new_machine_code` hides A from a legacy first row A -> B
  and incorrectly excludes the CDK from the multi-device overview.
- Good: two connections under one `(owner, cdk, machine)` key plus one other key
  for that owner produce `online_devices = 2`.
- Base: after the last connection for a key is removed, the next stats snapshot
  no longer counts that key.
- Bad: returning global `connection_count` overcounts reconnects and leaks
  cross-tenant operational data.

### 6. Tests Required

- Version boundary unit tests: malformed, `2.5.2`, prerelease below `2.5.3`,
  exact `2.5.3`, and a higher version.
- Request-contract test: tenant activation without `version` fails to
  deserialize; a complete request preserves the nested activation payload.
- Protocol serialization: assert v1/type/reason and absence of credential fields.
- Registry: targeted multi-connection invalidation, idempotent cleanup, and 3000 cap.
- Registry usage: overlapping sockets and different CDKs on one machine count
  one interval; five-minute checkpoints rate-limit writes; failed checkpoints
  can restore the in-memory cursor.
- Usage interval unit tests: empty/reversed intervals and Asia/Shanghai midnight
  splitting. Database integration should assert additive upsert and 365-day cleanup.
- Integration race: pause between pre-upgrade validation and registry insertion,
  commit a rebind, then assert the post-upgrade check closes the stale socket.
- Header parsing: required/bounded credentials and literal IPv4/IPv6 `X-Real-IP`.
- Database integration when a test MySQL is available: unused, same machine,
  disabled, expired, rebind, concurrent rebind, and history failure rollback.
- Deployment probe: existing HTTP endpoint still works and WebSocket returns 101
  through Nginx; then verify old connection receives exactly one invalidation.
- Image probe: build the final Docker stage and assert `nginx -T` reports
  `worker_connections 8192`; check `ulimit -n` remains above twice the planned
  proxied WebSocket count.
- Capacity probe: hold 600 authenticated idle sockets for at least 15 minutes;
  record Rust RSS before/after, verify heartbeats remain stable, and verify RSS
  returns near baseline after disconnecting all clients.
- Admin history unit tests: default/min/max pagination and current-machine mapping.
- Admin aggregation unit tests: old/new union SQL contract, matching count/data
  placeholder order, multi-device pagination bounds, and complete/incomplete
  legacy machine-count classification.
- Admin history integration tests when MySQL is available: empty history,
  activate A, A -> B -> A aggregation, stable event paging, client IP/null IP,
  and cross-tenant ID returning the same 404 as an unknown ID.
- Admin multi-device integration tests when MySQL is available: legacy A -> B,
  five-vs-six rebind boundary, rebind-count-vs-machine-count less/equal/greater
  boundaries, status independence, tenant isolation, code/current/history search,
  total/data consistency, and stable paging.
- Frontend checks: exact snake_case DTO fields, current-machine badge, successful
  binding count label, empty/error/loading states, event paging, long HWID/IP
  rendering, and the 100-machine truncation notice. `MobileCdk` remains unchanged.
- Registry online-count unit test: same key with two connections counts once,
  different keys for one owner count separately, another owner is excluded, and
  removing the final connection drops the key from the count.
- Stats/UI checks: `online_devices` is present in the JWT-protected response and
  the desktop CDK overview renders it; frontend lint/type-check/build pass without
  adding a `MobileCdk` consumer.
- Multi-device UI checks: exact snake_case DTO fields, search/paging/refresh,
  detail-modal reuse, incomplete-count wording, empty/error/loading states, and
  frontend lint/build. `MobileCdk` remains unchanged.

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

#### Wrong

```rust
ws.max_frame_size(64 * 1024).max_message_size(64 * 1024)
// Leaves Tungstenite's eager 128 KiB read allocation on every idle connection.
```

#### Correct

```rust
ws.read_buffer_size(8 * 1024)
    .write_buffer_size(8 * 1024)
    .max_write_buffer_size(64 * 1024)
    .max_frame_size(64 * 1024)
    .max_message_size(64 * 1024)
```

#### Wrong

```rust
// Failed attempts in usage_logs are not successful bindings, and no tenant is checked.
SELECT machine_code, COUNT(*) FROM usage_logs WHERE cdk_code = ? GROUP BY machine_code;
```

#### Correct

```rust
// First prove ownership, then aggregate committed binding history for that owner.
SELECT machine_code FROM cdkeys WHERE id = ? AND created_by = ?;
SELECT new_machine_code, COUNT(*)
FROM cdk_binding_history
WHERE cdk_id = ? AND created_by = ?
GROUP BY new_machine_code
ORDER BY MAX(created_at) DESC
LIMIT 100;
```

The grouped query above is valid only for the recorded `binding_count` of each
new target. It is not sufficient for machine membership or `machine_count`.

#### Wrong

```sql
-- A legacy A -> B row would report only B.
SELECT COUNT(DISTINCT new_machine_code)
FROM cdk_binding_history
WHERE cdk_id = ? AND created_by = ?;
```

#### Correct

```sql
-- Both sides of a successful transition are evidence of machine usage.
SELECT COUNT(DISTINCT machine_code)
FROM (
  SELECT new_machine_code AS machine_code
  FROM cdk_binding_history
  WHERE cdk_id = ? AND created_by = ?
  UNION
  SELECT old_machine_code AS machine_code
  FROM cdk_binding_history
  WHERE cdk_id = ? AND created_by = ? AND old_machine_code IS NOT NULL
) machines;
```

#### Wrong

```typescript
// Filtering one fetched page corrupts pagination totals and can hide later matches.
const items = response.data.items.filter((item) => item.rebind_count > 5);
```

#### Correct

```sql
-- Put both the fixed threshold and the cross-aggregate comparison in the shared
-- query consumed by the count query and the paged data query.
SELECT created_by, cdk_id,
       COUNT(CASE WHEN event_type = 'rebind' THEN 1 END) AS rebind_count
FROM cdk_binding_history
WHERE created_by = ?
GROUP BY created_by, cdk_id
HAVING COUNT(CASE WHEN event_type = 'rebind' THEN 1 END) >= 6;

-- After joining the machine and history aggregates:
WHERE c.created_by = ?
  AND history_stats.rebind_count > device_stats.machine_count;
```

#### Wrong

```rust
// Raw sockets overcount reconnects and include every tenant.
let online_devices = registry.connection_count();
```

#### Correct

```rust
// The protected stats handler has already resolved the JWT tenant.
let online_devices = registry.online_device_count(owner_id);
// Registry implementation counts matching unique connection-map keys.
```

#### Wrong

```rust
// user_activate can authorize the UI but skips the client-version gate.
activate_for_owner(&state, owner_id, payload, client_ip).await
```

#### Correct

```rust
validate_client_version(&payload.version)?; // before tenant lookup or writes
activate_for_owner(&state, owner_id, payload.activate, client_ip).await
```
