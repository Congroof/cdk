# SkinForge Delivery API

> Executable contract for encrypted KDocs configuration and dynamic software, Hash, and MOD delivery metadata.

## Scenario: Global OSS-backed SkinForge delivery

### 1. Scope / Trigger

Read this spec when changing `kdocs.rs`, SkinForge handlers/models/tables,
management UI contracts, updater responses, secrets, or Nginx delivery paths.
The handoff-ready MOD consumer/admin contract is maintained in
`docs/SKINFORGE_MOD_INTEGRATION.md`; keep it synchronized with route and DTO changes.

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
GET      https://365.kdocs.cn/3rd/drive/api/v5/files/pic/thumbnail
         ?fileids={comma-separated ids}&review=true&max_edge=260
```

Database resources:

```text
skinforge_kdocs_settings(id=1)
skinforge_releases(id=1)
skinforge_hash_releases(id=1)
skinforge_hash_sync_status(id=1)
skinforge_mods(id=auto increment, unique(file_id, link_id), preview_file_id nullable)
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
- MOD manifest storage boundaries mirror MySQL and JavaScript exactly:
  `linkId` <= 128 characters, `fileName` <= 255 characters, UTF-8 `linkUrl`
  <= 65535 bytes, and `fileSize` is an integer in
  `1..=9007199254740991`. String KDocs IDs must decode to positive `u64`.
- MOD list responses are paginated and may filter by category. Public items
  expose only id, category, filename, size, creation time, and optional
  `previewUrl`; they never expose KDocs IDs or hashes. The current page's
  preview file IDs are resolved in one thumbnail request, signed thumbnail URLs
  are not persisted, and the list response uses `Cache-Control: no-store`.
- `artifact.previewFileId` is optional and stored as `preview_file_id`. Import
  validates only that it is a positive integer; thumbnail availability never
  blocks MOD publication. Whole-request and per-file thumbnail failures degrade
  the affected `previewUrl` values to null.
- MOD download URL requests resolve a fresh signed URL by id and return it in
  the standard success envelope with `Cache-Control: no-store`. MOD deletion
  removes only the database row.
- MOD URL resolution is bounded to 30 seconds; import probing has its own
  30-second bound. The management client allows 70 seconds, staying below
  Nginx's 75-second read timeout while avoiding the shared Axios client's
  10-second default.
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
| MOD resolve/probe exceeds its 30-second stage timeout | HTTP 503; do not insert |
| MOD thumbnail request/individual preview fails | HTTP 200 list; affected `previewUrl` is null |
| Hash public request with either URL unavailable | HTTP 503 |
| Hash DB row missing but complete pending upload exists | Resolve/probe both URLs, publish the pending pair, then return HTTP 200 |

### 5. Good / Base / Bad Cases

- Good: import stable IDs, dynamically resolve a fresh OSS installer URL, and
  let Tauri verify the signature.
- Good: list MOD metadata without resolving URLs, then resolve one fresh URL
  only when the client requests `/mods/{id}/download`.
- Good: batch one page of preview IDs into one thumbnail request and degrade
  preview failures without hiding the MOD records.
- Base: service restarts with the same master key and resumes DB configuration.
- Base: removing a MOD deletes only its database row; reimporting the same JSON
  publishes it again with a new numeric id.
- Bad: store or log Cookie/CSRF/full signed URLs.
- Bad: persist one generated `download_url` as permanent release truth.
- Bad: use per-user release rows for this global resource.
- Bad: resolve every MOD URL during list pagination or expose file/link IDs in
  the public item DTO.
- Bad: persist signed thumbnail URLs or issue one thumbnail request per row.
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
  field whitelist, optional preview ID migration, batched thumbnail mapping,
  partial thumbnail failure, deletion, fresh download URL resolution, and
  no-store headers.
- Database migration plus startup schema parity.
- The ignored MySQL 8 MOD regression must be run explicitly and cover the
  exact filtered/unfiltered COUNT queries, row decoding, duplicate existence
  query, unique constraint, and deletion. A normal `cargo test` that skips the
  ignored test is not sufficient release evidence.
- Start once from a legacy `skinforge_mods` table without `preview_file_id`,
  and once with a production-style `DATABASE_URL` query parameter, then verify
  startup and the public list endpoint both succeed.

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
