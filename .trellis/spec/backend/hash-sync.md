# Hash Dictionary Sync

> Executable contract for mirroring and serving the SkinForge `hashes.game.txt` dictionary.

## Scenario: Mirror and precompress the game hash dictionary

### 1. Scope / Trigger

Read this spec when changing `backend/src/hash_sync.rs`, the `SKINFORGE_HASH_*` environment variables, the `/skinforge/` Nginx location, or the hash mirror volume.

The service must reduce transfer size for gzip-capable clients without changing the URL or breaking clients that only accept the original text file.

### 2. Signatures

Backend lifecycle entry point:

```rust
pub fn spawn_hash_sync(config: HashSyncConfig)
```

Local artifact builder:

```rust
async fn ensure_gzip_file(hash_path: &Path, gzip_path: &Path) -> Result<bool, String>
```

Public HTTP resource:

```text
GET /skinforge/hashes/hashes.game.txt
```

### 3. Contracts

Environment variables:

| Key | Default | Contract |
|---|---|---|
| `SKINFORGE_HASH_SYNC_ENABLED` | `true` | Enables startup and periodic synchronization |
| `SKINFORGE_HASH_SOURCE_URL` | CommunityDragon `hashes.game.txt` | Upstream identity-encoded TXT source |
| `SKINFORGE_HASH_MIRROR_DIR` | `/opt/skinforge-updates/hashes` | Directory containing all hash artifacts |
| `SKINFORGE_HASH_PUBLIC_BASE_URL` | Server `/skinforge/hashes` URL | Written to existing metadata without gzip-specific fields |
| `SKINFORGE_HASH_SYNC_INTERVAL_HOURS` | `24` | Positive synchronization interval |

Files in the mirror directory:

| File | Purpose |
|---|---|
| `hashes.game.txt` | Canonical, uncompressed dictionary and legacy-client fallback |
| `hashes.game.txt.gz` | Precompressed representation of the same bytes |
| `hashes.game.meta.json` | Existing source/version/size/SHA-256 metadata; gzip fields are not required |
| `*.download` / `*.compressing` | Incomplete private artifacts; never served as final files |

Nginx uses `gzip_static on`, not `gzip_static always`. The public URL remains unchanged. A request advertising `Accept-Encoding: gzip` may receive the `.gz` representation with `Content-Encoding: gzip`; a request without gzip capability receives the canonical TXT. Responses vary on `Accept-Encoding`.

### 4. Validation & Error Matrix

| Condition | Required behavior |
|---|---|
| Download smaller than 50 MiB | Delete the temporary download and preserve the previous TXT |
| Download size differs from `Content-Length` | Delete the temporary download and preserve the previous TXT |
| First line is not `16 hex chars + space + path` | Reject the download and preserve the previous TXT |
| Existing gzip is missing, empty, or older than TXT | Rebuild it from the local TXT without redownloading the dictionary |
| Existing gzip is older than TXT | Remove it from the served path before compression so Nginx cannot return stale content |
| gzip compression fails | Remove the temporary gzip; keep the canonical TXT available |
| Final-file rename fails | Restore the previous final file when it is still valid |
| Client does not advertise gzip | Serve uncompressed TXT from the same URL |

### 5. Good / Base / Bad Cases

- Good: a previous deployment already has a current TXT but no gzip; startup creates `.gz` locally and does not issue another GET for the dictionary.
- Base: TXT and gzip are both current; synchronization performs the remote freshness check and skips recompression.
- Bad: a new TXT replaces the old one while the old gzip remains visible; gzip-capable clients can receive bytes for the wrong dictionary version.
- Bad: `gzip_static always` sends compressed bytes to a legacy client that did not advertise gzip support.

### 6. Tests Required

- Unit test gzip creation from an existing TXT and assert `ensure_gzip_file` returns `true`.
- Run it again without changing TXT and assert it returns `false`.
- Decode the `.gz` and assert byte-for-byte equality with the canonical TXT.
- Run `cargo check`, `cargo test`, `cargo fmt --check`, and `cargo clippy` for backend changes.
- Validate both Nginx request modes in deployment testing:
  - with `Accept-Encoding: gzip`, assert `Content-Encoding: gzip`;
  - without it, assert no gzip content encoding and unchanged TXT content.

### 7. Wrong vs Correct

#### Wrong

```nginx
gzip_static always;
```

```rust
// Replacing TXT while leaving the previous .gz publicly visible creates a stale window.
replace_file(new_txt, final_txt)?;
compress_hash_file(final_txt, gzip_path)?;
```

#### Correct

```nginx
gzip_static on;
gzip_vary on;
```

```rust
// An outdated gzip leaves the served path first; clients temporarily fall back to TXT.
remove_outdated_gzip(gzip_path)?;
compress_to_temporary_file(hash_path, gzip_temp_path)?;
replace_file(gzip_temp_path, gzip_path)?;
```
