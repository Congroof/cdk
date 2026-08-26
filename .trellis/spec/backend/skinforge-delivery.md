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
GET/POST /api/skinforge/mods               JWT
DELETE   /api/skinforge/mods/{id}           JWT
GET      /api/client/skinforge/mods
GET      /api/client/skinforge/mods/{id}/download
```

Database resources:

```text
skinforge_kdocs_settings(id=1)
skinforge_releases(id=1)
skinforge_hash_releases(id=1)
skinforge_hash_sync_status(id=1)
skinforge_mods(id=auto increment, unique(file_id, link_id))
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
- MOD import schema 1 uses product `skinforge-mod`, one manifest per file, and
  category `map`, `skin`, or `accessory`. It reuses the configured KDocs
  directory, validates non-empty file metadata, and probes a fresh URL before
  inserting stable IDs.
- MOD list responses are paginated and may filter by category. Public items
  expose only id, category, filename, size, and creation time; they never expose
  KDocs IDs, hashes, or signed URLs.
- MOD download URL requests resolve a fresh signed URL by id and return it in
  the standard success envelope. MOD deletion removes only the database row.
- Because MOD removal uses `DELETE`, the global CORS method allowlist must keep
  `Method::DELETE`; otherwise the same-origin admin works while cross-origin
  deployments fail at the browser preflight boundary.

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
| Invalid MOD manifest/category/directory | HTTP 400; do not insert |
| Duplicate MOD file/link pair | HTTP 409 |
| Missing MOD on delete/download | HTTP 404 |
| Hash public request with either URL unavailable | HTTP 503 |
| Hash DB row missing but complete pending upload exists | Resolve/probe both URLs, publish the pending pair, then return HTTP 200 |

### 5. Good / Base / Bad Cases

- Good: import stable IDs, dynamically resolve a fresh OSS installer URL, and
  let Tauri verify the signature.
- Good: list MOD metadata without resolving URLs, then resolve one fresh URL
  only when the client requests `/mods/{id}/download`.
- Base: service restarts with the same master key and resumes DB configuration.
- Base: removing a MOD deletes only its database row; reimporting the same JSON
  publishes it again with a new numeric id.
- Bad: store or log Cookie/CSRF/full signed URLs.
- Bad: persist one generated `download_url` as permanent release truth.
- Bad: use per-user release rows for this global resource.
- Bad: resolve every MOD URL during list pagination or expose file/link IDs in
  the public item DTO.
- Bad: register a DELETE handler without adding DELETE to the CORS allowlist.

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
- MOD manifest validation, duplicate constraint, category pagination, public
  field whitelist, deletion, and fresh download URL resolution.
- Database migration plus startup schema parity.

### 7. Wrong vs Correct

#### Wrong

```rust
mod_item.download_url = resolve_download_url(mod_item.file_id).await?;
return list_all_mods_with_signed_urls();
```

#### Correct

```rust
let items = list_public_mod_metadata(pool, page, category).await?;
// Resolve only in GET /mods/{id}/download.
let url = kdocs.resolve_download_url(pool, file_id, &link_id).await?;
```
