# SkinForge OSS 更新分发接口 — 技术设计

## 1. 模块边界

新增或重构：

- `kdocs`：配置解密、配置验证、流式上传、换链和 URL cache。
- `skinforge_release` handler/model：后台当前发布管理和公开 Tauri endpoint。
- `skinforge_settings` handler/model：云文档配置状态与更新。
- `hash_sync`：从“下载并写 Nginx”改为“staging + 云文档成对发布”。
- `skinforge_hash` handler/model：后台同步状态和公开 Hash metadata。
- 管理后台新增一个“SkinForge”tab，包含云文档配置、软件发布和 Hash 同步三块。

项目当前没有 service layer。`kdocs` 和 Hash controller 属于需要被后台 handler、公开
handler 和后台任务共同复用的基础设施，可作为独立 Rust 模块；简单 SQL 仍留在
handler/hash sync 中。

## 2. AppState 与配置

`AppState` 扩展为共享：

- MySQL pool；
- JWT secret；
- `KdocsService`（含 URL cache）；
- `HashSyncController`（互斥状态与状态快照）。

服务端环境变量：

- `KDOCS_CREDENTIAL_KEY`：Base64 编码的 32-byte AES-256-GCM 主密钥，必填；
- `SKINFORGE_HASH_SOURCE_URL`：保留现状；
- `SKINFORGE_HASH_MIRROR_DIR`：作为持久化 staging；
- `SKINFORGE_HASH_SYNC_INTERVAL_HOURS`：默认 24。

删除 `SKINFORGE_HASH_PUBLIC_BASE_URL` 的运行时用途。

主密钥缺失或格式错误应在启动阶段明确失败，避免服务以“无配置”运行并掩盖已有密文
无法解密的问题。

## 3. 数据库

### `skinforge_kdocs_settings`

单例 `id = 1`：

- `cookie_ciphertext` MEDIUMTEXT：Base64 密文；
- `cookie_nonce` VARCHAR：Base64 12-byte nonce；
- `cookie_hint` VARCHAR：不可逆/脱敏展示；
- `group_id` BIGINT UNSIGNED；
- `parent_id` BIGINT UNSIGNED；
- `updated_by` BIGINT；
- `updated_at` DATETIME。

AES-GCM 使用固定版本化 AAD，例如 `cdk-server:kdocs-settings:v1`。更新时生成随机
nonce。GET 接口永不返回密文、nonce 或明文。

### `skinforge_releases`

单例 `id = 1`：

- version、notes、pub_date、signature；
- file_id、link_id、link_url、file_name、file_size、sha1、sha256；
- updated_by、updated_at。

只保留当前记录。POST 在事务内读取当前版本并再次比较 SemVer，防止并发窗口中两个
请求都通过预览校验。建议 `SELECT ... FOR UPDATE` 后 upsert。

### `skinforge_hash_releases`

单例 `id = 1`，包含：

- upstream version/etag/source；
- canonical size/SHA-256；
- TXT file/link/name/size/SHA-256；
- gzip file/link/name/size/SHA-256；
- published_at。

公开 API 只从该表读取，因此 staging 半成品不可见。

### `skinforge_hash_sync_status`

单例，持久化：

- last_attempt_at、last_success_at；
- last_error；
- last_candidate_version；
- updated_at。

`running` 是进程内状态，重启后始终 false。该表让最近错误和成功时间跨重启可见。

所有表同时更新 `db.rs` startup create、编号 migration 和
`deploy/mysql-init/01_schema.sql`。

## 4. 云文档配置 API

受 JWT 保护：

```text
GET  /api/skinforge/kdocs-settings
POST /api/skinforge/kdocs-settings
```

GET 返回：

```json
{
  "success": true,
  "data": {
    "configured": true,
    "cookieHint": "wps_sid=****abcd",
    "groupId": "2144952871",
    "parentId": "541664465686",
    "updatedBy": "username",
    "updatedAt": "..."
  }
}
```

POST 接收完整 Cookie 和目录 ID。保存前：

1. Cookie 非空并可解析非空 csrf；
2. ID 为有效正整数；
3. 使用云文档已知 pre-check API 验证凭证/目录；
4. 验证成功后加密并事务 upsert；
5. 清空 OSS URL cache。

验证失败保留旧配置。日志只能写操作阶段和脱敏标识，不能打印 Cookie、请求 header
或云文档完整错误 body 中可能出现的凭证。

## 5. KdocsService

通用方法：

- `load_settings(pool)`：读取并解密；
- `validate_settings(candidate)`；
- `upload_file(path, file_name)`：流式两遍扫描/上传；
- `resolve_download_url(file_id, link_id)`；
- `resolve_cached_download_url(artifact_key)`；
- `probe_download_url(url, expected_size)`。

上传不能把 200 MB TXT 放入内存：

1. 第一遍流式计算大小、SHA-1、SHA-256；
2. create_update；
3. 通过 async file stream PUT object；
4. create file；
5. 返回 file/link ID 和摘要。

URL cache 只存在内存。以 `(file_id, link_id)` 为 key，解析 `Expires`；5 分钟刷新
窗口规则按 PRD 执行。设置或发布切换时失效相关 cache。

## 6. 软件发布后台与动态 API

受 JWT：

```text
GET  /api/skinforge/release
POST /api/skinforge/release
```

POST body 是浏览器解析后的 manifest 加 `notes`。服务端验证 schema、平台、SemVer
严格递增、摘要/文件名、目录一致性，并成功换链探测后在事务中覆盖单例记录。

公开：

```text
GET /api/client/skinforge/update/{target}/{arch}/{current_version}
```

- 只支持 windows/x86_64；
- 无发布、平台不支持、客户端已最新：204；
- current_version 非法：400；
- 换链失败：503；
- 有更新：Tauri 原生顶层 JSON，不使用 envelope。

需要给 `AppError` 增加 503 映射，或由该 handler 显式构造响应。

## 7. Hash staging 与成对发布

保留现有 mirror volume，但不再由 Nginx 暴露。

本地文件：

- canonical TXT；
- gzip；
- candidate metadata；
- pending upload record（可分别记录 TXT/gzip 已上传的 file/link ID）。

同步流程：

1. 进程级 `try_start`；正在运行则返回/记录“正在同步”。
2. HEAD CommunityDragon。
3. 若本地 candidate 已对应同一上游版本且校验有效，复用；否则下载、验证并原子替换
   staging candidate。
4. 确保 gzip 与 candidate 对应，计算 gzip 大小/SHA。
5. 读取 pending record：
   - 已上传且记录与当前 candidate 摘要一致的 artifact 可复用；
   - 缺少哪个就上传哪个，并原子写回 pending record。
6. TXT/gzip 都有 file/link ID 后，分别换链并探测。
7. 在数据库事务中 upsert `skinforge_hash_releases` 和成功状态。
8. 清除 pending record；旧云文档文件不删除。
9. 失败时持久化 last_error，保留 staging/pending，公开 DB 当前版本不变。

启动、周期和手动同步调用同一 controller。手动 API：

```text
GET  /api/skinforge/hash-status
POST /api/skinforge/hash-sync
```

POST 启动后台任务后快速返回 accepted/running 状态，不让 HTTP 请求等待数百 MB 下载。
重复调用不排队。

## 8. Hash 公开 API

```text
GET /api/client/skinforge/hash
```

返回标准 envelope，包含 canonical 元数据和 gzip/identity 两个显式 artifact。
两个 URL 必须来自同一 DB 当前记录。任一换链失败时整个请求返回 503，避免客户端得到
不完整回退组合。

## 9. 管理后台

Dashboard 增加 `skinforge` tab：

- 云文档配置卡：
  - 配置状态、脱敏摘要、group/parent、修改人/时间；
  - 完整 Cookie 输入框（永不预填）；
  - 保存时说明会验证并覆盖。
- 软件发布卡：
  - 当前版本摘要；
  - 本地 `.json` 文件选择；
  - manifest 预览；
  - notes 编辑；
  - 发布确认。
- Hash 同步卡：
  - running、当前已发布版本、last success/error；
  - TXT/gzip 文件/大小/上传状态；
  - 立即同步按钮。

所有操作复用现有 JWT axios client 和 toast。

## 10. Nginx 与部署

- 删除两个 Nginx 配置中的 `/skinforge/` alias/gzip_static location。
- `/api/` 继续代理后端。
- hash mirror volume 继续挂载，仅作为私有 staging。
- Docker 环境增加 `KDOCS_CREDENTIAL_KEY`。
- 更新 DEPLOY/API 文档，移除 scp 静态大文件流程。

## 11. 错误与日志

- 配置错误、manifest 错误：400；
- 版本不递增或同步已运行：409；
- 当前发布/Hash 不存在时按接口语义返回 204 或 404；
- 云文档不可用/无有效 URL：503；
- DB/加密内部故障：500。

Cookie、CSRF、Authorization、完整带签名 OSS URL 不写日志。可记录 file_id、版本、
阶段、大小和耗时。
