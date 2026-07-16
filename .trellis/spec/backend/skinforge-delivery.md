# SkinForge Delivery API

> Executable contract for encrypted KDocs configuration and dynamic software/Hash delivery metadata.

## Scenario: Global OSS-backed SkinForge delivery

### 1. Scope / Trigger

Read this spec when changing `kdocs.rs`, SkinForge handlers/models/tables,
management UI contracts, updater responses, secrets, or Nginx delivery paths.

### 2. Signatures

```text
GET/POST /api/skinforge/kdocs-settings     JWT
GET/POST /api/skinforge/release            JWT
GET      /api/client/skinforge/update/{target}/{arch}/{current_version}
GET      /api/client/skinforge/hash
```

Database singletons:

```text
skinforge_kdocs_settings(id=1)
skinforge_releases(id=1)
skinforge_hash_releases(id=1)
skinforge_hash_sync_status(id=1)
```

### 3. Contracts

- `KDOCS_CREDENTIAL_KEY` is required Base64 for exactly 32 bytes and must remain
  stable across restarts.
- Cookie is AES-256-GCM encrypted with a random 12-byte nonce and versioned AAD.
  GET returns only configured state, hint, directory, editor, and time.
- All authenticated users can edit global KDocs settings, import a global
  Windows x86_64 release, and trigger Hash sync.
- Release import uses schema 1, string file/group/parent IDs, SemVer, RFC3339
  date, signature, size, SHA-1/SHA-256, and non-empty notes.
- Existing release versions may only be replaced by a strictly greater SemVer.
- Stable file/link IDs are persisted; signed OSS URLs are never cached or
  persisted. Every updater or Hash metadata request resolves fresh URLs from
  KDocs.
- Dynamic Tauri response is top-level `version`, `url`, `signature`, `notes`,
  `pub_date`; it is not wrapped in the normal API envelope.
- Nginx proxies `/api/` only and has no `/skinforge/` large-file location.

### 4. Validation & Error Matrix

| Condition | Required behavior |
|---|---|
| Missing/invalid master key | Fail startup explicitly |
| Invalid Cookie/csrf/directory pre-check | HTTP 400; preserve old config |
| Settings GET | Never return plaintext, ciphertext, nonce, csrf, or full Cookie |
| Invalid manifest/platform/digest/date | HTTP 400 |
| Same/lower version | HTTP 409 |
| Unsupported updater target/arch, no release, or already current | HTTP 204 |
| OSS URL resolve failure | HTTP 503; never proxy the large file |
| Hash public request with either URL unavailable | HTTP 503 |
| Hash DB row missing but complete pending upload exists | Resolve/probe both URLs, publish the pending pair, then return HTTP 200 |

### 5. Good / Base / Bad Cases

- Good: import stable IDs, dynamically resolve a fresh OSS installer URL, and
  let Tauri verify the signature.
- Base: service restarts with the same master key and resumes DB configuration.
- Bad: store or log Cookie/CSRF/full signed URLs.
- Bad: persist one generated `download_url` as permanent release truth.
- Bad: use per-user release rows for this global resource.

### 6. Tests Required

- AES-GCM round-trip and wrong-key failure; csrf/hint parsing.
- Every repeated updater/Hash request invokes KDocs URL resolution again.
- KDocs download resolution retries without `get_direct_external_download_url`
  only when direct mode returns `UnSupportFileType` or `unSupport`;
  authentication and other failures must not be hidden by the retry.
- Complete pending Hash uploads recover the DB singleton on a public request.
- Manifest schema/platform/SemVer/digest validation.
- Updater 204/200/400/503 integration matrix.
- Frontend import/config/status build and lint.
- Database migration plus startup schema parity.

### 7. Wrong vs Correct

#### Wrong

```rust
release.download_url = uploaded.download_url;
return redirect_or_proxy_large_file(release.download_url);
```

#### Correct

```rust
let url = kdocs.resolve_download_url(pool, release.file_id, &release.link_id).await?;
return tauri_update_json(release, url);
```
