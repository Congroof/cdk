# Hash Dictionary Sync

> Executable contract for staging and atomically publishing SkinForge Hash artifacts through cloud-document OSS.

## Scenario: Paired TXT/gzip OSS publication

### 1. Scope / Trigger

Read this spec when changing `backend/src/hash_sync.rs`, KDocs upload helpers,
`SKINFORGE_HASH_*`, Hash tables/APIs, or the private mirror volume.

### 2. Signatures

```rust
HashSyncController::new(config, pool, kdocs) -> Arc<HashSyncController>
HashSyncController::spawn_schedule(self: &Arc<Self>)
HashSyncController::trigger(self: &Arc<Self>) -> bool
HashSyncController::management_status(&self) -> Result<HashManagementStatus, String>
```

```text
GET  /api/skinforge/hash-status        JWT
POST /api/skinforge/hash-sync          JWT
GET  /api/client/skinforge/hash        public
```

Database singletons: `skinforge_hash_releases(id=1)` and
`skinforge_hash_sync_status(id=1)`.

### 3. Contracts

| Environment | Default | Contract |
|---|---|---|
| `SKINFORGE_HASH_SYNC_ENABLED` | `true` | Enables startup and interval triggers |
| `SKINFORGE_HASH_SOURCE_URL` | CommunityDragon TXT | Fixed upstream |
| `SKINFORGE_HASH_MIRROR_DIR` | `/opt/skinforge-updates/hashes` | Private staging/pending directory |
| `SKINFORGE_HASH_SYNC_INTERVAL_HOURS` | `24` | Positive interval |

The controller is process-mutual-exclusive across startup, interval, and manual
triggers. Staging holds canonical TXT, gzip, candidate metadata, and an atomic
pending-upload JSON that can independently preserve completed TXT/gzip uploads.

Both file/link ID pairs must resolve to OSS URLs and pass probes before one DB
transaction replaces the public singleton. Nginx never exposes the mirror.
Public metadata returns canonical fields plus explicit gzip/identity artifacts;
both URLs are resolved fresh on every request or the request returns 503. If
the public singleton is missing but staging metadata and a complete pending
TXT/gzip pair exist, the public request resolves and probes both pending files,
publishes the pair transactionally, removes pending, and returns the recovered
release.

### 4. Validation & Error Matrix

| Condition | Required behavior |
|---|---|
| Concurrent trigger | Return false / HTTP 409; do not queue |
| Upstream download below 50 MiB, wrong length, invalid first line | Preserve current DB release |
| One upload fails | Persist completed peer in pending JSON; do not publish |
| One URL resolve/probe fails | Preserve current DB release and pending data |
| Both artifacts valid | Transactionally upsert current release, clear pending |
| DB release missing, complete pending pair valid | Public request recovers and publishes the pair |
| Current candidate already published and both URLs usable | Skip re-upload |
| Service restart | `running=false`; DB status and staging/pending remain usable |

Old cloud files are not deleted automatically.

### 5. Good / Base / Bad Cases

- Good: TXT upload succeeds, gzip fails, next run uploads only gzip and publishes.
- Base: current candidate and both OSS URLs are usable; sync records success.
- Bad: publish TXT fields before gzip upload/probe succeeds.
- Bad: serve staging directly from `/skinforge/` or erase pending files on error.

### 6. Tests Required

- Gzip round-trip matches canonical bytes.
- Pending upload JSON round-trips partial state.
- Verify controller rejects concurrent trigger in integration/manual testing.
- Assert a failed artifact/probe does not update `skinforge_hash_releases`.
- Run `cargo fmt --check`, `cargo test`, `cargo check`, frontend build, and
  `docker compose config`.
- Manual real-Cookie sync must confirm both public URLs download from HTTPS OSS.

### 7. Wrong vs Correct

#### Wrong

```rust
publish_txt_to_database(txt)?;
upload_gzip(gzip)?;
```

#### Correct

```rust
let txt = upload_or_resume_txt()?;
let gzip = upload_or_resume_gzip()?;
probe_both(&txt, &gzip).await?;
publish_pair_in_one_transaction(&txt, &gzip).await?;
```
