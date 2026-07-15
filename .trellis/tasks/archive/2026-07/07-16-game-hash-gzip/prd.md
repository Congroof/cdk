# 为 game hash 增加 gzip 静态压缩

## 目标

降低客户端下载 `hashes.game.txt` 时的传输体积和等待时间，同时确保不支持 gzip 的旧客户端继续正常工作。

## 已确认事实

- 当前服务端从 CommunityDragon 同步完整的 `hashes.game.txt`，本地文件约 206 MB。
- 上游同步明确使用 `Accept-Encoding: identity`，因此落盘的是未压缩原文件。
- `/skinforge/` 由 Nginx `alias` 直接提供静态文件，不经过 Axum API。
- 线上响应目前没有 `Content-Encoding: gzip`。
- 现有客户端使用固定 URL `/skinforge/hashes/hashes.game.txt` 获取字典。

## 需求

1. 每次 hash 字典成功更新后，服务端生成与原文件对应的 `hashes.game.txt.gz` 预压缩产物。
2. gzip 产物必须先写临时文件并完成后再替换，避免客户端读取到半成品。
3. 若 gzip 生成失败，不得破坏已验证的原始 `hashes.game.txt`，原文件仍可继续提供下载。
4. Nginx 对 `/skinforge/` 开启 `gzip_static on`，并返回 `Vary: Accept-Encoding`。
5. 客户端请求 URL 保持不变：
   - 声明支持 gzip 时，Nginx 返回预压缩内容和 `Content-Encoding: gzip`；
   - 未声明支持 gzip 时，Nginx 返回原始 TXT。
6. 不使用 `gzip_static always`，避免破坏旧客户端兼容性。
7. 容器构建必须包含生成 gzip 产物所需的运行时依赖。

## 验收标准

- 后端 hash 同步成功后，镜像目录同时存在有效的 `hashes.game.txt` 和 `hashes.game.txt.gz`。
- `.gz` 解压后的内容与 `hashes.game.txt` 完全一致。
- 带 `Accept-Encoding: gzip` 请求原 TXT URL 时响应包含 `Content-Encoding: gzip`。
- 不带 gzip 能力请求同一 URL 时返回未压缩 TXT，旧客户端无需修改。
- hash 文件未更新时，不重复下载上游文件；若 gzip 产物缺失或过期，能够从现有原文件补建。
- 后端编译检查通过，Nginx 配置检查通过或完成等价的静态配置验证。

## 范围外

- 不改变上游 CommunityDragon 下载格式。
- 不改变客户端 URL。
- 不引入增量 hash 字典更新。
- 暂不改变 `hashes.game.meta.json` 的对外字段协议。

## 已确认决策

- 本次不在 `hashes.game.meta.json` 中增加 gzip 文件大小或 SHA-256 字段，保持现有元数据协议不变。
