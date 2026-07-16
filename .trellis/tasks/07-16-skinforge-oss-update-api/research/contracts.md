# SkinForge OSS 分发契约调研

## Tauri v2

官方文档：https://v2.tauri.app/zh-cn/plugin/updater/

- 动态 endpoint 支持 target、arch 和 current_version 变量。
- 无更新返回 204。
- 有更新返回顶层 `version`、`url`、`signature`，可带 `notes`、`pub_date`。
- 不能使用 cdk-server 常规 `{success,data}` envelope 包裹 Tauri 响应。

## 云文档

SkinForge `main.js` 和 `src-tauri/src/bin/upload.rs` 证明：

- `file_id/link_id` 是可持久化标识；
- download API 可换取 OSS URL；
- URL 带 `Expires/Signature`，必须按需刷新；
- 上传流程为 create_update → PUT object → create file → get download URL。

## 服务端迁移约束

- 当前 Hash 同步把 canonical TXT、gzip 和 metadata 写入 Nginx 静态目录。
- 新实现保留目录作为 staging，但公开事实移到 MySQL 当前 Hash 记录。
- TXT/gzip 两个云文档对象必须成对发布。
- 管理后台已有 JWT、tab/component 和单例公告编辑模式，可复用其路由与 UI 组织，
  但 SkinForge 发布/配置是全局资源，不使用 `created_by` 隔离。
